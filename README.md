# STEP Finance Control — BNK

Módulo de Controle Bancário da STEP, integrado à Intranet sem perder o isolamento de segurança.

## Arquitetura aprovada

- Repositório financeiro separado: `STEP-SOLUTIONS/BNK`.
- Repositório da Intranet separado: `stepoil-debug/Intranetgeral-step`.
- Supabase financeiro separado: `fowqidmmseynoneekrse`.
- Interface publicada dentro da mesma URL da Intranet em `/financeiro/*`.
- Navegação na mesma guia, sem `iframe` e sem URL externa visível.
- Permissão corporativa obrigatória: `financeiro:controle-bancario`.
- Nenhuma `SERVICE_ROLE_KEY` no frontend.

```text
Intranet STEP
  └── Financeiro
       └── Controle Bancário
            └── /financeiro/access
                 ├── valida sessão corporativa
                 ├── emite token temporário de uso único
                 ├── cria sessão no Supabase financeiro
                 ├── exige MFA
                 ├── valida dispositivo aprovado
                 └── /financeiro/dashboard
```

## Fluxo de acesso

1. O colaborador entra normalmente na Intranet STEP.
2. A Intranet verifica a permissão `financeiro:controle-bancario`.
3. O frontend financeiro chama `POST /api/finance/session/bootstrap` usando a sessão corporativa `HttpOnly`.
4. O backend da Intranet usa as credenciais **somente de servidor** do Supabase financeiro para gerar um link temporário de uso único para o e-mail autorizado.
5. O frontend troca o `token_hash` por uma sessão do Supabase financeiro.
6. A senha corporativa não é solicitada novamente.
7. O usuário conclui a segunda camada MFA/TOTP.
8. O dispositivo precisa estar aprovado no módulo financeiro.
9. RLS, perfis e auditoria continuam sendo aplicados pelo Supabase financeiro.

## Rotas

- `/financeiro/access` — ponte de entrada pela Intranet.
- `/financeiro/security/challenge` — segunda validação MFA.
- `/financeiro/security/setup` — configuração inicial do MFA.
- `/financeiro/security/device-check` — aprovação do dispositivo.
- `/financeiro/dashboard` — dashboard.
- `/financeiro/position/new` — nova posição financeira.
- `/financeiro/history` — histórico.
- `/financeiro/imports` — importações.
- `/financeiro/reports` — relatórios.
- `/financeiro/security` — administração de segurança.

## Build para a Intranet

```bash
npm ci
npm run build
```

O Vite gera o módulo em:

```text
dist/financeiro/
```

Esse diretório deve ser incorporado ao deploy da Intranet como:

```text
public/financeiro/
```

O artefato já utiliza `base=/financeiro/` e `BrowserRouter basename=/financeiro`.

## Variáveis do frontend

```bash
VITE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY_FINANCEIRA
VITE_INTRANET_INTEGRATION=true
VITE_ALLOW_STANDALONE_LOGIN=false
VITE_FINANCE_BOOTSTRAP_URL=/api/finance/session/bootstrap
VITE_FINANCE_LOGOUT_URL=/api/finance/session/logout
VITE_INTRANET_HOME_URL=/intranet
```

## Variáveis exclusivas do backend da Intranet

Estas variáveis nunca podem entrar no bundle do navegador:

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_SERVICE_ROLE_KEY=SEGREDO_SOMENTE_NO_BACKEND
FINANCE_REQUIRED_PERMISSION=financeiro:controle-bancario
```

O contrato completo da ponte está em `docs/INTEGRACAO_INTRANET_STEP.md`.

## Desenvolvimento isolado

Somente para desenvolvimento local ou contingência administrativa controlada:

```bash
VITE_INTRANET_INTEGRATION=false
VITE_ALLOW_STANDALONE_LOGIN=true
```

Em produção, o login por senha deve permanecer desativado e a entrada deve ocorrer pela Intranet.

## Segurança preservada

- Supabase financeiro independente.
- MFA/TOTP obrigatório.
- Aprovação manual de dispositivo.
- Perfis `super_admin`, `admin`, `finance_editor`, `finance_viewer`, `auditor` e `blocked`.
- RLS nas tabelas financeiras.
- Auditoria e eventos de segurança.
- Token temporário de uso único.
- Sessão corporativa em cookie `HttpOnly`.
- Sem `iframe` e sem credenciais sensíveis no navegador.

## Escopo funcional atual

O dashboard é alimentado manualmente e por importações, sem Open Finance nesta fase. Os grupos principais são:

- Contas bancárias.
- Investimentos.
- Cartões de crédito.
- Linhas de crédito.
- Empresas e contas vinculadas.
