import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Profile, UserRole } from '../types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  loading: boolean;
  isAdmin: boolean;
  canEditFinance: boolean;
  refreshAuthState: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setProfile(null);
      setRole(null);
      return;
    }

    const userId = currentSession.user.id;
    const [{ data: profileData }, { data: roleData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
    ]);

    setProfile((profileData as Profile | null) ?? null);
    setRole((roleData?.role as UserRole | undefined) ?? null);
  }, []);

  const refreshAuthState = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadUserData(data.session);
    setLoading(false);
  }, [loadUserData]);

  useEffect(() => {
    refreshAuthState();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      await loadUserData(nextSession);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadUserData, refreshAuthState]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setRole(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isAdmin = role === 'super_admin' || role === 'admin';
    const canEditFinance = isAdmin || role === 'finance_editor';
    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      loading,
      isAdmin,
      canEditFinance,
      refreshAuthState,
      signOut
    };
  }, [session, profile, role, loading, refreshAuthState, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}
