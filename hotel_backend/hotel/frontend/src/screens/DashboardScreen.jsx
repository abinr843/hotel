import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAnalytics, getFoodRanking } from '../api/orders';
import Spinner from '../components/Spinner';
import { formatRupee } from '../utils/formatters';
import './DashboardScreen.css';

export default function DashboardScreen() {
  const [analytics, setAnalytics] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsData, rankingData] = await Promise.all([
        getAnalytics(selectedDate || undefined),
        getFoodRanking(),
      ]);
      setAnalytics(analyticsData);
      setRanking(rankingData);
    } catch (err) {
      console.error('Dashboard fetch failed', err);
      setError('Failed to load dashboard data. The server might be unreachable.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalRevenue = parseFloat(analytics?.total_revenue || 0);
  const cashRevenue = parseFloat(analytics?.revenue_by_payment_method?.CASH || 0);
  const upiRevenue = parseFloat(analytics?.revenue_by_payment_method?.UPI || 0);
  const maxRevenue = Math.max(cashRevenue, upiRevenue, 1);

  // Split ranking into top performers and underperformers
  const itemsWithSales = ranking.filter((item) => item.total_qty > 0);
  const itemsWithZeroSales = ranking.filter((item) => item.total_qty === 0);

  // Top 5 performers (highest sales)
  const topPerformers = itemsWithSales.slice(0, 5);
  // Bottom performers: last 5 with sales + all zero-sales items
  const bottomWithSales = itemsWithSales.length > 5
    ? itemsWithSales.slice(-3)
    : [];
  const underperformers = [...bottomWithSales, ...itemsWithZeroSales].slice(0, 5);

  // Check if it's an empty/low-data state
  const hasMinimalData = ranking.length === 0 || itemsWithSales.length === 0;

  if (loading && !analytics && !error) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container p-6" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', color: 'var(--color-text-muted)' }}>
        <div style={{ fontSize: '3rem', opacity: 0.5 }}>⚠️</div>
        <p>{error}</p>
        <button className="btn btn-primary touch-target" onClick={fetchData}>
          🔄 Retry
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard-container p-6">
      {/* Header */}
      <div className="dashboard-top">
        <h1>📊 Daily Sales Overview</h1>
        <div className="dashboard-controls">
          <input
            type="date"
            className="date-picker-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <button className="refresh-btn" onClick={fetchData} disabled={loading}>
            🔄 {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Revenue Cards */}
      <div className="revenue-cards">
        <div className="revenue-card card-total">
          <span className="revenue-card-icon">💰</span>
          <span className="revenue-card-label">Total Sales</span>
          <span className="revenue-card-value">{formatRupee(totalRevenue)}</span>
        </div>
        <div className="revenue-card card-cash">
          <span className="revenue-card-icon">💵</span>
          <span className="revenue-card-label">Cash Collected</span>
          <span className="revenue-card-value">{formatRupee(cashRevenue)}</span>
        </div>
        <div className="revenue-card card-upi">
          <span className="revenue-card-icon">📱</span>
          <span className="revenue-card-label">UPI Collected</span>
          <span className="revenue-card-value">{formatRupee(upiRevenue)}</span>
        </div>
        <div className="revenue-card card-orders">
          <span className="revenue-card-icon">📋</span>
          <span className="revenue-card-label">Orders / Cancelled</span>
          <span className="revenue-card-value">
            {analytics?.total_orders || 0} 
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
              {' '}/ {analytics?.total_voided || 0} cancelled
            </span>
          </span>
        </div>
      </div>

      {/* Food Ranking Panels */}
      <div className="dashboard-panels">
        {/* Top Performers Panel */}
        <div className="panel-card">
          <h2>🏆 Top Performers (24h)</h2>
          {hasMinimalData ? (
            <div className="empty-state">
              <div className="empty-state-icon">📭</div>
              <div className="empty-state-title">No sales data yet</div>
              <div className="empty-state-text">
                Orders placed today will appear here as they are completed.
                Check back once the first few orders roll in!
              </div>
            </div>
          ) : (
            <div className="ranking-list">
              {topPerformers.map((item, idx) => (
                <Link
                  key={item.id}
                  to="/menu"
                  className="ranking-item top-performer-item"
                  title={`Go to Menu → ${item.name}`}
                >
                  <div className="ranking-item-left">
                    <span className={`ranking-rank ${idx < 3 ? 'top-3' : ''}`}>
                      {idx < 3 ? ['🥇','🥈','🥉'][idx] : `#${idx + 1}`}
                    </span>
                    <div>
                      <div className="ranking-name">{item.name}</div>
                      <div className="ranking-category">{item.category}</div>
                    </div>
                  </div>
                  <div className="ranking-item-right">
                    <span className="ranking-qty top-performer-qty">
                      {item.total_qty} sold
                    </span>
                    {!item.is_available && (
                      <span className="ranking-badge unavailable-badge">Unavailable</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Underperformers Panel */}
        <div className="panel-card">
          <h2>📉 Underperformers (24h)</h2>
          {hasMinimalData ? (
            <div className="empty-state">
              <div className="empty-state-icon">🌅</div>
              <div className="empty-state-title">Too early to tell</div>
              <div className="empty-state-text">
                Underperforming dishes will be highlighted here once enough sales data accumulates.
              </div>
            </div>
          ) : underperformers.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🎉</div>
              <div className="empty-state-title">All items are selling!</div>
              <div className="empty-state-text">
                No underperformers to show — every menu item has orders today.
              </div>
            </div>
          ) : (
            <>
              <div className="underperformer-hint">
                💡 Consider dropping these from tomorrow's menu, or toggling them off now.
              </div>
              <div className="ranking-list">
                {underperformers.map((item) => (
                  <Link
                    key={item.id}
                    to="/menu"
                    className="ranking-item underperformer-item"
                    title={`Go to Menu → ${item.name}`}
                  >
                    <div className="ranking-item-left">
                      <span className="ranking-rank underperformer-rank">⚠️</span>
                      <div>
                        <div className="ranking-name">{item.name}</div>
                        <div className="ranking-category">{item.category}</div>
                      </div>
                    </div>
                    <div className="ranking-item-right">
                      <span className={`ranking-qty ${item.total_qty === 0 ? 'ranking-zero' : 'underperformer-qty'}`}>
                        {item.total_qty === 0 ? '0 sold' : `${item.total_qty} sold`}
                      </span>
                      {!item.is_available && (
                        <span className="ranking-badge unavailable-badge">Unavailable</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="dashboard-panels" style={{ marginTop: 'var(--space-xl)' }}>
        <div className="panel-card">
          <h2>💳 Sales by Payment Method</h2>
          <div className="method-bars">
            {[
              { key: 'CASH', label: '💵 Cash', value: cashRevenue, barClass: 'bar-cash' },
              { key: 'UPI', label: '📱 UPI', value: upiRevenue, barClass: 'bar-upi' },
            ].map((method) => (
              <div key={method.key} className="method-bar-item">
                <div className="method-bar-label">
                  <span>{method.label}</span>
                  <span>{formatRupee(method.value)}</span>
                </div>
                <div className="method-bar-track">
                  <div
                    className={`method-bar-fill ${method.barClass}`}
                    style={{ width: `${(method.value / maxRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {analytics?.top_items?.length > 0 && (
            <>
              <h2 style={{ marginTop: 'var(--space-xl)' }}>🔥 Top Sellers Today</h2>
              <div className="ranking-list" style={{ maxHeight: '200px' }}>
                {analytics.top_items.map((item, idx) => (
                  <div key={idx} className="ranking-item">
                    <div className="ranking-item-left">
                      <span className={`ranking-rank ${idx < 3 ? 'top-3' : ''}`}>
                        {idx < 3 ? ['🥇','🥈','🥉'][idx] : `#${idx + 1}`}
                      </span>
                      <div>
                        <div className="ranking-name">{item.name}</div>
                        <div className="ranking-category">{item.category}</div>
                      </div>
                    </div>
                    <span className="ranking-qty">{item.total_qty} × {formatRupee(item.total_revenue)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
