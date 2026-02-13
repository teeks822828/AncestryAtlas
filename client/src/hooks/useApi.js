import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
export const UPLOADS_URL = import.meta.env.VITE_UPLOADS_URL || 'http://localhost:3001/uploads';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  google: (credential) => api.post('/auth/google', { credential }),
  getMe: () => api.get('/auth/me'),
};

// Events API
export const eventsApi = {
  getAll: (source) => api.get('/events', { params: source ? { source } : {} }),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  clearGedcom: () => api.delete('/events/gedcom'),
  uploadPhotos: (eventId, formData) => api.post(`/events/${eventId}/photos`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  deletePhoto: (eventId, photoId) => api.delete(`/events/${eventId}/photos/${photoId}`),
  getComments: (eventId) => api.get(`/events/${eventId}/comments`),
  addComment: (eventId, text) => api.post(`/events/${eventId}/comments`, { text }),
  deleteComment: (eventId, commentId) => api.delete(`/events/${eventId}/comments/${commentId}`),
  importGedcom: (formData) => api.post('/events/import-gedcom', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000, // 5 min timeout for geocoding
  }),
  getGedcomTree: () => api.get('/events/gedcom-tree'),
};

// Family API
export const familyApi = {
  createFamily: (data) => api.post('/family/create', data),
  requestJoin: (data) => api.post('/family/request', data),
  getRequests: () => api.get('/family/requests'),
  approveRequest: (id) => api.post(`/family/requests/${id}/approve`),
  denyRequest: (id) => api.post(`/family/requests/${id}/deny`),
  leaveFamily: () => api.post('/family/leave'),
  getMembers: () => api.get('/family/members'),
  getMemberEvents: (id, source) => api.get(`/family/members/${id}/events`, { params: source ? { source } : {} }),
  getAllFamilyEvents: (source) => api.get('/family/events', { params: source ? { source } : {} }),
  setRelationship: (data) => api.post('/family/relationships', data),
  getRelationships: () => api.get('/family/relationships'),
  deleteRelationship: (id) => api.delete(`/family/relationships/${id}`),
  getFamilyTree: () => api.get('/family/tree'),
};

// Notifications API
export const notificationsApi = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// Profile API
export const profileApi = {
  get: () => api.get('/profile'),
  updateName: (name) => api.put('/profile/name', { name }),
  changePassword: (currentPassword, newPassword) =>
    api.put('/profile/password', { currentPassword, newPassword }),
};

export default api;
