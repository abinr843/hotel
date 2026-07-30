import API from './axios';

/**
 * Menu Item CRUD operations.
 */

export async function getMenuItems(category = '') {
  const params = category ? { category } : {};
  const res = await API.get('/menu-items/', { params });
  return res.data;
}

export async function getMenuItem(id) {
  const res = await API.get(`/menu-items/${id}/`);
  return res.data;
}

export async function createMenuItem(data) {
  const res = await API.post('/menu-items/', data);
  return res.data;
}

export async function updateMenuItem(id, data) {
  const res = await API.put(`/menu-items/${id}/`, data);
  return res.data;
}

export async function deleteMenuItem(id) {
  const res = await API.delete(`/menu-items/${id}/`);
  return res.data;
}

export async function toggleMenuItemAvailability(id) {
  const res = await API.patch(`/menu-items/${id}/toggle-availability/`);
  return res.data;
}
