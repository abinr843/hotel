import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useToast } from '../context/ToastContext';
import { getMenuItems } from '../api/menu';
import { createDraftOrder, cartAction, getOrder, checkoutOrder } from '../api/orders';
import { formatRupee } from '../utils/formatters';
import Spinner from '../components/Spinner';
import ItemCustomizationModal from '../components/ItemCustomizationModal';
import CheckoutModal from '../components/CheckoutModal';
import OrderHistoryPanel from '../components/OrderHistoryPanel';
import './BillingScreen.css';

/**
 * BillingScreen — The main cashier-facing order builder.
 *
 * Left panel: touch-friendly item grid filtered by category (only available items).
 * Right panel: persistent cart with quantity steppers, remove, edit, and live totals.
 *
 * Customizable items open a popup immediately upon tap for rate override + instructions.
 * Non-customizable items add instantly.
 *
 * Uses lazy draft creation, optimistic updates, and debounced network requests.
 */

// ---------------------------------------------------------------------------
// Debounce helper
// ---------------------------------------------------------------------------
function useDebouncedCallback(callback, delay = 300) {
  const timerRef = useRef(null);
  const latestCb = useRef(callback);
  latestCb.current = callback;

  const debounced = useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      latestCb.current(...args);
    }, delay);
  }, [delay]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return debounced;
}

export default function BillingScreen() {
  // --- Menu items ---
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('All');

  // --- Order / cart state ---
  const [order, setOrder] = useState(null);
  const [cartBusy, setCartBusy] = useState(false);

  // --- Modals ---
  const [customizeModal, setCustomizeModal] = useState({ open: false, menuItem: null, editingItem: null });
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Snapshot for rollback
  const orderSnapshotRef = useRef(null);
  const pendingUpdatesRef = useRef({});
  const toast = useToast();

  // Fetch available menu items
  const fetchMenu = useCallback(async () => {
    try {
      setMenuLoading(true);
      const data = await getMenuItems();
      setMenuItems(data.filter((i) => i.is_available));
    } catch {
      toast.error('Failed to load menu items.');
    } finally {
      setMenuLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchMenu(); }, [fetchMenu]);

  // --- Derived data ---
  const categories = useMemo(() => {
    const cats = [...new Set(menuItems.map((i) => i.category))].sort();
    return ['All', ...cats];
  }, [menuItems]);

  const filteredItems = useMemo(() => {
    if (activeCategory === 'All') return menuItems;
    return menuItems.filter((i) => i.category === activeCategory);
  }, [menuItems, activeCategory]);

  const cartLookup = useMemo(() => {
    if (!order?.items) return {};
    const map = {};
    order.items.forEach((oi) => {
      // For non-customized items, map by menu_item id
      // For customized items (with instructions or overridden rate), they get their own line
      if (!map[oi.menu_item]) map[oi.menu_item] = oi;
    });
    return map;
  }, [order]);

  // Aggregate quantity per menu_item for badge display
  const badgeLookup = useMemo(() => {
    if (!order?.items) return {};
    const map = {};
    order.items.forEach((oi) => {
      map[oi.menu_item] = (map[oi.menu_item] || 0) + oi.quantity;
    });
    return map;
  }, [order]);

  const itemCount = order?.item_count || 0;
  const totalAmount = order?.total_amount || '0.00';

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------
  const snapshotOrder = () => {
    orderSnapshotRef.current = order ? JSON.parse(JSON.stringify(order)) : null;
  };

  const rollbackOrder = (message) => {
    toast.error(message);
    if (orderSnapshotRef.current) setOrder(orderSnapshotRef.current);
    orderSnapshotRef.current = null;
  };

  const reconcileFromServer = async (orderId) => {
    try {
      const fresh = await getOrder(orderId);
      setOrder(fresh);
    } catch { /* ignore */ }
  };

  const ensureOrder = async () => {
    if (order) return order;
    const newOrder = await createDraftOrder();
    setOrder(newOrder);
    return newOrder;
  };

  // Debounced quantity flush
  const flushQuantityUpdate = useDebouncedCallback(async (orderId) => {
    const pending = { ...pendingUpdatesRef.current };
    pendingUpdatesRef.current = {};
    for (const [orderItemId, qty] of Object.entries(pending)) {
      try {
        const updated = await cartAction(orderId, 'update', {
          order_item_id: parseInt(orderItemId, 10),
          quantity: qty,
        });
        setOrder(updated);
      } catch (err) {
        rollbackOrder(err.response?.data?.message || 'Failed to update quantity.');
        return;
      }
    }
  }, 350);

  // -----------------------------------------------------------------------
  // Cart Actions
  // -----------------------------------------------------------------------

  /** Handle tile tap — customizable items open popup, others add instantly. */
  const handleTileTap = (menuItem) => {
    if (cartBusy) return;
    if (menuItem.is_customizable) {
      // Open customization modal immediately
      setCustomizeModal({ open: true, menuItem, editingItem: null });
    } else {
      // Standard item — add instantly
      handleAddItem(menuItem);
    }
  };

  /** Add a standard (non-customized) item to the cart. */
  const handleAddItem = async (menuItem, customRate = null, instructions = '', quantity = 1) => {
    if (cartBusy) return;
    snapshotOrder();

    // Optimistic update
    const rate = customRate || menuItem.standard_rate;
    setOrder((prev) => {
      if (!prev) return prev;
      // For customized items, always add a new line
      const hasCustomization = (customRate && parseFloat(customRate) !== parseFloat(menuItem.standard_rate)) || instructions;
      if (!hasCustomization) {
        const existing = prev.items.find((i) => i.menu_item === menuItem.id && !i.special_instructions);
        if (existing) {
          return {
            ...prev,
            items: prev.items.map((i) =>
              i.id === existing.id
                ? { ...i, quantity: i.quantity + quantity, line_total: String(parseFloat(i.snapshot_rate) * (i.quantity + quantity)) }
                : i
            ),
            item_count: prev.item_count + quantity,
            total_amount: String(parseFloat(prev.total_amount) + parseFloat(rate) * quantity),
          };
        }
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            id: Date.now(),
            menu_item: menuItem.id,
            menu_item_name: menuItem.name,
            menu_item_category: menuItem.category,
            is_customizable: menuItem.is_customizable,
            snapshot_rate: rate,
            quantity,
            line_total: String(parseFloat(rate) * quantity),
            special_instructions: instructions,
          },
        ],
        item_count: prev.item_count + quantity,
        total_amount: String(parseFloat(prev.total_amount) + parseFloat(rate) * quantity),
      };
    });

    setCartBusy(true);
    try {
      const currentOrder = await ensureOrder();
      const payload = { menu_item_id: menuItem.id, quantity };
      if (customRate) payload.snapshot_rate = customRate;
      if (instructions) payload.special_instructions = instructions;

      const updated = await cartAction(currentOrder.id, 'add', payload);
      setOrder(updated);
      orderSnapshotRef.current = null;
    } catch (err) {
      if (orderSnapshotRef.current) {
        rollbackOrder(err.response?.data?.message || 'Failed to add item.');
      } else {
        toast.error(err.response?.data?.message || 'Failed to add item.');
        if (order?.id) await reconcileFromServer(order.id);
      }
    } finally {
      setCartBusy(false);
    }
  };

  /** Customization modal confirm handler. */
  const handleCustomizeConfirm = (rate, instructions, quantity) => {
    const { menuItem, editingItem } = customizeModal;
    setCustomizeModal({ open: false, menuItem: null, editingItem: null });

    if (editingItem) {
      // Editing an existing cart item
      handleEditCartItem(editingItem, rate, instructions);
    } else {
      // Adding new customized item
      handleAddItem(menuItem, rate, instructions, quantity);
    }
  };

  /** Edit an existing cart item (rate + instructions). */
  const handleEditCartItem = async (orderItem, newRate, newInstructions) => {
    if (cartBusy || !order) return;
    snapshotOrder();

    // Optimistic
    setOrder((prev) => ({
      ...prev,
      items: prev.items.map((i) =>
        i.id === orderItem.id
          ? {
              ...i,
              snapshot_rate: newRate,
              special_instructions: newInstructions,
              line_total: String(parseFloat(newRate) * i.quantity),
            }
          : i
      ),
      total_amount: String(
        parseFloat(prev.total_amount)
        - parseFloat(orderItem.snapshot_rate) * orderItem.quantity
        + parseFloat(newRate) * orderItem.quantity
      ),
    }));

    setCartBusy(true);
    try {
      const updated = await cartAction(order.id, 'update', {
        order_item_id: orderItem.id,
        quantity: orderItem.quantity,
        snapshot_rate: newRate,
        special_instructions: newInstructions,
      });
      setOrder(updated);
      orderSnapshotRef.current = null;
    } catch (err) {
      rollbackOrder(err.response?.data?.message || 'Failed to update item.');
    } finally {
      setCartBusy(false);
    }
  };

  /** Open edit modal for a cart item. */
  const handleOpenEditModal = (orderItem) => {
    // Find the matching menuItem for the modal header
    const menuItem = menuItems.find((m) => m.id === orderItem.menu_item) || {
      id: orderItem.menu_item,
      name: orderItem.menu_item_name,
      standard_rate: orderItem.snapshot_rate,
      is_customizable: orderItem.is_customizable,
    };
    setCustomizeModal({ open: true, menuItem, editingItem: orderItem });
  };

  /** Update quantity via stepper — debounced. */
  const handleUpdateQuantity = (orderItem, newQty) => {
    if (!order) return;
    if (!orderSnapshotRef.current) snapshotOrder();

    const oldQty = orderItem.quantity;
    const priceDiff = parseFloat(orderItem.snapshot_rate) * (newQty - oldQty);

    if (newQty <= 0) {
      setOrder((prev) => ({
        ...prev,
        items: prev.items.filter((i) => i.id !== orderItem.id),
        item_count: prev.item_count - oldQty,
        total_amount: String(parseFloat(prev.total_amount) - parseFloat(orderItem.snapshot_rate) * oldQty),
      }));
    } else {
      setOrder((prev) => ({
        ...prev,
        items: prev.items.map((i) =>
          i.id === orderItem.id
            ? { ...i, quantity: newQty, line_total: String(parseFloat(i.snapshot_rate) * newQty) }
            : i
        ),
        item_count: prev.item_count + (newQty - oldQty),
        total_amount: String(parseFloat(prev.total_amount) + priceDiff),
      }));
    }

    pendingUpdatesRef.current[orderItem.id] = newQty;
    flushQuantityUpdate(order.id);
  };

  /** Remove item entirely. */
  const handleRemoveItem = async (orderItem) => {
    if (cartBusy || !order) return;
    snapshotOrder();

    setOrder((prev) => ({
      ...prev,
      items: prev.items.filter((i) => i.id !== orderItem.id),
      item_count: prev.item_count - orderItem.quantity,
      total_amount: String(
        parseFloat(prev.total_amount) - parseFloat(orderItem.snapshot_rate) * orderItem.quantity
      ),
    }));

    setCartBusy(true);
    try {
      const updated = await cartAction(order.id, 'remove', { order_item_id: orderItem.id });
      setOrder(updated);
      orderSnapshotRef.current = null;
    } catch (err) {
      rollbackOrder(err.response?.data?.message || 'Failed to remove item.');
    } finally {
      setCartBusy(false);
    }
  };

  /** Checkout handler. */
  const handleCheckout = async (paymentData) => {
    if (!order) return;
    setCheckoutLoading(true);
    try {
      await checkoutOrder(order.id, paymentData);
      toast.success(`Order #${order.id} completed!`);
      setOrder(null); // clear cart
      setCheckoutModalOpen(false);
      orderSnapshotRef.current = null;
      pendingUpdatesRef.current = {};
    } catch (err) {
      throw err; // re-throw so CheckoutModal can display the error
    } finally {
      setCheckoutLoading(false);
    }
  };

  /** Start fresh draft. */
  const handleNewOrder = () => {
    setOrder(null);
    orderSnapshotRef.current = null;
    pendingUpdatesRef.current = {};
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="billing-screen">
      {/* ===== LEFT: Menu Grid ===== */}
      <div className="billing-menu-panel">
        <div className="billing-categories">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`category-tab touch-target ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="billing-grid-area">
          {menuLoading ? (
            <div className="billing-empty"><Spinner size={48} /></div>
          ) : filteredItems.length === 0 ? (
            <div className="billing-empty">
              <span className="billing-empty-icon">🍽️</span>
              <p>No items available in this category.</p>
            </div>
          ) : (
            <div className="billing-grid">
              {filteredItems.map((item) => {
                const badgeQty = badgeLookup[item.id];
                return (
                  <button
                    key={item.id}
                    className={`item-tile touch-target ${badgeQty ? 'in-cart' : ''} ${item.is_customizable ? 'item-tile-customizable' : ''}`}
                    onClick={() => handleTileTap(item)}
                    disabled={cartBusy}
                  >
                    {badgeQty > 0 && (
                      <span className="item-tile-badge">{badgeQty}</span>
                    )}
                    {item.is_customizable && (
                      <span className="item-tile-custom-tag">✎</span>
                    )}
                    <span className="item-tile-name">{item.name}</span>
                    <span className="item-tile-price">{formatRupee(item.standard_rate)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ===== RIGHT: Cart Panel ===== */}
      <div className="billing-cart-panel">
        <div className="cart-header">
          <h3>
            🛒 Cart
            {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
          </h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <button className="cart-new-order-btn touch-target" onClick={() => setHistoryOpen(true)}>📋 History</button>
            {order && <span className="order-id-tag">#{order.id}</span>}
            {order && (
              <button className="cart-new-order-btn touch-target" onClick={handleNewOrder}>+ New</button>
            )}
          </div>
        </div>

        {!order || order.items.length === 0 ? (
          <div className="cart-empty">
            <span className="cart-empty-icon">🧾</span>
            <p>Tap an item from the menu to start building an order.</p>
          </div>
        ) : (
          <div className="cart-items">
            {order.items.map((item) => (
              <div key={item.id} className="cart-item">
                <div className="cart-item-info">
                  <div className="cart-item-name">
                    {item.menu_item_name}
                    {item.is_customizable && (
                      <button
                        className="cart-item-edit-btn touch-target"
                        onClick={() => handleOpenEditModal(item)}
                        title="Edit customization"
                      >
                        ✏️
                      </button>
                    )}
                  </div>
                  <div className="cart-item-price">
                    {formatRupee(item.snapshot_rate)} each
                    {item.special_instructions && (
                      <span className="cart-item-override-badge">customized</span>
                    )}
                  </div>
                  {item.special_instructions && (
                    <div className="cart-item-instructions">
                      📝 {item.special_instructions}
                    </div>
                  )}
                </div>

                <div className="qty-stepper">
                  <button className="qty-btn touch-target qty-btn-minus" onClick={() => handleUpdateQuantity(item, item.quantity - 1)}>−</button>
                  <span className="qty-value touch-target">{item.quantity}</span>
                  <button className="qty-btn touch-target qty-btn-plus" onClick={() => handleUpdateQuantity(item, item.quantity + 1)}>+</button>
                </div>

                <span className="cart-item-total">{formatRupee(item.line_total)}</span>

                <button
                  className="cart-item-remove touch-target"
                  onClick={() => handleRemoveItem(item)}
                  disabled={cartBusy}
                  title="Remove item"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {order && order.items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-summary-row">
              <span className="cart-summary-label">Items</span>
              <span className="cart-summary-value">{itemCount}</span>
            </div>
            <div className="cart-total-row">
              <span className="cart-total-label">Total</span>
              <span className="cart-total-value">{formatRupee(totalAmount)}</span>
            </div>
            <button
              className="cart-checkout-btn touch-target"
              onClick={() => setCheckoutModalOpen(true)}
            >
              Proceed to Checkout →
            </button>
          </div>
        )}
      </div>

      {/* ===== Modals ===== */}
      <ItemCustomizationModal
        isOpen={customizeModal.open}
        onClose={() => setCustomizeModal({ open: false, menuItem: null, editingItem: null })}
        menuItem={customizeModal.menuItem}
        editingItem={customizeModal.editingItem}
        onConfirm={handleCustomizeConfirm}
      />

      <CheckoutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        orderId={order?.id}
        totalAmount={totalAmount}
        itemCount={itemCount}
        items={order?.items || []}
        onCheckout={handleCheckout}
        loading={checkoutLoading}
      />

      <OrderHistoryPanel
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
