# STEP Finance Control

Módulo de Controle Bancário da STEP, preparado para rodar dentro da Intranet em `/financeiro/*`.

O acesso principal é feito pela Intranet STEP. O usuário não deve repetir login e senha: a Intranet valida a sessão corporativa, emite um ticket curto e o BNK mantém a segunda camada por token temporário de uso único.

## Modelo atual

```txt
Intranet STEP
  └── Financeiro > Controle Bancário
       └── /api/auth/finance-launch
            └── /financeiro/access
                 └── token temporário BNK
                      └── /financeiro/dashboard
```

## Separação de segurança

- Repositório BNK separado: `stepoil-debug/BNK`.
- URL final dentro da Intranet: `/financeiro/*`.
- Banco financeiro em schema isolado `finance_bnk` no Supabase da Intranet.
- Dados financeiros não ficam misturados nas tabelas públicas da Intranet.
- O navegador não acessa diretamente as tabelas do schema financeiro.
- A segunda camada por token temporário permanece obrigatória.
- Passkey/reconhecimento facial não é obrigatório neste fluxo.

## Build do bundle

O Vite está configurado com:

```ts
base: '/financeiro/'
```

E o React Router usa:

```tsx
<BrowserRouter basename="/financeiro">
```

Isso garante que os assets sejam gerados para `/financeiro/assets/...` e que as rotas internas funcionem dentro da URL da Intranet.

## Desenvolvimento local

```bash
npm install
cp .env.example .env
npm run dev
```

Preencha o `.env` apenas para desenvolvimento isolado do BNK:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

Em produção, o acesso oficial é controlado pelas funções da Intranet e pelo schema `finance_bnk`.

## Alimentação do dashboard

Nesta primeira versão não usamos Open Finance.

O dashboard é alimentado pela tela:

```txt
Nova Posição Financeira
```

Ela contém os campos da planilha enviada, organizados por grupos:

- Contas Bancárias.
- Investimentos.
- Cartões de Crédito.
- Linhas de Crédito.
- Empresas / Contas vinculadas.

Os totais são calculados automaticamente. O usuário não digita total.

## Próximas etapas

- Publicar novo artefato BNK validado para a Intranet.
- Migrar posições financeiras antigas, caso o Supabase legado seja disponibilizado.
- Importação Excel/CSV.
- Importação OFX.
- Leitura de PDF de fatura.
- Exportação PDF do dashboard.
- Integração Pluggy/Belvo em sandbox.
