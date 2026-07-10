import { FileSpreadsheet, FileText, Upload } from 'lucide-react';

export function Imports() {
  return (
    <div className="dashboard-grid">
      <section className="panel large-panel">
        <div className="panel-head"><div><h2>Importações</h2><p>Fase preparada para Excel/CSV/OFX/PDF. Inicialmente o formulário manual já alimenta o painel.</p></div></div>
        <div className="import-grid">
          <button className="import-card"><FileSpreadsheet size={28} /><strong>Importar Excel / CSV</strong><span>Próxima etapa: mapear colunas e pré-conferência.</span></button>
          <button className="import-card"><FileText size={28} /><strong>Importar PDF de fatura</strong><span>Etapa posterior: extrair dados e validar antes de publicar.</span></button>
          <button className="import-card"><Upload size={28} /><strong>Importar OFX</strong><span>Extratos bancários padronizados por arquivo.</span></button>
        </div>
      </section>
      <section className="panel"><h2>Regra</h2><p>Todo arquivo importado deve cair primeiro em conferência. Nada deve publicar no dashboard automaticamente sem validação.</p></section>
    </div>
  );
}
