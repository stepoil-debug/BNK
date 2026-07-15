import type { Config, Context } from '@netlify/functions';
import { createHmac, timingSafeEqual } from 'node:crypto';

const REQUIRED_PERMISSION = 'financeiro:controle-bancario';
const LAUNCH_COOKIE = 'step_finance_launch';
const UPSTREAM_TIMEOUT_MS = 12_000;

type LaunchTicket = {
  email: string;
  permission: string;
  issued_at: number;
  expires_at: number;
  nonce: string;
  session_id: string;
};

function clearLaunchCookie() {
  return `${LAUNCH_COOKIE}=; Path=/api/finance/session; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function json(body: unknown, status = 200, clearCookie = false) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (clearCookie) headers.set('Set-Cookie', clearLaunchCookie());
  return new Response(JSON.stringify(body), { status, headers });
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const item of cookieHeader.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0) continue;
    const key = item.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(item.slice(separator + 1).trim());
  }
  return '';
}

function hmac(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left.toLowerCase(), 'utf8');
  const rightBuffer = Buffer.from(right.toLowerCase(), 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseLaunchTicket(rawCookie: string, secret: string): LaunchTicket | null {
  const separator = rawCookie.lastIndexOf('.');
  if (separator <= 0) return null;

  const encodedPayload = rawCookie.slice(0, separator);
  const receivedSignature = rawCookie.slice(separator + 1);
  const expectedSignature = hmac(secret, `launch.v1.${encodedPayload}`);
  if (!secureEqual(receivedSignature, expectedSignature)) return null;

  try {
    const ticket = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as LaunchTicket;
    if (
      !ticket.email?.includes('@') ||
      ticket.permission !== REQUIRED_PERMISSION ||
      !Number.isFinite(ticket.issued_at) ||
      !Number.isFinite(ticket.expires_at) ||
      ticket.expires_at <= Date.now() ||
      ticket.expires_at - ticket.issued_at > 90_000 ||
      typeof ticket.nonce !== 'string' || ticket.nonce.length < 24
    ) {
      return null;
    }
    return ticket;
  } catch {
    return null;
  }
}

export default async function financeSessionBootstrap(request: Request, _context: Context) {
  if (request.method !== 'POST') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' }, 405);
  }

  const financeUrl = Netlify.env.get('FINANCE_SUPABASE_URL')?.replace(/\/$/, '');
  const publishableKey = Netlify.env.get('FINANCE_SUPABASE_PUBLISHABLE_KEY');
  const sharedSecret = Netlify.env.get('FINANCE_SSO_SHARED_SECRET');

  if (!financeUrl || !publishableKey || !sharedSecret) {
    console.error('Variáveis da ponte financeira incompletas.');
    return json({ code: 'FINANCE_BOOTSTRAP_FAILED', message: 'Integração financeira indisponível.' }, 500, true);
  }

  const rawLaunchCookie = readCookie(request, LAUNCH_COOKIE);
  const ticket = parseLaunchTicket(rawLaunchCookie, sharedSecret);
  if (!ticket) {
    return json({ code: 'INTRANET_SESSION_REQUIRED', message: 'Abra o Controle Bancário pelo card da Intranet.' }, 401, true);
  }

  try {
    const rawBody = JSON.stringify(ticket);
    const signature = hmac(sharedSecret, `v1.${rawBody}`);

    const upstream = await fetch(`${financeUrl}/functions/v1/intranet-session-bootstrap`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        apikey: publishableKey,
        'x-step-finance-signature': signature
      },
      body: rawBody,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });

    const responseBody = await upstream.json().catch(() => ({
      code: 'FINANCE_BOOTSTRAP_FAILED',
      message: 'Resposta inválida do serviço financeiro.'
    }));

    return json(responseBody, upstream.status, true);
  } catch (error) {
    console.error('finance-session-bootstrap', error);
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return json(
      {
        code: timedOut ? 'FINANCE_BOOTSTRAP_TIMEOUT' : 'FINANCE_BOOTSTRAP_FAILED',
        message: timedOut
          ? 'O serviço financeiro demorou para responder. Tente novamente pelo card da Intranet.'
          : 'Não foi possível iniciar a sessão financeira.'
      },
      timedOut ? 504 : 500,
      true
    );
  }
}

export const config: Config = {
  path: '/api/finance/session/bootstrap'
};
