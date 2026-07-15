// Referência para o card/subcard da Intranet STEP.
// A navegação ocorre na mesma guia e no mesmo domínio, sem iframe e sem URL externa.
import { LockKeyhole, ShieldCheck, WalletCards } from 'lucide-react';

const FINANCE_ROUTE = '/financeiro/access';

export function CardAcessoFinanceiro() {
  return (
    <button
      className="step-finance-access-card"
      onClick={() => window.location.assign(FINANCE_ROUTE)}
      type="button"
    >
      <div className="finance-card-icon"><WalletCards size={28} /></div>
      <div className="finance-card-content">
        <span className="finance-card-eyebrow"><ShieldCheck size={14} /> Acesso restrito</span>
        <strong>Controle Bancário</strong>
        <small>Acesso interno com permissão corporativa, MFA, dispositivo aprovado e auditoria.</small>
      </div>
      <LockKeyhole size={22} />
    </button>
  );
}
