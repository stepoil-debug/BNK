import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Copy, Save, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, parseCurrencyToNumber } from '../lib/currency';
import { useAuth } from '../context/AuthContext';
import type { FinanceFieldTemplate, FinancePosition, FinancePositionItem, FinanceGroup } from '../types';

const groupTitles: Record<FinanceGroup, string> = {
  bank_accounts: 'Contas Bancárias',
  investments: 'Investimentos',
  credit_cards: 'Cartões de Crédito',
  credit_lines: 'Linhas de Crédito',
  companies: 'Empresas / Contas vinculadas'
};

export function FinancialPositionForm() {
  const { user, canEditFinance } = useAuth();
  const [templates, setTemplates] = useState<FinanceFieldTemplate[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [referenceDate, setReferenceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error: templateError } = await supabase
        .from('finance_field_templates')
        .select('*')
        .eq('is_active', true)
        .order('order_index', { ascending: true });
      if (templateError) setError(templateError.message);
      setTemplates((data as FinanceFieldTemplate[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const grouped = useMemo(() => {
    return templates.reduce<Record<FinanceGroup, FinanceFieldTemplate[]>>((acc, template) => {
      const group = template.group_key;
      acc[group] = acc[group] || [];
      acc[group].push(template);
      return acc;
    }, {} as Record<FinanceGroup, FinanceFieldTemplate[]>);
  }, [templates]);

  const totals = useMemo(() => {
    const result: Record<FinanceGroup, number> = {} as Record<FinanceGroup, number>;
    for (const template of templates) {
      result[template.group_key] = (result[template.group_key] ?? 0) + parseCurrencyToNumber(values[template.id] ?? '0');
    }
    return result;
  }, [templates, values]);

  const totalGeneral = Object.values(totals).reduce((sum, value) => sum + Number(value ?? 0), 0);

  async function duplicateLatest() {
    setError('');
    setMessage('');
    const { data: latest } = await supabase
      .from('finance_positions')
      .select('*')
      .eq('status', 'published')
      .order('reference_date', { ascending: false })
      .limit(1)
      .maybeSingle<FinancePosition>();

    if (!latest) {
      setMessage('Não existe posição publicada para duplicar.');
      return;
    }

    const { data: latestItems } = await supabase
      .from('finance_position_items')
      .select('*')
      .eq('position_id', latest.id);

    const nextValues: Record<string, string> = {};
    for (const item of (latestItems as FinancePositionItem[]) ?? []) {
      nextValues[item.field_template_id] = String(item.amount ?? 0).replace('.', ',');
    }
    setValues(nextValues);
    setMessage(`Valores duplicados da posição ${latest.reference_date}. Altere apenas o que mudou.`);
  }

  async function save(status: 'draft' | 'published') {
    if (!user) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const payload = {
        reference_date: referenceDate,
        status,
        notes,
        created_by: user.id,
        published_by: status === 'published' ? user.id : null,
        published_at: status === 'published' ? new Date().toISOString() : null
      };

      const { data: position, error: positionError } = await supabase
        .from('finance_positions')
        .insert(payload)
        .select('*')
        .single<FinancePosition>();
      if (positionError) throw positionError;

      const rows = templates.map((template) => ({
        position_id: position.id,
        field_template_id: template.id,
        amount: parseCurrencyToNumber(values[template.id] ?? '0')
      }));

      const { error: itemError } = await supabase.from('finance_position_items').insert(rows);
      if (itemError) throw itemError;

      await supabase.from('security_events').insert({
        user_id: user.id,
        event_type: status === 'published' ? 'finance.position_published' : 'finance.position_draft_created',
        level: status === 'published' ? 'warning' : 'info',
        metadata: { position_id: position.id, reference_date: referenceDate, total_general: totalGeneral }
      });

      setMessage(status === 'published' ? 'Posição publicada. O dashboard já foi atualizado.' : 'Rascunho salvo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar posição financeira.');
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save('published');
  }

  if (!canEditFinance) {
    return <section className="empty-state"><h2>Sem permissão de edição</h2><p>Seu perfil permite visualizar, mas não alterar dados financeiros.</p></section>;
  }

  if (loading) return <div className="page-loader">Carregando formulário...</div>;

  return (
    <form className="finance-form" onSubmit={submit}>
      <section className="form-header panel">
        <div>
          <h2>Nova Posição Financeira</h2>
          <p>Preencha os valores dentro do painel. Os totais são calculados automaticamente e alimentam o dashboard.</p>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={duplicateLatest}><Copy size={17} /> Duplicar última posição</button>
          <button type="button" className="secondary-btn" onClick={() => save('draft')} disabled={saving}><Save size={17} /> Salvar rascunho</button>
          <button type="submit" className="primary-btn" disabled={saving}><Send size={17} /> Publicar no dashboard</button>
        </div>
      </section>

      {message ? <div className="success-box">{message}</div> : null}
      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel form-meta">
        <label>Data da posição<input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} required /></label>
        <label>Observação geral<textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: posição conferida com bancos às 08:45" /></label>
        <div className="total-card"><span>Total geral</span><strong>{money(totalGeneral)}</strong></div>
      </section>

      {(Object.keys(grouped) as FinanceGroup[]).map((group) => (
        <section className="panel form-group" key={group}>
          <div className="panel-head">
            <div><h2>{groupTitles[group]}</h2><p>{grouped[group].length} campos cadastrados</p></div>
            <div className="total-card inline"><span>Total</span><strong>{money(totals[group] ?? 0)}</strong></div>
          </div>
          <div className="field-grid">
            {grouped[group].map((template) => (
              <label className="money-field" key={template.id}>
                <span>{template.item_name}</span>
                <small>{[template.bank_name, template.account_type, template.account_number].filter(Boolean).join(' • ') || template.company_name}</small>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={values[template.id] ?? ''}
                  onChange={(e) => setValues((current) => ({ ...current, [template.id]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </section>
      ))}
    </form>
  );
}
