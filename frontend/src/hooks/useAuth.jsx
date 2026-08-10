import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setNavigate } from '../api';

const AuthContext = createContext(null);

// Default landing route for a given role. Used by ProtectedRoute (role gate),
// Login redirect, and Navbar. Pure utility — safe to import anywhere.
export function homeForRole(role) {
  if (role === 'student') return '/student';
  if (role === 'teacher') return '/teacher';
  return '/dashboard'; // admin (and any unknown role)
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Provide navigate to api for SPA redirects on 401
  setNavigate(navigate);

  const refreshUser = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email, password) => {
    const data = await api.post('/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  };

  const register = async (name, email, password, confirm_password) => {
    const data = await api.post('/auth/register', { name, email, password, confirm_password });
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    refreshUser,
    homeForRole,
    isAdmin: user?.role === 'admin',
    isTeacher: user?.role === 'teacher',
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}