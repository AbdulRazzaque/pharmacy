// Utility functions for authentication

export const getToken = () => {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
};

export const setToken = (token) => {
  localStorage.setItem('token', token);
};

export const removeToken = () => {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
};

export const getUserInfo = () => {
  const userInfo = localStorage.getItem('user');
  return userInfo ? JSON.parse(userInfo) : null;
};

export const setUserInfo = (user) => {
  localStorage.setItem('user', JSON.stringify(user));
};

export const removeUserInfo = () => {
  localStorage.removeItem('user');
};
