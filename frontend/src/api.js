// frontend/src/api.js
import axios from 'axios';

// ✅ Backend API URL
const API_URL = 'https://classvibe-backend.onrender.com';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // ✅ REQUIRED for CORS + auth
});


// Add token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// ============================================
// AUTH API CALLS
// ============================================
export const register = async (email, password, name, role = 'student') => {
  try {
    const response = await api.post('/auth/register', {
      email,
      password,
      name,
      username: email.split('@')[0],
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
    const response = await api.post('/auth/login', {
      email,
      password
    });
    return response.data;
  } catch (error) {
    console.error('Login API error:', error);
    throw error;
  }
};

// ============================================
// SESSION/GROUP API CALLS
// ============================================
export const createGroup = async (groupName) => {
  try {
    const response = await api.post('/groups/create', {
      groupName
    });
    return response.data;
  } catch (error) {
    console.error('Create group API error:', error);
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
// FILE UPLOAD
// ============================================
export const uploadFile = async (file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
};

export default api;