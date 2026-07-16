// frontend/src/api.js
import axios from 'axios';

// ✅ FIX: was hardcoded, so a local .env.local REACT_APP_API_URL override (used
// throughout the quiz components for local dev) was silently ignored here — every
// call through this file always hit production regardless. No-op in the real deployed
// build, where REACT_APP_API_URL is unset and the same fallback applies either way.
const API_URL = process.env.REACT_APP_API_URL || 'https://classvibe-backend.onrender.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
});

// Request interceptor — UNCHANGED
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — UNCHANGED
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 403 || error.response?.status === 401) {
      console.warn('Token expired or invalid - clearing session');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// ============================================
// BACKEND WARM-UP (Render free tier cold start)
// ============================================

/**
 * Ping the backend to wake it up from Render's free-tier sleep.
 * Fire-and-forget — call this on app mount so the server is warm
 * by the time the user submits the login form.
 */
export const pingBackend = async () => {
  try {
    await axios.get(`${API_URL}/health`, { timeout: 60000, withCredentials: true });
  } catch {
    // Ignore — the purpose is just to start the cold-start process
  }
};

// ============================================
// AUTH API CALLS
// ============================================

/**
 * Register a new user.
 * @param {string} email
 * @param {string} password
 * @param {string} name - ✅ For teachers this is now their chosen username
 * @param {string} role
 */
export const register = async (email, password, name = '', role = 'student') => {
  try {
    const response = await api.post('/auth/register', {
      email,
      password,
      // ✅ CHANGED: name and username both come from the chosen username field.
      // For teachers, 'name' is their chosen username (not auto-generated from email).
      // For students, it falls back to the email prefix as before.
      name:     name || email.split('@')[0],
      username: name || email.split('@')[0],
      role
    });
    return response.data;
  } catch (error) {
    console.error('Register API error:', error);
    throw error;
  }
};

export const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  } catch (error) {
    console.error('Login API error:', error);
    throw error;
  }
};

// Used exclusively by the "Open Student Dashboard" feature.
// Registers a new student if the email is new; signs in if the email already exists.
// Does NOT touch the existing /register or /login routes.
export const studentGuestAuth = async (email, password, name) => {
  try {
    const response = await api.post('/auth/student-guest-auth', { email, password, name });
    return response.data;
  } catch (error) {
    console.error('Student guest auth error:', error);
    throw error;
  }
};

// ============================================
// SESSION/GROUP API CALLS — UNCHANGED
// ============================================
export const createGroup = async (groupName) => {
  try {
    const response = await api.post('/groups/create', { groupName });
    return response.data;
  } catch (error) {
    console.error('Create group API error:', error);
    throw error;
  }
};

// ✅ NEW: backing classroom auto-created for "Create New Quiz" when no classroom is open
export const createQuickQuizGroup = async () => {
  try {
    const response = await api.post('/quiz/quick/create-group');
    return response.data;
  } catch (error) {
    console.error('Create quick-quiz group API error:', error);
    throw error;
  }
};

export const joinGroup = async (data) => {
  try {
    const response = await api.post('/groups/join', data);
    return response.data;
  } catch (error) {
    console.error('Join group API error:', error);
    throw error;
  }
};

export const getMyGroups = async () => {
  try {
    const response = await api.get('/groups/my-groups');
    return response.data;
  } catch (error) {
    console.error('Get groups API error:', error);
    throw error;
  }
};

export const getGroupDetails = async (groupId) => {
  try {
    const response = await api.get(`/groups/${groupId}`);
    return response.data;
  } catch (error) {
    console.error('Get group details API error:', error);
    throw error;
  }
};

export const endSession = async (groupId) => {
  try {
    const response = await api.post(`/groups/${groupId}/end`);
    return response.data;
  } catch (error) {
    console.error('End session API error:', error);
    throw error;
  }
};

export const getMessages = async (groupId) => {
  try {
    const response = await api.get(`/groups/${groupId}/messages`);
    return response.data;
  } catch (error) {
    console.error('Get messages API error:', error);
    throw error;
  }
};

// ============================================
// FILE UPLOAD — UNCHANGED
// ============================================
export const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    return await response.json();
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

// ============================================
// SCHEDULE API CALLS — UNCHANGED
// ============================================
export const createScheduledSession = async (payload) => {
  try {
    const response = await api.post('/schedule/create', payload);
    return response.data;
  } catch (error) { console.error('Create scheduled session error:', error); throw error; }
};

export const saveSessionDraft = async (payload) => {
  try {
    const response = await api.post('/schedule/draft', payload);
    return response.data;
  } catch (error) { console.error('Save draft error:', error); throw error; }
};

export const getSessionDrafts = async () => {
  try {
    const response = await api.get('/schedule/drafts');
    return response.data;
  } catch (error) { console.error('Get drafts error:', error); throw error; }
};

export const deleteSessionDraft = async (draftId) => {
  try {
    const response = await api.delete(`/schedule/draft/${draftId}`);
    return response.data;
  } catch (error) { console.error('Delete draft error:', error); throw error; }
};

export const getMySessions = async (status = 'all') => {
  try {
    const response = await api.get(`/schedule/my-sessions?status=${status}`);
    return response.data;
  } catch (error) { console.error('Get my sessions error:', error); throw error; }
};

export const startScheduledSession = async (sessionId) => {
  try {
    const response = await api.post(`/schedule/${sessionId}/start`);
    return response.data;
  } catch (error) { console.error('Start session error:', error); throw error; }
};

export const cancelScheduledSession = async (sessionId) => {
  try {
    const response = await api.post(`/schedule/${sessionId}/cancel`);
    return response.data;
  } catch (error) { console.error('Cancel session error:', error); throw error; }
};

export const verifySessionAccess = async (sessionId, password) => {
  try {
    const response = await api.post(`/schedule/${sessionId}/verify-access`, { password });
    return response.data;
  } catch (error) { console.error('Verify access error:', error); throw error; }
};

export const getAvailableSessions = async () => {
  try {
    const response = await api.get('/schedule/available');
    return response.data;
  } catch (error) { console.error('Get available sessions error:', error); throw error; }
};

export const getUnauthorizedAttempts = async (sessionId) => {
  try {
    const response = await api.get(`/schedule/${sessionId}/unauthorized-attempts`);
    return response.data;
  } catch (error) { console.error('Get unauthorized attempts error:', error); throw error; }
};

// ============================================
// AVATAR API CALLS (see AVATAR_FOUNDATION.md)
// ============================================
export const getAvatar = async () => {
  try {
    const response = await api.get('/avatar');
    return response.data;
  } catch (error) { console.error('Get avatar error:', error); throw error; }
};

export const updateAvatar = async (avatarPatch) => {
  try {
    const response = await api.put('/avatar', avatarPatch);
    return response.data;
  } catch (error) { console.error('Update avatar error:', error); throw error; }
};

export const getAvatarCatalog = async () => {
  try {
    const response = await api.get('/avatar/catalog');
    return response.data;
  } catch (error) { console.error('Get avatar catalog error:', error); throw error; }
};

// ============================================
// PROFILE API CALLS
// ============================================
export const getTeacherProfile = async () => {
  try {
    const response = await api.get('/profile/teacher');
    return response.data;
  } catch (error) { console.error('Get teacher profile error:', error); throw error; }
};

export const updateTeacherProfile = async (profilePatch) => {
  try {
    const response = await api.put('/profile/teacher', profilePatch);
    return response.data;
  } catch (error) { console.error('Update teacher profile error:', error); throw error; }
};

export const getStudentProfile = async () => {
  try {
    const response = await api.get('/profile/student');
    return response.data;
  } catch (error) { console.error('Get student profile error:', error); throw error; }
};

// ============================================
// REWARDS LOCKER API CALLS
// ============================================
export const getRewardsLocker = async () => {
  try {
    const response = await api.get('/rewards/locker');
    return response.data;
  } catch (error) { console.error('Get rewards locker error:', error); throw error; }
};

export const acknowledgeUnlocks = async (itemIds) => {
  try {
    const response = await api.post('/rewards/acknowledge-unlocks', { itemIds });
    return response.data;
  } catch (error) { console.error('Acknowledge unlocks error:', error); throw error; }
};

export default api;