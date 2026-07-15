import type { Config, Context } from '@netlify/functions';

const CLEAR_LAUNCH_COOKIE = 'step_finance_launch=; Path=/api/finance/session; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

function noStoreResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': CLEAR_LAUNCH_COOKIE
    }
  });
}

/**
 * A sessão financeira do Supabase é encerrada no frontend antes desta chamada.
 * Este endpoint limpa qualquer ticket de lançamento residual e retorna à
 * Intranet sem encerrar a sessão corporativa principal.
 */
export default async function financeSessionLogout(request: Request, _context: Context) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0',
        'Set-Cookie': CLEAR_LAUNCH_COOKIE
      }
    });
  }

  return noStoreResponse();
}

export const config: Config = {
  path: '/api/finance/session/logout'
};
