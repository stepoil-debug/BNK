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
            └── /financeiro/access
                 ├── valida sessão e permissão corporativa
                 ├── assina uma asserção HMAC de curta duração
                 ├── Supabase BNK valida assinatura e bloqueia replay
                 ├── emite token temporário de uso único
                 ├── cria sessão no Supabase financeiro
                 ├── exige MFA
                 ├── valida dispositivo aprovado
                 └── /financeiro/dashboard
```

## Fluxo de acesso

1. O colaborador entra normalmente na Intranet STEP.
2. A Intranet verifica a permissão `financeiro:controle-bancario`.
3. O frontend financeiro chama `POST /api/finance/session/bootstrap` usando a sessão corporativa existente.
4. A Function da Intranet deriva o e-mail e a identidade exclusivamente da sessão validada; não aceita identidade enviada pelo navegador.
5. A Function cria uma asserção de até 90 segundos, com `nonce` único, e assina o corpo com HMAC-SHA256.
6. A Edge Function `intranet-session-bootstrap`, hospedada no Supabase BNK, valida assinatura, prazo, nonce, perfil ativo, papel financeiro e usuário do Auth.
7. A Edge Function gera um `token_hash` de uso único sem expor a Service Role fora do ambiente financeiro.
8. O frontend troca o `token_hash` por uma sessão do Supabase financeiro.
9. A senha corporativa não é solicitada novamente.
10. O usuário conclui a segunda camada MFA/TOTP.
11. O dispositivo precisa estar aprovado no módulo financeiro.
12. RLS, perfis e auditoria continuam sendo aplicados pelo Supabase financeiro.

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

O contrato completo da ponte está em `docs/INTEGRACAO_INTRANET_STEP.md`. Uma implementação de referência da Netlify Function está em `integration/intranet/netlify/functions/finance-session-bootstrap.mts`.

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
