import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

type LocalUser = {
  id: string;
  email: string;
  full_name: string | null;
};

type AuthContextValue = {
  session: { access_token: string } | null;
  user: LocalUser | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  canEditFinance: boolean;
  login: (email: string, password: string, device: unknown) => Promise<{ device_status: string }>;
  refreshAuthState: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'step_bnk_local_session_token';

function normalizeRole(role: string | null | undefined): UserRole | null {
  if (!role) return null;
  return role as UserRole;
}

export function getLocalSessionToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((token: string, payload: any) => {
    const nextUser = {
      id: payload.user_id,
      email: payload.email,
      full_name: payload.full_name ?? null
    };

    setSession({ access_token: token });
    setUser(nextUser);
    setProfile({
      id: payload.user_id,
      email: payload.email,
      full_name: payload.full_name ?? null,
      status: payload.status ?? 'active'
    } as Profile);
    setRole(normalizeRole(payload.role));
  }, []);

  const refreshAuthState = useCallback(async () => {
    setLoading(true);

    if (!isSupabaseConfigured) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.rpc('local_current_user', { p_session_token: token });
    const currentUser = Array.isArray(data) ? data[0] : data;

    if (error || !currentUser) {
      localStorage.removeItem(TOKEN_KEY);
      setSession(null);
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    applySession(token, currentUser);
    setLoading(false);
  }, [applySession]);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const login = useCallback(async (email: string, password: string, device: unknown) => {
    const { data, error } = await supabase.rpc('local_login', {
      p_email: email,
      p_password: password,
      p_device: device
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.session_token) throw new Error('Falha ao gerar sessão local.');

    localStorage.setItem(TOKEN_KEY, result.session_token);
    applySession(result.session_token, result);

    return { device_status: result.device_status as string };
  }, [applySession]);

  const signOut = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token && isSupabaseConfigured) {
      await supabase.rpc('local_logout', { p_session_token: token });
    }
    localStorage.removeItem(TOKEN_KEY);
    setSession(null);
    setUser(null);
    setProfile(null);
    setRole(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = role === 'super_admin' || role === 'admin';
    const canEditFinance = isAdmin || role === 'finance_editor';
    return {
      session,
      user,
      profile,
      role,
      loading,
      isAdmin,
      canEditFinance,
      login,
      refreshAuthState,
      signOut
    };
  }, [session, user, profile, role, loading, login, refreshAuthState, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}
