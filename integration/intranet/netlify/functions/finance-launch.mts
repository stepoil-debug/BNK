import type { Config, Context } from '@netlify/functions';
import { createHash, createHmac, randomBytes } from 'node:crypto';

const REQUIRED_PERMISSION = 'financeiro:controle-bancario';
const LAUNCH_COOKIE = 'step_finance_launch';
const TICKET_LIFETIME_SECONDS = 75;
const PROFILE_TIMEOUT_MS = 12_000;

type UnknownRecord = Record<string, unknown>;

type IntranetIdentity = {
  email: string;
  allowedModules: string[];
  sessionId: string;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function stringArray(...values: unknown[]) {
  for (const value of values) {
    if (!Array.isArray(value)) continue;
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function hasFinancePermission(allowedModules: string[]) {
  const normalized = new Set(allowedModules.map((value) => value.trim().toLowerCase()));
  return normalized.has('*') || normalized.has('financeiro') || normalized.has(REQUIRED_PERMISSION);
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

async function resolveAuthenticatedIntranetUser(request: Request): Promise<IntranetIdentity | null> {
  const requestUrl = new URL(request.url);
  const profileUrl = new URL('/api/auth/profile', requestUrl.origin);

  const forwardedHeaders = new Headers({ Accept: 'application/json' });
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');
  if (authorization) forwardedHeaders.set('authorization', authorization);
  if (cookie) forwardedHeaders.set('cookie', cookie);

  const response = await fetch(profileUrl, {
    method: 'GET',
    headers: forwardedHeaders,
    signal: AbortSignal.timeout(PROFILE_TIMEOUT_MS)
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error(`Falha ao validar sessão corporativa (${response.status}).`);

  const payload = asRecord(await response.json());
  const data = asRecord(payload.data);
  const user = asRecord(payload.user ?? data.user);
  const profile = asRecord(payload.profile ?? data.profile ?? user);

  const email = firstString(profile.email, user.email, data.email, payload.email).toLowerCase();
  const allowedModules = stringArray(
    profile.allowedModules,
    profile.allowed_modules,
    user.allowedModules,
    user.allowed_modules,
    data.allowedModules,
    data.allowed_modules,
    payload.allowedModules,
    payload.allowed_modules
  );

  if (!email || !email.includes('@')) throw new Error('Perfil corporativo sem e-mail válido.');

  const authMaterial = `${authorization ?? ''}|${cookie ?? ''}|${email}`;
  const sessionId = firstString(
    profile.sessionId,
    profile.session_id,
    user.sessionId,
    user.session_id,
    data.sessionId,
    data.session_id,
    payload.sessionId,
    payload.session_id,
    sha256(authMaterial)
  );

  return { email, allowedModules, sessionId };
}

export default async function financeLaunch(request: Request, _context: Context) {
  if (request.method !== 'POST') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' }, 405);
  }

  try {
    const identity = await resolveAuthenticatedIntranetUser(request);
    if (!identity) {
      return json({ code: 'INTRANET_SESSION_REQUIRED', message: 'Sessão corporativa ausente ou expirada.' }, 401);
    }

    if (!hasFinancePermission(identity.allowedModules)) {
      return json({ code: 'FINANCE_PERMISSION_DENIED', message: 'Usuário sem acesso ao Controle Bancário.' }, 403);
    }

    const sharedSecret = Netlify.env.get('FINANCE_SSO_SHARED_SECRET');
    if (!sharedSecret) {
      console.error('FINANCE_SSO_SHARED_SECRET ausente.');
      return json({ code: 'FINANCE_LAUNCH_FAILED', message: 'Integração financeira indisponível.' }, 500);
    }

    const issuedAt = Date.now();
    const ticket = {
      email: identity.email,
      permission: REQUIRED_PERMISSION,
      issued_at: issuedAt,
      expires_at: issuedAt + TICKET_LIFETIME_SECONDS * 1000,
      nonce: randomBytes(32).toString('base64url'),
      session_id: identity.sessionId
    };

    const encodedPayload = Buffer.from(JSON.stringify(ticket), 'utf8').toString('base64url');
    const signature = hmac(sharedSecret, `launch.v1.${encodedPayload}`);
    const cookieValue = encodeURIComponent(`${encodedPayload}.${signature}`);
    const setCookie = [
      `${LAUNCH_COOKIE}=${cookieValue}`,
      'Path=/api/finance/session',
      'HttpOnly',
      'Secure',
      'SameSite=Strict',
      `Max-Age=${TICKET_LIFETIME_SECONDS}`
    ].join('; ');

    return json({ redirectTo: '/financeiro/access' }, 200, setCookie);
  } catch (error) {
    console.error('finance-launch', error);
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return json(
      {
        code: timedOut ? 'INTRANET_PROFILE_TIMEOUT' : 'FINANCE_LAUNCH_FAILED',
        message: timedOut
          ? 'A validação da sessão demorou para responder. Tente novamente.'
          : 'Não foi possível abrir o Controle Bancário.'
      },
      timedOut ? 504 : 500
    );
  }
}

export const config: Config = {
  path: '/api/auth/finance-launch'
};
