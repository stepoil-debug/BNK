function envFlag(value: string | undefined, defaultValue: boolean) {
  if (value == null || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export const financeIntegration = {
  enabled: envFlag(import.meta.env.VITE_INTRANET_INTEGRATION, true),
  allowStandaloneLogin: envFlag(import.meta.env.VITE_ALLOW_STANDALONE_LOGIN, false),
  bootstrapUrl: import.meta.env.VITE_FINANCE_BOOTSTRAP_URL || '/api/finance/session/bootstrap',
  logoutUrl: import.meta.env.VITE_FINANCE_LOGOUT_URL || '/api/finance/session/logout',
  intranetHomeUrl: import.meta.env.VITE_INTRANET_HOME_URL || '/intranet',
  permission: 'financeiro:controle-bancario'
} as const;

export function financeAsset(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}

export function safeInternalReturnTo(value: string | null, fallback = '/dashboard') {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}
