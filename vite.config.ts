import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const FINANCE_BASE = '/financeiro/';

export default defineConfig({
  base: FINANCE_BASE,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    // O artefato já sai pronto para ser montado em public/financeiro da Intranet.
    outDir: 'dist/financeiro',
    emptyOutDir: true
  }
});
