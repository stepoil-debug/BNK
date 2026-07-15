import { useCallback, useEffect, useRef, useState } from 'react';

type FinanceControlLauncherProps = {
  accessToken: string | null;
  onBack: () => void;
};

type LaunchResponse = {
  redirectTo?: string;
  message?: string;
};

const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 350;
const REQUEST_TIMEOUT_MS = 12_000;

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export function FinanceControlLauncher({ accessToken, onBack }: FinanceControlLauncherProps) {
  const started = useRef(false);
  const [opening, setOpening] = useState(true);
  const [error, setError] = useState('');

  const launch = useCallback(async () => {
    setOpening(true);
    setError('');

    if (!accessToken) {
      setOpening(false);
      setError('Sua sessão corporativa não está disponível. Entre novamente na Intranet.');
      return;
    }

    let lastError = 'Não foi possível abrir o Controle Bancário.';

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch('/api/auth/finance-launch', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          credentials: 'include',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });

        const payload = (await response.json().catch(() => ({}))) as LaunchResponse;
        if (!response.ok) {
          lastError = payload.message || `Falha ao validar o acesso financeiro (${response.status}).`;
          if (response.status === 401 || response.status === 403) break;
          throw new Error(lastError);
        }

        const redirectTo = payload.redirectTo;
        if (!redirectTo || !redirectTo.startsWith('/') || redirectTo.startsWith('//')) {
          throw new Error('A Intranet retornou uma rota financeira inválida.');
        }

        window.location.replace(redirectTo);
        return;
      } catch (reason) {
        lastError = reason instanceof Error ? reason.message : lastError;
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
      }
    }

    setOpening(false);
    setError(lastError);
  }, [accessToken]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void launch();
  }, [launch]);

  return (
    <main className="finance-launch-page" aria-busy={opening}>
      <section className="finance-launch-card">
        <span className="finance-launch-eyebrow">Financeiro • Controle Bancário</span>
        <h1>{opening ? 'Abrindo ambiente protegido' : 'Não foi possível abrir'}</h1>
        <p>
          {opening
            ? 'Validando sua sessão corporativa e preparando a segunda camada de segurança financeira.'
            : error}
        </p>

        {opening ? <div className="finance-launch-spinner" aria-label="Carregando" /> : null}

        {!opening ? (
          <div className="finance-launch-actions">
            <button type="button" onClick={() => void launch()}>Tentar novamente</button>
            <button type="button" className="secondary" onClick={onBack}>Voltar</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
