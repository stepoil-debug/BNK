import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Building2, CreditCard, Landmark, LineChart, PiggyBank, ShieldCheck, WalletCards } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, formatDateBR } from '../lib/currency';
import { KpiCard } from '../components/KpiCard';
import type { DashboardTotals, FinanceFieldTemplate, FinancePositionItem } from '../types';

type ItemWithTemplate = FinancePositionItem & { finance_field_templates: FinanceFieldTemplate };

const groupLabels: Record<string, string> = {
  bank_accounts: 'Bancos',
  investments: 'Investimentos',
  credit_cards: 'Cartões',
  credit_lines: 'Linhas de Crédito',
  companies: 'Empresas'
};

export function Dashboard() {
  const [totals, setTotals] = useState<DashboardTotals | null>(null);
  const [items, setItems] = useState<ItemWithTemplate[]>([]);
  const [history, setHistory] = useState<DashboardTotals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: latestTotals } = await supabase
        .from('v_dashboard_totals')
        .select('*')
        .order('reference_date', { ascending: false })
        .limit(1)
        .maybeSingle<DashboardTotals>();

      setTotals(latestTotals ?? null);

      if (latestTotals?.position_id) {
        const { data: itemData } = await supabase
          .from('finance_position_items')
          .select('*, finance_field_templates(*)')
          .eq('position_id', latestTotals.position_id)
          .order('amount', { ascending: false });
        setItems((itemData as ItemWithTemplate[]) ?? []);
      }

      const { data: historyData } = await supabase
        .from('v_dashboard_totals')
        .select('*')
        .order('reference_date', { ascending: true })
        .limit(12);
      setHistory((historyData as DashboardTotals[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const pieData = useMemo(() => {
    if (!totals) return [];
    return [
      { name: 'Bancos', value: Number(totals.total_banks) },
      { name: 'Investimentos', value: Number(totals.total_investments) },
      { name: 'Cartões', value: Number(totals.total_credit_cards_available) },
      { name: 'Linhas de Crédito', value: Number(totals.total_credit_lines) },
      { name: 'Empresas', value: Number(totals.total_companies) }
    ].filter((entry) => entry.value > 0);
  }, [totals]);

  const bankBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const bank = item.finance_field_templates.bank_name || item.finance_field_templates.company_name || 'Outros';
      map.set(bank, (map.get(bank) ?? 0) + Number(item.amount ?? 0));
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [items]);

  if (loading) return <div className="page-loader">Carregando painel financeiro...</div>;

  if (!totals) {
    return (
      <section className="empty-state">
        <h2>Nenhuma posição financeira publicada</h2>
        <p>Crie a primeira posição financeira para alimentar automaticamente o dashboard.</p>
        <a className="primary-btn" href="/position/new">Criar primeira posição</a>
      </section>
    );
  }

  return (
    <div className="dashboard-grid">
      <section className="kpi-grid">
        <KpiCard title="Disponibilidade Total" value={money(totals.total_general)} detail={`Posição ${formatDateBR(totals.reference_date)}`} icon={WalletCards} />
        <KpiCard title="Saldo em Bancos" value={money(totals.total_banks)} detail="Soma das contas correntes" icon={Landmark} />
        <KpiCard title="Investimentos" value={money(totals.total_investments)} detail="Aplicações cadastradas" icon={PiggyBank} tone="green" />
        <KpiCard title="Cartões Disponíveis" value={money(totals.total_credit_cards_available)} detail="Limite disponível informado" icon={CreditCard} tone="orange" />
        <KpiCard title="Linhas de Crédito" value={money(totals.total_credit_lines)} detail="Crédito disponível" icon={LineChart} tone="blue" />
        <KpiCard title="Empresas vinculadas" value={money(totals.total_companies)} detail="STEP Energy / Petrohab" icon={Building2} tone="gray" />
      </section>

      <section className="panel large-panel">
        <div className="panel-head">
          <div><h2>Evolução Financeira</h2><p>Últimas posições publicadas</p></div>
          <span className="status-pill"><ShieldCheck size={14} /> Dados manuais conferidos</span>
        </div>
        <div className="chart-box">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={history.map((row) => ({ date: formatDateBR(row.reference_date), total: Number(row.total_general), banks: Number(row.total_banks) }))}>
              <defs>
                <linearGradient id="total" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0066ff" stopOpacity={0.28}/><stop offset="95%" stopColor="#0066ff" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf5" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Area type="monotone" dataKey="total" name="Disponibilidade Total" stroke="#0066ff" fillOpacity={1} fill="url(#total)" strokeWidth={3} />
              <Area type="monotone" dataKey="banks" name="Bancos" stroke="#0fb4d8" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Composição</h2><p>Por grupo financeiro</p></div></div>
        <div className="chart-box small">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} innerRadius={65} outerRadius={100} paddingAngle={3} dataKey="value" nameKey="name">
                {pieData.map((_entry, index) => <Cell key={index} fill={["#0066ff", "#00b6d6", "#ff9f1c", "#15a46b", "#7c3aed"][index % 5]} />)}
              </Pie>
              <Tooltip formatter={(value) => money(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Valores por Banco</h2><p>Somatório por instituição</p></div></div>
        <div className="chart-box small">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={bankBars}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6ecf5" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => money(Number(value))} />
              <Bar dataKey="value" fill="#0066ff" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel table-panel">
        <div className="panel-head"><div><h2>Itens da posição publicada</h2><p>{formatDateBR(totals.reference_date)}</p></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Grupo</th><th>Item</th><th>Banco</th><th>Tipo</th><th className="right">Valor</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{groupLabels[item.finance_field_templates.group_key] ?? item.finance_field_templates.group_key}</td>
                  <td>{item.finance_field_templates.item_name}</td>
                  <td>{item.finance_field_templates.bank_name || '-'}</td>
                  <td>{item.finance_field_templates.account_type || '-'}</td>
                  <td className="right amount">{money(Number(item.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
