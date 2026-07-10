import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { money, formatDateBR } from '../lib/currency';
import type { DashboardTotals } from '../types';

export function History() {
  const [rows, setRows] = useState<DashboardTotals[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data } = await supabase
        .from('v_dashboard_totals')
        .select('*')
        .order('reference_date', { ascending: false })
        .limit(100);
      setRows((data as DashboardTotals[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="page-loader">Carregando histórico...</div>;

  return (
    <section className="panel table-panel">
      <div className="panel-head"><div><h2>Histórico de posições</h2><p>Posições publicadas no dashboard</p></div></div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Data</th><th className="right">Bancos</th><th className="right">Investimentos</th><th className="right">Cartões</th><th className="right">Linhas de crédito</th><th className="right">Total geral</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.position_id}>
                <td>{formatDateBR(row.reference_date)}</td>
                <td className="right">{money(row.total_banks)}</td>
                <td className="right">{money(row.total_investments)}</td>
                <td className="right">{money(row.total_credit_cards_available)}</td>
                <td className="right">{money(row.total_credit_lines)}</td>
                <td className="right amount">{money(row.total_general)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
