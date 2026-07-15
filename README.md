# STEP Finance Control — BNK

Módulo de Controle Bancário da STEP, integrado à Intranet com banco, biometria, permissões e auditoria isolados no Supabase BNK.

## Arquitetura aprovada

- Repositório financeiro: `STEP-SOLUTIONS/BNK`.
- Repositório principal: `stepoil-debug/Intranetgeral-step`.
- Supabase financeiro: `fowqidmmseynoneekrse`.
- Autenticação de origem: usuários do Supabase principal da Intranet.
- O BNK mantém somente uma identidade técnica interna, sem segundo formulário de login.
- Interface dentro da mesma URL da Intranet em `/financeiro/*`.
- Navegação na mesma guia, sem `iframe` e sem domínio financeiro visível.
- A Service Role financeira permanece exclusivamente no ambiente BNK.

## Fluxo completo

```text
Usuário autenticado na Intranet
  └── Financeiro > Controle Bancário
       └── /intranet/financeiro/controle-bancario
            ├── valida Bearer e UUID do usuário principal
            ├── cria ticket HttpOnly de 75 segundos
            └── /financeiro/access
                 ├── valida HMAC e nonce de uso único
                 ├── exige concessão existente no BNK
                 ├── emite sessão financeira técnica
                 ├── exige MFA/TOTP
                 ├── exige cadastro facial no primeiro acesso
                 ├── exige dispositivo aprovado
                 └── /financeiro/dashboard
```

A permissão administrativa geral da Intranet não concede acesso financeiro. O usuário precisa existir no Supabase principal e possuir uma concessão independente em `security.finance_access_grants`.

## Governança de acesso

```text
Proprietário do Financeiro
  └── Administrador Master
       ├── Edição financeira
       ├── Somente visualização
       └── Auditoria
```

### Proprietário

- Existe somente um.
- Proprietário inicial: Douglas.
- Somente o Proprietário visualiza a rota e o botão `Administrador Master`.
- Somente o Proprietário pode nomear, substituir, bloquear ou revogar o Master.
- O Proprietário não pode ser alterado por administradores ou por operações comuns de concessão.

### Administrador Master

- Existe no máximo um Master ativo.
- Pode conceder `editor`, `viewer` e `auditor`.
- Não pode visualizar a opção de nomeação do Master.
- Não pode nomear outro Master.
- Não pode modificar ou bloquear o Proprietário.
- A substituição feita pelo Proprietário bloqueia automaticamente o Master anterior.

### Administradores comuns

Administradores da Intranet, administradores legados do BNK, editores e visualizadores não podem:

- abrir a gestão de acessos;
- listar a governança por chamada direta;
- conceder permissão financeira;
- nomear ou visualizar a opção de Administrador Master.

A restrição existe na interface, na Edge Function e nas funções SQL. Não depende apenas de esconder botões.

## Identidade da Intranet

Cada concessão armazena obrigatoriamente:

- `intranet_user_id`: UUID real do usuário no Supabase principal;
- `corporate_email`: e-mail corporativo;
- `finance_user_id`: identidade técnica interna do BNK;
- perfil e status financeiro.

Novos usuários técnicos usam endereço interno não entregável:

```text
intranet-<UUID>@bnk.internal.invalid
```

Essa identidade não representa um segundo cadastro do colaborador. Ela existe apenas para sessão, RLS e auditoria no projeto Supabase separado.

## Cadastro facial obrigatório

No primeiro acesso autorizado:

1. o usuário conclui MFA/TOTP;
2. é direcionado para `/financeiro/security/face-enrollment`;
3. aceita o consentimento biométrico;
4. realiza três capturas: frontal, esquerda e direita;
5. o backend valida resolução, tamanho, poses e imagens distintas;
6. as referências são gravadas no Supabase BNK;
7. somente após a conclusão o papel financeiro deixa o estado `blocked`;
8. o usuário segue para aprovação do dispositivo.

### Armazenamento

- Bucket privado: `biometric-reference-images`.
- Limite por imagem: 5 MB.
- Formatos: JPEG, PNG ou WebP.
- Hash SHA-256 por captura.
- Tabelas no schema privado `security`.
- RLS forçada e ausência de acesso para `anon` e `authenticated`.
- Descriptor facial criptografado com AES-256-GCM quando o adaptador de modelo fornecer embedding.
- Auditoria imutável de conclusão e mudanças de acesso.

O frontend atual utiliza o adaptador `step-guided-face-capture`, com guia oval, sequência aleatória de poses e validação de qualidade. O motor exato de comparação utilizado pelo Apontamento será conectado quando o repositório correspondente estiver disponível; toda a estrutura e o armazenamento BNK já estão preparados para recebê-lo sem migrar dados.

## Bloqueio antes da biometria

Enquanto `status=pending_face` ou a biometria não estiver `active`:

- `public.user_roles` permanece como `blocked`;
- nenhuma tabela financeira é liberada por RLS;
- nenhuma função administrativa aceita a operação;
- a sessão serve somente para MFA, cadastro facial e validação de dispositivo.

## Segurança do banco

Tabelas privadas:

```text
security.finance_governance
security.finance_access_grants
security.finance_biometric_enrollments
security.finance_biometric_samples
security.finance_biometric_sessions
security.finance_access_audit
security.intranet_sso_nonces
security.intranet_identity_links
```

Proteções:

- RLS habilitada e forçada;
- sem privilégios para `public`, `anon` ou `authenticated`;
- acesso somente por `service_role` dentro das Edge Functions;
- auditoria com trigger que impede `UPDATE` e `DELETE`;
- um único Proprietário e um único Master por índices únicos;
- nonce de uso único contra replay;
- HMAC-SHA256 entre a Intranet e o BNK;
- ticket e token temporários com validade curta.

## Rotas financeiras

- `/financeiro/access` — entrada pela ponte da Intranet.
- `/financeiro/security/setup` — configuração inicial do TOTP.
- `/financeiro/security/challenge` — desafio MFA.
- `/financeiro/security/face-enrollment` — cadastro facial obrigatório.
- `/financeiro/security/device-check` — aprovação do dispositivo.
- `/financeiro/dashboard` — dashboard.
- `/financeiro/position/new` — nova posição.
- `/financeiro/history` — histórico.
- `/financeiro/imports` — importações.
- `/financeiro/reports` — relatórios.
- `/financeiro/access-management` — usuários, somente Proprietário/Master.
- `/financeiro/master-administrator` — rota visível somente ao Proprietário e invisível aos demais.
- `/financeiro/security` — segurança operacional, somente Proprietário/Master.

## Edge Functions BNK

- `intranet-session-bootstrap` — cria sessão somente após validar concessão BNK.
- `finance-access-control` — governança e usuários financeiros.
- `finance-biometric` — sessões e conclusão do cadastro facial.

Rotas antigas por token de e-mail, login local e passkey foram aposentadas. As tabelas e RPCs correspondentes não possuem mais privilégios capazes de criar uma segunda autenticação.

## Build para a Intranet

```bash
npm install
npm run build
```

Saída:

```text
dist/financeiro/
```

Copiar para:

```text
public/financeiro/
```

O workflow `BNK CI` publica o artefato `bnk-financeiro-intranet`.

## Variáveis do frontend

```bash
VITE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
VITE_SUPABASE_ANON_KEY=<chave pública do BNK>
VITE_INTRANET_INTEGRATION=true
VITE_ALLOW_STANDALONE_LOGIN=false
VITE_FINANCE_BOOTSTRAP_URL=/api/finance/session/bootstrap
VITE_FINANCE_LOGOUT_URL=/api/finance/session/logout
VITE_INTRANET_HOME_URL=/intranet
```

## Variáveis das Functions da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_PUBLISHABLE_KEY=<chave pública do BNK>
FINANCE_SSO_SHARED_SECRET=<segredo HMAC protegido>
```

A Intranet não recebe `FINANCE_SUPABASE_SERVICE_ROLE_KEY`.

## Arquivos para a próxima etapa

```text
integration/intranet/frontend/FinanceControlLauncher.tsx
integration/intranet/netlify/functions/finance-launch.mts
integration/intranet/netlify/functions/finance-session-bootstrap.mts
integration/intranet/netlify/functions/finance-session-logout.mts
integration/intranet/machine-finance-module.json
```

O deploy atual da Intranet ainda precisa receber esses arquivos. Sem eles, `/financeiro/access` exibe que a ponte financeira não está publicada, pois não existem no deploy ativo:

```text
/api/auth/finance-launch
/api/finance/session/bootstrap
/api/finance/session/logout
```

## Escopo funcional

O dashboard é alimentado manualmente e por importações, sem Open Finance nesta fase:

- contas bancárias;
- investimentos;
- cartões de crédito;
- linhas de crédito;
- empresas e contas vinculadas.
