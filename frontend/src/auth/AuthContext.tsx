import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getMe } from '../api/endpoints';
import { clearToken, getToken, setToken } from '../api/client';
import { forgetClub } from '../club/ClubContext';
import type { AuthResponse, User } from '../api/types';

interface AuthState {
  user: User | null;
  loading: boolean; // true while we resolve the stored token via /auth/me
  isAuthenticated: boolean;
  loginWithResult: (res: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getToken()));

  // On load: if a token exists, validate it via GET /api/auth/me.
  useEffect(() => {
    let active = true;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getMe()
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        // token invalid/expired — clear it (client also clears on 401)
        clearToken();
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loginWithResult = useCallback((res: AuthResponse) => {
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    forgetClub(); // don't carry one user's last club into the next login
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      loginWithResult,
      logout,
    }),
    [user, loading, loginWithResult, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
