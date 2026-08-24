# Manifesto de extração — STEP Finance Control para Lovable

Data da preparação: 24/08/2026

Branch: `lovable-replica-2026-08-24`

Base: `main` do repositório `stepoil-debug/BNK`.

## O que esta branch contém

A branch foi criada diretamente a partir do repositório standalone do módulo financeiro. Portanto, mantém todo o conteúdo da `main` e acrescenta somente documentação para facilitar a replicação no Lovable.

A estrutura funcional existente inclui:

- aplicação React + TypeScript + Vite;
- React Router;
- Supabase;
- dashboard financeiro;
- cadastro de nova posição financeira;
- duplicação da última posição publicada;
- rascunho e publicação;
- histórico;
- tela de importações;
- tela de relatórios;
- tela de bloqueio;
- configuração de segurança;
- validação de dispositivo;
- administração de segurança;
- modelo de permissões por papel;
- WebAuthn/Passkey preparado com Edge Functions;
- migration SQL completa da versão standalone;
- RLS;
- auditoria por eventos de segurança;
- documentação de arquitetura, deploy, modelo de campos e segurança;
- estilos e identidade visual STEP Finance Control;
- integração/card de entrada para Intranet;
- configuração de deploy.

## Rotas encontradas na origem

- `/login`
- `/blocked`
- `/security/setup`
- `/security/device-check`
- `/dashboard`
- `/position/new`
- `/history`
- `/imports`
- `/reports`
- `/security` — protegida por perfil administrativo

## Grupos financeiros encontrados

- `bank_accounts`
- `investments`
- `credit_cards`
- `credit_lines`
- `companies`

## Papéis encontrados

- `super_admin`
- `admin`
- `finance_editor`
- `finance_viewer`
- `auditor`
- `blocked`

## Estruturas do banco standalone

- `profiles`
- `user_roles`
- `approved_devices`
- `security_events`
- `webauthn_challenges`
- `webauthn_credentials`
- `finance_field_templates`
- `finance_positions`
- `finance_position_items`
- `finance_imports`
- `v_latest_published_position`
- `v_dashboard_totals`

## Edge Functions encontradas

- `passkey-auth-options`
- `passkey-auth-verify`
- `passkey-register-options`
- `passkey-register-verify`
- `register-device`

## Observação sobre a versão integrada à Intranet

A Intranet STEP recebeu, depois da criação da base standalone, uma camada adicional de integração e segurança, incluindo:

- rota interna `Financeiro > Controle Bancário`;
- permissão `financeiro:controle-bancario`;
- launcher autenticado a partir da sessão da Intranet;
- ticket curto;
- sessão financeira separada;
- HMAC/cookies HTTP-only em versões da integração;
- schema isolado `finance_bnk` no Supabase principal;
- dashboard de contingência/servido por backend;
- organização de campos de CRM Financeiro;
- camada adicional de catálogo de bancos e shell visual STEP One.

Esses conceitos foram incorporados ao `LOVABLE_PROMPT.md` como requisitos de arquitetura para uma réplica nova, sem colocar segredos ou credenciais de produção no repositório.

## Funcionalidades que não devem ser falsamente tratadas como concluídas

A origem informa que a tela de Importações está preparada para Excel/CSV, PDF e OFX, mas nem todos os processamentos aparecem implementados na versão standalone. A tela de Relatórios também deve ser reproduzida no nível funcional encontrado na origem.

Ao replicar no Lovable, não preencher essas lacunas com mock e não declarar funcionalidade pronta sem implementação real.

## Regra para o Lovable

Use o código desta branch como fonte primária. Use `LOVABLE_PROMPT.md` como especificação de replicação e critérios de aceite.
