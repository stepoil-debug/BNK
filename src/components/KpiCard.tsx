import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  title,
  value,
  detail,
  tone = 'blue',
  icon: Icon
}: {
  title: string;
  value: string;
  detail?: string;
  tone?: 'blue' | 'green' | 'red' | 'orange' | 'gray';
  icon: LucideIcon;
}) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-head">
        <span className="kpi-icon"><Icon size={19} /></span>
        <span>{title}</span>
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  );
}
