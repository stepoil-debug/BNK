// Card para inserir no Intranet STEP e redirecionar para o Netlify separado do cofre financeiro.
// Troque FINANCE_URL pela URL final do novo Netlify.
import { LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';

const FINANCE_URL = 'https://step-finance-control.netlify.app';

export function CardAcessoFinanceiro() {
  return (
    <button
      className="step-finance-access-card"
      onClick={() => window.open(FINANCE_URL, '_blank', 'noopener,noreferrer')}
      type="button"
    >
      <div className="finance-card-icon"><WalletCards size={28} /></div>
      <div className="finance-card-content">
        <span className="finance-card-eyebrow"><ShieldCheck size={14} /> Acesso restrito</span>
        <strong>Controle Financeiro</strong>
        <small>Cofre financeiro separado com MFA, dispositivo aprovado e auditoria.</small>
      </div>
      <LockKeyhole size={22} />
    </button>
  );
}
