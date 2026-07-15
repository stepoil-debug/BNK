# STEP Finance Control — BNK

Módulo de Controle Bancário da STEP, integrado à Intranet sem perder o isolamento de segurança.

## Arquitetura aprovada

- Repositório financeiro separado: `STEP-SOLUTIONS/BNK`.
- Repositório da Intranet separado: `stepoil-debug/Intranetgeral-step`.
- Supabase financeiro separado: `fowqidmmseynoneekrse`.
- Interface publicada dentro da mesma URL da Intranet em `/financeiro/*`.
- Navegação na mesma guia, sem `iframe` e sem URL externa visível.
- Permissão corporativa obrigatória: `financeiro:controle-bancario`.
- A Intranet não recebe nem armazena a `SERVICE_ROLE_KEY` financeira.

```text
Intranet STEP
  └── Financeiro
       └── Controle Bancário
            └── /intranet/financeiro/controle-bancario
                 ├── POST /api/auth/finance-launch com Bearer corporativo
                 ├── valida sessão e permissão
                 ├── cria ticket HttpOnly de 75 segundos
                 └── redireciona para /financeiro/access
                        ├── consome o ticket uma única vez
                        ├── assina asserção HMAC para o Supabase BNK
                        ├── Supabase valida assinatura e bloqueia replay
                        ├── emite token temporário de uso único
                        ├── cria sessão financeira
                        ├── exige MFA
                        ├── valida dispositivo aprovado
                        └── /financeiro/dashboard
```

## Fluxo de acesso

1. O colaborador entra normalmente na Intranet STEP.
2. Ao clicar em `Financeiro > Controle Bancário`, a rota interna do launcher chama `POST /api/auth/finance-launch` com o Bearer token corporativo.
3. A Function do launcher consulta o perfil autenticado, deriva o e-mail da sessão e verifica `financeiro:controle-bancario`.
4. A Function cria um ticket assinado, `HttpOnly`, `Secure`, `SameSite=Strict`, válido por 75 segundos e restrito a `/api/finance/session`.
5. A Intranet redireciona na mesma guia para `/financeiro/access`.
6. O frontend financeiro chama `POST /api/finance/session/bootstrap`; o navegador envia o ticket automaticamente, sem expô-lo ao JavaScript.
7. A Function de bootstrap valida e consome o ticket, assina a asserção HMAC e chama a Edge Function BNK.
8. A Edge Function `intranet-session-bootstrap` valida assinatura, prazo, nonce, perfil ativo, papel financeiro e usuário do Auth.
9. A Edge Function gera um `token_hash` de uso único sem expor a Service Role fora do ambiente financeiro.
10. O frontend troca o `token_hash` por uma sessão do Supabase financeiro.
11. A senha corporativa não é solicitada novamente.
12. O usuário conclui MFA/TOTP e a aprovação do dispositivo.
13. RLS, perfis e auditoria continuam sendo aplicados pelo Supabase financeiro.

## Rotas

### Intranet

- `/intranet/financeiro` — card Financeiro.
- `/intranet/financeiro/controle-bancario` — launcher SSO.
- `/api/auth/finance-launch` — valida Bearer e cria ticket `HttpOnly`.
- `/api/finance/session/bootstrap` — consome ticket e inicia sessão BNK.
- `/api/finance/session/logout` — limpa ticket residual sem encerrar a sessão corporativa.

### Financeiro

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
npm install
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

O workflow `BNK CI` também publica o artefato `bnk-financeiro-intranet`, pronto para ser copiado pelo pipeline da Intranet.

## Variáveis do frontend

```bash
VITE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL_FINANCEIRA
VITE_INTRANET_INTEGRATION=true
VITE_ALLOW_STANDALONE_LOGIN=false
VITE_FINANCE_BOOTSTRAP_URL=/api/finance/session/bootstrap
VITE_FINANCE_LOGOUT_URL=/api/finance/session/logout
VITE_INTRANET_HOME_URL=/intranet
```

## Variáveis exclusivas das Functions da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_PUBLISHABLE_KEY=SUA_CHAVE_PUBLICAVEL_FINANCEIRA
FINANCE_SSO_SHARED_SECRET=SEGREDO_HMAC_COMPARTILHADO_APENAS_ENTRE_SERVIDORES
```

A Intranet **não** usa `FINANCE_SUPABASE_SERVICE_ROLE_KEY`. A Service Role permanece exclusivamente no Supabase BNK, onde a Edge Function é executada.

Referências para aplicação na Intranet:

```text
integration/intranet/frontend/FinanceControlLauncher.tsx
integration/intranet/netlify/functions/finance-launch.mts
integration/intranet/netlify/functions/finance-session-bootstrap.mts
integration/intranet/netlify/functions/finance-session-logout.mts
integration/intranet/machine-finance-module.json
```

O contrato completo está em `docs/INTEGRACAO_INTRANET_STEP.md`.

## Desenvolvimento isolado

Somente para desenvolvimento local ou contingência administrativa controlada:

```bash
VITE_INTRANET_INTEGRATION=false
VITE_ALLOW_STANDALONE_LOGIN=true
```

Em produção, o login por senha deve permanecer desativado e a entrada deve ocorrer pela Intranet.

## Segurança preservada

- Supabase financeiro independente.
- Service Role restrita ao ambiente BNK.
- Bearer corporativo utilizado apenas pelo launcher da Intranet.
- Ticket `HttpOnly`, `Secure`, `SameSite=Strict` e de curta duração.
- Asserção HMAC com validade máxima de 90 segundos.
- Nonce de uso único e proteção contra replay.
- MFA/TOTP obrigatório.
- Aprovação manual de dispositivo.
- Perfis `super_admin`, `admin`, `finance_editor`, `finance_viewer`, `auditor` e `blocked`.
- RLS nas tabelas financeiras.
- Auditoria e eventos de segurança.
- Token temporário de uso único.
- Sessão corporativa preservada.
- Sem `iframe` e sem credenciais sensíveis no navegador.

## Escopo funcional atual

O dashboard é alimentado manualmente e por importações, sem Open Finance nesta fase. Os grupos principais são:

- Contas bancárias.
- Investimentos.
- Cartões de crédito.
- Linhas de crédito.
- Empresas e contas vinculadas.
