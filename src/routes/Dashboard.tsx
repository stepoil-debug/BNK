import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Building2,
  CircleDollarSign,
  CreditCard,
  FileSpreadsheet,
  Landmark,
  PiggyBank,
  Plus,
  ShieldCheck,
  WalletCards
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { money, formatDateBR } from '../lib/currency';
import type { DashboardTotals, FinanceFieldTemplate, FinancePositionItem } from '../types';

type ItemWithTemplate = FinancePositionItem & { finance_field_templates: FinanceFieldTemplate };

type Tone = 'neutral' | 'red' | 'green' | 'purple' | 'blue' | 'orange';

const groupLabels: Record<string, string> = {
  bank_accounts: 'Contas e Bancos',
  investments: 'Investimentos',
  credit_cards: 'Cartões',
  credit_lines: 'Linhas de Crédito',
  companies: 'Empresas'
};

const donutColors = ['#1d68ff', '#3db7ff', '#ff9800', '#6d49ff', '#22b36b'];

function monthShort(date: string) {
  const label = new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' });
  return label.replace('.', '');
}

function changeText(history: DashboardTotals[], key: keyof DashboardTotals) {
  if (history.length < 2) return 'Sem comparação anterior';
  const current = Number(history[history.length - 1][key] ?? 0);
  const previous = Number(history[history.length - 2][key] ?? 0);
  if (previous === 0) return 'Primeiro período comparável';
  const diff = ((current - previous) / previous) * 100;
  const abs = Math.abs(diff).toFixed(1).replace('.', ',');
  if (diff > 0) return `${abs}% acima do período anterior`;
  if (diff < 0) return `${abs}% abaixo do período anterior`;
  return 'Mesmo nível do período anterior';
}

function itemSubtitle(item: ItemWithTemplate) {
  return item.finance_field_templates.account_type || item.finance_field_templates.company_name || 'Conta cadastrada';
}

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
      } else {
        setItems([]);
      }

      const { data: historyData } = await supabase
        .from('v_dashboard_totals')
        .select('*')
        .order('reference_date', { ascending: true })
        .limit(12);

      setHistory((historyData as DashboardTotals[]) ?? []);
      setLoading(false);
    }

    void load();
  }, []);

  const chartHistory = useMemo(
    () =>
      history.map((row) => ({
        label: monthShort(row.reference_date),
        total: Number(row.total_general),
        banks: Number(row.total_banks)
      })),
    [history]
  );

  const pieData = useMemo(() => {
    if (!totals) return [];
    return [
      { name: 'Contas', value: Number(totals.total_banks) },
      { name: 'Investimentos', value: Number(totals.total_investments) },
      { name: 'Cartões', value: Number(totals.total_credit_cards_available) },
      { name: 'Crédito', value: Number(totals.total_credit_lines) },
      { name: 'Empresas', value: Number(totals.total_companies) }
    ].filter((entry) => entry.value > 0);
  }, [totals]);

  const bankBars = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of items) {
      const bank = item.finance_field_templates.bank_name || item.finance_field_templates.company_name || 'Outros';
      map.set(bank, (map.get(bank) ?? 0) + Number(item.amount ?? 0));
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [items]);

  const accountItems = useMemo(
    () => items.filter((item) => item.finance_field_templates.group_key === 'bank_accounts').slice(0, 4),
    [items]
  );

  const cardItems = useMemo(
    () => items.filter((item) => item.finance_field_templates.group_key === 'credit_cards').slice(0, 3),
    [items]
  );

  const recentRows = useMemo(() => items.slice(0, 6), [items]);

  const historyCards = useMemo(
    () =>
      [...history]
        .reverse()
        .slice(0, 3)
        .map((entry, index) => ({
          title: index === 0 ? 'Referência atual publicada' : 'Referência histórica',
          subtitle: formatDateBR(entry.reference_date),
          amount: money(Number(entry.total_general)),
          status: index === 0 ? 'Concluída' : 'Histórico'
        })),
    [history]
  );

  const alerts = useMemo(() => {
    if (!totals) return [];

    return [
      {
        title: 'Posição financeira atualizada',
        description: `Referência publicada em ${formatDateBR(totals.reference_date)}.`,
        tone: 'red' as Tone
      },
      {
        title: 'Bancos e contas monitorados',
        description: `${accountItems.length || 0} contas principais em destaque no painel.`,
        tone: 'orange' as Tone
      },
      {
        title: 'Segurança ativa do ambiente',
        description: 'Acesso protegido por login local, aprovação de dispositivo e auditoria.',
        tone: 'blue' as Tone
      }
    ];
  }, [totals, accountItems.length]);

  const kpis = useMemo(() => {
    if (!totals) return [];

    return [
      {
        title: 'Saldo Total',
        value: money(Number(totals.total_general)),
        detail: `Atualizado em ${formatDateBR(totals.reference_date)}`,
        subdetail: changeText(history, 'total_general'),
        icon: CircleDollarSign,
        tone: 'neutral' as Tone
      },
      {
        title: 'Saldo em Contas',
        value: money(Number(totals.total_banks)),
        detail: 'Soma das contas correntes cadastradas',
        subdetail: changeText(history, 'total_banks'),
        icon: Landmark,
        tone: 'blue' as Tone
      },
      {
        title: 'Investimentos',
        value: money(Number(totals.total_investments)),
        detail: 'Aplicações e reservas financeiras',
        subdetail: changeText(history, 'total_investments'),
        icon: PiggyBank,
        tone: 'green' as Tone
      },
      {
        title: 'Limite de Cartões',
        value: money(Number(totals.total_credit_cards_available)),
        detail: 'Limite disponível cadastrado',
        subdetail: `${cardItems.length} cartões em evidência`,
        icon: CreditCard,
        tone: 'purple' as Tone
      },
      {
        title: 'Linhas de Crédito',
        value: money(Number(totals.total_credit_lines)),
        detail: 'Crédito adicional disponível',
        subdetail: changeText(history, 'total_credit_lines'),
        icon: ArrowDown,
        tone: 'red' as Tone
      },
      {
        title: 'Empresas vinculadas',
        value: money(Number(totals.total_companies)),
        detail: 'Saldos informados por empresas',
        subdetail: 'Visão consolidada por grupo',
        icon: Building2,
        tone: 'orange' as Tone
      }
    ];
  }, [totals, history, cardItems.length]);

  if (loading) return <div className="page-loader">Carregando painel financeiro...</div>;

  if (!totals) {
    return (
      <section className="empty-state modern-empty-state">
        <h2>Nenhuma posição financeira publicada</h2>
        <p>Crie a primeira posição financeira para alimentar automaticamente o dashboard.</p>
        <a className="primary-btn" href="/position/new">
          <Plus size={18} /> Criar primeira posição
        </a>
      </section>
    );
  }

  return (
    <div className="finance-dashboard">
      <section className="kpi-grid modern-kpi-grid">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article key={kpi.title} className={`metric-card tone-${kpi.tone}`}>
              <div className="metric-head">
                <div className="metric-icon"><Icon size={18} /></div>
                <span>{kpi.title}</span>
                <AlertCircle size={15} className="metric-info" />
              </div>
              <strong>{kpi.value}</strong>
              <small>{kpi.detail}</small>
              <p className="metric-subdetail">{kpi.subdetail}</p>
            </article>
          );
        })}
      </section>

      <div className="dashboard-layout-grid">
        <div className="dashboard-main-column">
          <section className="panel modern-panel chart-span-two">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Fluxo patrimonial por período</h2>
                <p>Evolução das posições financeiras publicadas</p>
              </div>
              <span className="panel-tag">Últimos {chartHistory.length || 0} registros</span>
            </div>
            <div className="chart-box dashboard-chart-box">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartHistory}>
                  <defs>
                    <linearGradient id="totalFlowGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1d68ff" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#1d68ff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6edf7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Area type="monotone" dataKey="total" name="Saldo Total" stroke="#1d68ff" fillOpacity={1} fill="url(#totalFlowGradient)" strokeWidth={3} />
                  <Area type="monotone" dataKey="banks" name="Saldo em Contas" stroke="#ff9800" fill="transparent" strokeWidth={2.4} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel modern-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Gastos por banco / conta</h2>
                <p>Somatório por instituição financeira</p>
              </div>
            </div>
            <div className="chart-box compact-chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={bankBars}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e6edf7" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(value) => money(Number(value))} />
                  <Bar dataKey="value" fill="#61a9ff" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel modern-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Composição por categoria</h2>
                <p>Distribuição do total monitorado</p>
              </div>
            </div>
            <div className="chart-box compact-chart-box">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} innerRadius={62} outerRadius={92} paddingAngle={3} dataKey="value" nameKey="name">
                    {pieData.map((_entry, index) => (
                      <Cell key={index} fill={donutColors[index % donutColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => money(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="legend-list">
              {pieData.map((entry, index) => (
                <div key={entry.name} className="legend-row">
                  <span className="legend-bullet" style={{ background: donutColors[index % donutColors.length] }} />
                  <span>{entry.name}</span>
                  <strong>{money(Number(entry.value))}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="dashboard-dual-section">
            <div className="section-head-row">
              <h2>Contas e Bancos</h2>
              <a href="/history">Ver todos</a>
            </div>
            <div className="mini-cards-grid four-grid">
              {accountItems.length ? (
                accountItems.map((item) => (
                  <article key={item.id} className="mini-finance-card">
                    <div className="mini-card-top">
                      <div className="mini-logo-badge bank">{(item.finance_field_templates.bank_name || item.finance_field_templates.item_name).slice(0, 2).toUpperCase()}</div>
                      <button type="button" className="ghost-dots">⋮</button>
                    </div>
                    <h3>{item.finance_field_templates.bank_name || item.finance_field_templates.item_name}</h3>
                    <span>{itemSubtitle(item)}</span>
                    <strong>{money(Number(item.amount))}</strong>
                    <small>Última atualização {formatDateBR(totals.reference_date)}</small>
                  </article>
                ))
              ) : (
                <article className="mini-finance-card empty-mini-card">
                  <h3>Nenhuma conta em destaque</h3>
                  <span>Cadastre contas bancárias para visualizar neste bloco.</span>
                </article>
              )}
            </div>
          </section>

          <section className="dashboard-dual-section">
            <div className="section-head-row">
              <h2>Cartões de Crédito</h2>
              <a href="/history">Ver todos</a>
            </div>
            <div className="mini-cards-grid three-grid">
              {cardItems.length ? (
                cardItems.map((item) => (
                  <article key={item.id} className="mini-finance-card credit-card-box">
                    <div className="mini-card-top">
                      <div className="mini-logo-badge card"><CreditCard size={16} /></div>
                    </div>
                    <h3>{item.finance_field_templates.item_name}</h3>
                    <span>{itemSubtitle(item)}</span>
                    <div className="card-kv">
                      <small>Limite disponível</small>
                      <strong>{money(Number(item.amount))}</strong>
                    </div>
                    <small>Vigência da posição: {formatDateBR(totals.reference_date)}</small>
                  </article>
                ))
              ) : (
                <article className="mini-finance-card empty-mini-card">
                  <h3>Nenhum cartão em destaque</h3>
                  <span>Cadastre cartões para visualizar neste bloco.</span>
                </article>
              )}
            </div>
          </section>

          <section className="panel modern-panel table-panel modern-table-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Últimos registros financeiros</h2>
                <p>Itens publicados na referência atual</p>
              </div>
              <a href="/history" className="text-link">Ver todos os registros</a>
            </div>
            <div className="table-wrap modern-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Grupo</th>
                    <th>Descrição</th>
                    <th>Banco / Empresa</th>
                    <th>Tipo</th>
                    <th className="right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRows.map((item) => (
                    <tr key={item.id}>
                      <td>{groupLabels[item.finance_field_templates.group_key] ?? item.finance_field_templates.group_key}</td>
                      <td>{item.finance_field_templates.item_name}</td>
                      <td>{item.finance_field_templates.bank_name || item.finance_field_templates.company_name || '-'}</td>
                      <td>{item.finance_field_templates.account_type || 'Informado manualmente'}</td>
                      <td className="right amount">{money(Number(item.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="dashboard-side-column">
          <section className="panel modern-panel side-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Importação Manual</h2>
                <p>Operação por lançamento ou arquivo</p>
              </div>
            </div>
            <div className="upload-info-box">
              <FileSpreadsheet size={18} />
              <span>Os dados são inseridos manualmente ou importados via arquivo.</span>
            </div>
            <div className="import-action-list">
              <a href="/imports" className="import-action-card">
                <FileSpreadsheet size={18} />
                <div>
                  <strong>Importar PDF de fatura</strong>
                  <span>Extraia dados das faturas em PDF</span>
                </div>
              </a>
              <a href="/imports" className="import-action-card">
                <WalletCards size={18} />
                <div>
                  <strong>Importar OFX / CSV / Excel</strong>
                  <span>Importe extratos e planilhas</span>
                </div>
              </a>
              <a href="/position/new" className="import-action-card">
                <Plus size={18} />
                <div>
                  <strong>Adicionar lançamento manual</strong>
                  <span>Inserir valores diretamente no sistema</span>
                </div>
              </a>
            </div>
          </section>

          <section className="panel modern-panel side-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Últimas referências</h2>
                <p>Posições publicadas recentemente</p>
              </div>
            </div>
            <div className="side-list">
              {historyCards.map((entry) => (
                <div key={`${entry.subtitle}-${entry.amount}`} className="side-list-item">
                  <div className="side-list-strip" />
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{entry.subtitle}</span>
                    <small>{entry.amount}</small>
                  </div>
                  <em className="status-badge success">{entry.status}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="panel modern-panel side-panel">
            <div className="panel-head modern-panel-head">
              <div>
                <h2>Alertas e Avisos</h2>
                <p>Pontos de atenção do painel</p>
              </div>
            </div>
            <div className="alert-list">
              {alerts.map((alert) => (
                <article key={alert.title} className={`alert-card tone-${alert.tone}`}>
                  <div className="alert-icon-wrap">
                    {alert.tone === 'red' ? <ArrowDown size={18} /> : alert.tone === 'orange' ? <AlertCircle size={18} /> : <ShieldCheck size={18} />}
                  </div>
                  <div>
                    <strong>{alert.title}</strong>
                    <p>{alert.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
