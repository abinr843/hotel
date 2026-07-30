import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { getMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, toggleMenuItemAvailability } from '../api/menu';
import { formatRupee } from '../utils/formatters';
import Button from '../components/Button';
import Modal from '../components/Modal';
import Input from '../components/Input';
import Toggle from '../components/Toggle';
import Spinner from '../components/Spinner';
import './MenuScreen.css';

export default function MenuScreen() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const toast = useToast();

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMenuItems(filterCategory);
      setItems(data);
    } catch (err) {
      toast.error('Failed to load menu items.');
      setError('Failed to load menu items. The server might be unreachable.');
    } finally {
      setLoading(false);
    }
  }, [filterCategory, toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Group items by category for display
  const grouped = items.reduce((acc, item) => {
    const cat = item.category || 'Uncategorized';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  // Extract unique categories for the filter
  const categories = [...new Set(items.map((i) => i.category))].sort();

  const handleToggle = async (item) => {
    try {
      const updated = await toggleMenuItemAvailability(item.id);
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
      toast.success(`${item.name} is now ${updated.is_available ? 'available' : 'unavailable'}.`);
    } catch {
      toast.error('Failed to toggle availability.');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteMenuItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      toast.success(`"${item.name}" deleted.`);
    } catch {
      toast.error('Failed to delete menu item.');
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleSave = async (data) => {
    try {
      if (editingItem) {
        const updated = await updateMenuItem(editingItem.id, data);
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)));
        toast.success(`"${updated.name}" updated.`);
      } else {
        const created = await createMenuItem(data);
        setItems((prev) => [...prev, created]);
        toast.success(`"${created.name}" added to menu.`);
      }
      setShowModal(false);
    } catch (err) {
      const details = err.response?.data?.details;
      // Return errors to the form for inline display
      if (details && typeof details === 'object') {
        return details;
      }
      toast.error(err.response?.data?.message || 'Failed to save menu item.');
      return null;
    }
  };

  return (
    <div className="menu-screen">
      <div className="menu-header">
        <div>
          <h2>Menu Management</h2>
          <p className="text-secondary">{items.length} items in menu</p>
        </div>
        <Button onClick={openAddModal}>+ Add Dish</Button>
      </div>

      {/* Category filter chips */}
      <div className="menu-filters">
        <button
          className={`filter-chip touch-target ${!filterCategory ? 'filter-chip-active' : ''}`}
          onClick={() => setFilterCategory('')}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat}
            className={`filter-chip touch-target ${filterCategory === cat ? 'filter-chip-active' : ''}`}
            onClick={() => setFilterCategory(filterCategory === cat ? '' : cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner size={48} />
      ) : error ? (
        <div className="menu-empty">
          <span className="menu-empty-icon" style={{ opacity: 0.5 }}>⚠️</span>
          <p>{error}</p>
          <Button onClick={fetchItems} className="btn-primary touch-target" style={{ marginTop: 'var(--space-md)' }}>
            🔄 Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="menu-empty">
          <span className="menu-empty-icon">🍽️</span>
          <p>No menu items yet. Add your first dish!</p>
        </div>
      ) : (
        <div className="menu-groups">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="menu-group">
              <h3 className="menu-group-title">{category}</h3>
              <div className="menu-table">
                <div className="menu-table-header">
                  <span>Name</span>
                  <span>Rate</span>
                  <span>Custom</span>
                  <span>Available</span>
                  <span>Actions</span>
                </div>
                {catItems.map((item) => (
                  <div key={item.id} className={`menu-table-row ${!item.is_available ? 'row-unavailable' : ''}`}>
                    <span className="menu-item-name">{item.name}</span>
                    <span className="menu-item-rate">{formatRupee(item.standard_rate)}</span>
                    <span>
                      {item.is_customizable ? (
                        <span className="badge badge-info">Yes</span>
                      ) : (
                        <span className="badge badge-muted">No</span>
                      )}
                    </span>
                    <span>
                      <Toggle
                        id={`toggle-${item.id}`}
                        checked={item.is_available}
                        onChange={() => handleToggle(item)}
                      />
                    </span>
                    <span className="menu-item-actions">
                      <button className="action-btn touch-target edit-btn" onClick={() => openEditModal(item)} title="Edit">
                        ✏️
                      </button>
                      <button className="action-btn touch-target delete-btn" onClick={() => handleDelete(item)} title="Delete">
                        🗑️
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <MenuItemFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSave}
        editingItem={editingItem}
      />
    </div>
  );
}

/* ------------------------------------------------------------------
   Menu Item Form Modal (Add / Edit)
   ------------------------------------------------------------------ */
function MenuItemFormModal({ isOpen, onClose, onSave, editingItem }) {
  const [form, setForm] = useState({ name: '', standard_rate: '', category: '', is_customizable: false });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingItem) {
      setForm({
        name: editingItem.name,
        standard_rate: editingItem.standard_rate,
        category: editingItem.category,
        is_customizable: editingItem.is_customizable,
      });
    } else {
      setForm({ name: '', standard_rate: '', category: '', is_customizable: false });
    }
    setErrors({});
  }, [editingItem, isOpen]);

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Dish name is required.';
    if (!form.category.trim()) e.category = 'Category is required.';
    const rate = parseFloat(form.standard_rate);
    if (isNaN(rate) || rate <= 0) {
      e.standard_rate = 'Rate must be a positive number.';
    } else {
      const parts = String(form.standard_rate).split('.');
      if (parts[1] && parts[1].length > 2) {
        e.standard_rate = 'Rate must have at most 2 decimal places.';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    const payload = {
      ...form,
      standard_rate: parseFloat(form.standard_rate).toFixed(2),
    };
    const serverErrors = await onSave(payload);
    if (serverErrors) {
      // Map backend field errors to form fields
      const mapped = {};
      for (const [key, val] of Object.entries(serverErrors)) {
        mapped[key] = Array.isArray(val) ? val.join(' ') : String(val);
      }
      setErrors(mapped);
    }
    setSaving(false);
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editingItem ? 'Edit Dish' : 'Add New Dish'}>
      <form className="menu-form" onSubmit={handleSubmit}>
        <Input
          id="menu-name"
          label="Dish Name"
          placeholder="e.g., Butter Chicken"
          value={form.name}
          onChange={(e) => handleChange('name', e.target.value)}
          error={errors.name}
        />
        <Input
          id="menu-rate"
          label="Standard Rate (₹)"
          type="number"
          step="0.01"
          min="0.01"
          placeholder="e.g., 250.00"
          value={form.standard_rate}
          onChange={(e) => handleChange('standard_rate', e.target.value)}
          error={errors.standard_rate}
        />
        <Input
          id="menu-category"
          label="Category"
          placeholder="e.g., Main Course, Drinks"
          value={form.category}
          onChange={(e) => handleChange('category', e.target.value)}
          error={errors.category}
        />
        <Toggle
          id="menu-customizable"
          label="Allow customization (rate overrides & special instructions)"
          checked={form.is_customizable}
          onChange={(val) => handleChange('is_customizable', val)}
        />
        <div className="menu-form-actions">
          <Button variant="secondary" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {editingItem ? 'Update Dish' : 'Add Dish'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
