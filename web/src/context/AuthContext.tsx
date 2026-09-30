import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, SESSION_EXPIRED_EVENT } from '../api/client';
import type { UserRole } from '../types';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: UserRole;
  /** Email reminder ~24 h before each turn (on by default). */
  emailReminders?: boolean;
  ownedComplexes?: Array<{
    id: string;
    name: string;
    location: string;
    address: string;
  }>;
  linkedComplexes?: Array<{
    id: string;
    name: string;
    location: string;
  }>;
  professorRequests?: Array<{
    id: string;
    complexId: string;
    status: string;
  }>;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; password: string; phone?: string; role: UserRole }) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; email?: string; phone?: string; emailReminders?: boolean }) => Promise<void>;
  refreshUser: () => Promise<void>;
  loginDemo: (role: 'DUEÑO' | 'PROFESOR' | 'JUGADOR') => Promise<User>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = async () => {
    try {
      const res = await api.auth.me();
      setUser(res.user);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  // A request answered 401 mid-use: the session expired, show the app signed out.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    setUser(res.user);
    return res.user;
  };

  const register = async (data: { name: string; email: string; password: string; phone?: string; role: UserRole }) => {
    const res = await api.auth.register(data);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (err) {
      console.error(err);
    }
    setUser(null);
  };

  const updateProfile = async (data: { name?: string; email?: string; phone?: string; emailReminders?: boolean }) => {
    const res = await api.auth.updateProfile(data);
    setUser((prev) => (prev ? { ...prev, ...res.user } : res.user));
  };

  const loginDemo = async (role: 'DUEÑO' | 'PROFESOR' | 'JUGADOR') => {
    let email = 'jugador@padel.com';
    if (role === 'DUEÑO') email = 'dueno@padel.com';
    if (role === 'PROFESOR') email = 'profe@padel.com';

    return login(email, 'padel123');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
        loginDemo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
