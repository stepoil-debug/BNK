import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { FinanceAccess, Profile, UserRole } from '../types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: UserRole | null;
  access: FinanceAccess | null;
  accessError: string;
  loading: boolean;
  isAdmin: boolean;
  canManageMaster: boolean;
  canManageUsers: boolean;
  canEditFinance: boolean;
  requiresFaceEnrollment: boolean;
  refreshAuthState: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [access, setAccess] = useState<FinanceAccess | null>(null);
  const [accessError, setAccessError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadUserData = useCallback(async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setProfile(null);
      setRole(null);
      setAccess(null);
      setAccessError('');
      return;
    }

    const userId = currentSession.user.id;
    const [{ data: profileData }, { data: roleData }, accessResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
      supabase.functions.invoke('finance-access-control', { body: { action: 'me' } })
    ]);

    setProfile((profileData as Profile | null) ?? null);
    setRole((roleData?.role as UserRole | undefined) ?? null);

    if (accessResult.error) {
      setAccess(null);
      setAccessError(accessResult.error.message || 'Não foi possível validar o acesso financeiro.');
      return;
    }

    const payload = accessResult.data as { access?: FinanceAccess; message?: string } | null;
    setAccess(payload?.access ?? null);
    setAccessError(payload?.message ?? '');
  }, []);

  const refreshAuthState = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    await loadUserData(data.session);
    setLoading(false);
  }, [loadUserData]);

  useEffect(() => {
    void refreshAuthState();

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
    setAccess(null);
    setAccessError('');
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const canManageMaster = access?.role === 'owner' && access.can_manage_master;
    const canManageUsers = Boolean(access?.can_manage_users && ['owner', 'master_admin'].includes(access.role));
    const canEditFinance = Boolean(access?.can_edit_finance && access.status === 'active');
    const requiresFaceEnrollment = Boolean(
      access?.biometric_required &&
      ['required', 'capturing', 'recapture_required'].includes(access.biometric_status)
    );

    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      access,
      accessError,
      loading,
      isAdmin: canManageUsers,
      canManageMaster,
      canManageUsers,
      canEditFinance,
      requiresFaceEnrollment,
      refreshAuthState,
      signOut
    };
  }, [session, profile, role, access, accessError, loading, refreshAuthState, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de AuthProvider');
  return context;
}
