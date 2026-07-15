# Integração BNK dentro da Intranet STEP

## Objetivo

Disponibilizar o Controle Bancário na mesma origem da Intranet, em `/financeiro/*`, mantendo o repositório, o banco financeiro, a biometria e a auditoria separados.

A autenticação inicial pertence ao Supabase principal da Intranet. O BNK não solicita novamente usuário e senha e não concede acesso financeiro com base na função administrativa geral da Intranet.

Não usar:

- domínio financeiro visível ao usuário;
- nova guia;
- `iframe`;
- segundo formulário de usuário e senha;
- Service Role financeira na Intranet ou no frontend;
- concessão financeira apenas por e-mail;
- permissão administrativa comum da Intranet como autorização financeira.

## Fronteiras

| Camada | Responsabilidade |
|---|---|
| Supabase principal da Intranet | Autenticar o colaborador e fornecer UUID, e-mail corporativo e sessão válida |
| Intranet | Card, launcher, Bearer corporativo, ticket `HttpOnly` e navegação na mesma guia |
| BNK frontend | Interface em `/financeiro/*`, MFA, cadastro facial, dispositivo e telas financeiras |
| Supabase BNK | Concessões financeiras, identidade técnica, HMAC, replay, biometria, RLS e auditoria |

## Governança independente

```text
Proprietário do Financeiro
  └── Administrador Master
       ├── Editor financeiro
       ├── Visualizador financeiro
       └── Auditor financeiro
```

Regras:

- existe somente um Proprietário;
- existe no máximo um Administrador Master ativo;
- somente o Proprietário visualiza e acessa a opção de Administrador Master;
- somente o Proprietário nomeia, substitui, bloqueia ou revoga o Master;
- o Master concede somente `editor`, `viewer` e `auditor`;
- o Master não nomeia outro Master e não modifica o Proprietário;
- administradores comuns da Intranet não visualizam nem administram acessos financeiros;
- toda concessão exige o UUID real do usuário no Supabase principal;
- toda operação administrativa gera auditoria imutável no BNK.

A proteção existe na interface, na Edge Function e nas funções SQL. Não depende apenas de esconder botões.

## Fluxo final

```text
Card Financeiro > Controle Bancário
  └── /intranet/financeiro/controle-bancario
       └── POST /api/auth/finance-launch
            Authorization: Bearer <sessão corporativa>
            ├── consulta /api/auth/profile
            ├── obtém UUID e e-mail corporativo
            ├── valida a sessão principal
            ├── cria ticket assinado de 75 segundos
            ├── Set-Cookie step_finance_launch
            │    HttpOnly; Secure; SameSite=Strict
            │    Path=/api/finance/session
            └── responde redirectTo=/financeiro/access
                 └── POST /api/finance/session/bootstrap
                      ├── navegador envia ticket automaticamente
                      ├── Function valida e apaga o ticket
                      ├── assina a asserção HMAC
                      └── Edge Function BNK intranet-session-bootstrap
                           ├── valida HMAC, prazo e UUID
                           ├── consome nonce de uso único
                           ├── exige concessão em finance_access_grants
                           ├── bloqueia usuário revogado ou bloqueado
                           ├── vincula o UUID principal à identidade BNK
                           └── retorna token_hash temporário
                                └── frontend verifyOtp
                                     ├── MFA/TOTP
                                     ├── cadastro facial obrigatório
                                     ├── dispositivo aprovado
                                     └── /financeiro/dashboard
```

## Por que existe um launcher

Os módulos existentes da Intranet usam Bearer token. O bundle financeiro não deve ler nem armazenar esse token.

1. A rota interna do launcher recebe o token pelo contexto de autenticação da Intranet.
2. Chama `/api/auth/finance-launch`.
3. O backend obtém o UUID e o e-mail diretamente do perfil autenticado.
4. Cria um ticket `HttpOnly` curto, assinado e restrito ao caminho financeiro.
5. O navegador é redirecionado para `/financeiro/access`.

O Bearer corporativo nunca entra no bundle do BNK.

## Contrato do launcher

### Requisição

```http
POST /api/auth/finance-launch
Accept: application/json
Authorization: Bearer <token corporativo>
```

### Resposta

```http
HTTP/1.1 200 OK
Cache-Control: no-store, max-age=0
Set-Cookie: step_finance_launch=<ticket>; Path=/api/finance/session; HttpOnly; Secure; SameSite=Strict; Max-Age=75
```

```json
{
  "redirectTo": "/financeiro/access"
}
```

O launcher deve:

- reutilizar a validação de sessão atual da Intranet;
- obter UUID, e-mail e módulos do perfil autenticado;
- nunca aceitar UUID, e-mail ou perfil enviados pelo navegador;
- validar que o UUID possui formato válido;
- criar nonce criptográfico de 32 bytes;
- assinar o ticket com `FINANCE_SSO_SHARED_SECRET`;
- limitar a validade a 75 segundos.

A existência do card ou de uma permissão visual na Intranet não substitui a concessão independente armazenada no BNK.

Referências:

```text
integration/intranet/frontend/FinanceControlLauncher.tsx
integration/intranet/netlify/functions/finance-launch.mts
```

## Conteúdo do ticket

```json
{
  "intranet_user_id": "UUID-DO-USUARIO-NO-SUPABASE-PRINCIPAL",
  "email": "usuario@step-og.com",
  "permission": "financeiro:controle-bancario",
  "issued_at": 1784137000000,
  "expires_at": 1784137075000,
  "nonce": "valor-aleatorio-com-pelo-menos-24-caracteres",
  "session_id": "identificador-da-sessao-corporativa"
}
```

O ticket é assinado antes de ser armazenado no cookie. O bootstrap valida assinatura, conteúdo, prazo e UUID.

## Contrato do bootstrap

### Requisição do frontend BNK

```http
POST /api/finance/session/bootstrap
Accept: application/json
Content-Type: application/json
```

O cookie `step_finance_launch` é enviado automaticamente com `credentials: include`.

### Resposta de sucesso

```http
HTTP/1.1 200 OK
Cache-Control: no-store, max-age=0
Set-Cookie: step_finance_launch=; Max-Age=0
```

```json
{
  "token_hash": "TOKEN_TEMPORARIO_GERADO_PELO_SUPABASE_BNK",
  "expires_in": 60,
  "access": {
    "role": "owner",
    "status": "pending_face",
    "biometric_status": "required"
  }
}
```

O frontend usa o valor uma única vez:

```ts
await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink'
});
```

A Function de bootstrap apaga o ticket inclusive em erro. Uma cópia reapresentada é recusada pela proteção de replay.

Referência:

```text
integration/intranet/netlify/functions/finance-session-bootstrap.mts
```

## Contrato servidor a servidor

A Function da Intranet envia para:

```text
POST https://fowqidmmseynoneekrse.supabase.co/functions/v1/intranet-session-bootstrap
```

Cabeçalhos:

```http
Content-Type: application/json
apikey: <FINANCE_SUPABASE_PUBLISHABLE_KEY>
x-step-finance-signature: <HMAC_SHA256_HEX>
```

Assinatura:

```text
HMAC-SHA256(FINANCE_SSO_SHARED_SECRET, "v1." + corpo_json_exato)
```

## Regras da Edge Function BNK

A Edge Function `intranet-session-bootstrap` aplica:

- comparação HMAC em tempo constante;
- tolerância máxima de relógio de 60 segundos;
- validade máxima da asserção de 90 segundos;
- UUID principal obrigatório;
- e-mail corporativo normalizado;
- nonce de uso único;
- consulta de `security.finance_access_grants`;
- recusa quando não existe concessão financeira;
- recusa de acesso `blocked` ou `revoked`;
- vínculo do UUID principal à identidade técnica BNK;
- geração do `token_hash` pela Admin API apenas dentro do Supabase BNK;
- auditoria de emissão, assinatura inválida, ausência de concessão e replay.

Não criar acesso automaticamente para qualquer usuário autenticado na Intranet.

## Identidade técnica do BNK

O Supabase BNK mantém uma identidade técnica para sessão, RLS e auditoria. Ela não representa um segundo login do colaborador.

Para novos usuários:

```text
intranet-<UUID-PRINCIPAL>@bnk.internal.invalid
```

Regras:

- endereço interno não entregável;
- sem senha fornecida ao usuário;
- sem recuperação de senha;
- sem login independente;
- `standalone_login_allowed=false` nos metadados;
- vínculo obrigatório ao UUID principal.

## Cadastro facial obrigatório

Após MFA e antes do dispositivo:

```text
/financeiro/security/face-enrollment
```

Fluxo:

1. consentimento biométrico obrigatório;
2. desafio de poses com sequência aleatória;
3. captura frontal, esquerda e direita;
4. resolução mínima e tamanho validados;
5. imagens duplicadas recusadas por hash;
6. upload para bucket privado do BNK;
7. registro de qualidade e método de vivacidade;
8. descriptor criptografado com AES-256-GCM quando fornecido pelo motor facial;
9. alteração do acesso de `pending_face` para `active`;
10. liberação do papel financeiro correspondente.

Enquanto a biometria não estiver `active`:

- `public.user_roles` permanece `blocked`;
- `can_manage_master`, `can_manage_users` e `can_edit_finance` são falsos;
- ativação manual é recusada;
- as tabelas financeiras permanecem bloqueadas por RLS.

Bucket:

```text
biometric-reference-images
```

O bucket é privado, possui limite de 5 MB por arquivo e aceita JPEG, PNG e WebP.

O adaptador atual é `step-guided-face-capture`. O motor exato de comparação utilizado no Apontamento será conectado quando o repositório correspondente estiver disponível, mantendo todo o armazenamento no BNK.

## Administração de usuários

### Proprietário

Rota exclusiva:

```text
/financeiro/master-administrator
```

Somente o Proprietário recebe `can_manage_master=true`. A rota e o item do menu são invisíveis aos demais.

### Proprietário e Master

Rota de usuários:

```text
/financeiro/access-management
```

Podem conceder:

- `editor`;
- `viewer`;
- `auditor`.

O formulário exige UUID real do Supabase principal, e-mail corporativo, nome, papel e motivo.

## Estruturas privadas

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
- sem acesso para `public`, `anon` e `authenticated`;
- acesso somente por `service_role` nas Edge Functions;
- auditoria com trigger imutável;
- índices únicos para um Proprietário e um Master;
- funções administrativas executáveis somente por `service_role`.

## Rotas antigas aposentadas

O modelo integrado não utiliza:

- login local;
- token por e-mail;
- verificação de token por e-mail;
- passkey como porta independente.

As tabelas e funções antigas tiveram privilégios revogados. Mesmo que uma versão antiga da Edge Function receba chamada, ela não consegue ler ou gravar tokens e credenciais.

## Edge Functions BNK

```text
intranet-session-bootstrap
finance-access-control
finance-biometric
```

- `intranet-session-bootstrap`: autenticação HMAC personalizada; `verify_jwt=false` por necessidade do servidor da Intranet.
- `finance-access-control`: exige JWT financeiro válido.
- `finance-biometric`: exige JWT financeiro válido.

## Variáveis das Functions da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_PUBLISHABLE_KEY=<chave pública>
FINANCE_SSO_SHARED_SECRET=<segredo HMAC entre servidores>
```

Não configurar `FINANCE_SUPABASE_SERVICE_ROLE_KEY` na Intranet.

## Respostas de erro

- `401 INTRANET_SESSION_REQUIRED` — sessão ou ticket ausente/expirado.
- `401 INVALID_SIGNATURE` — assinatura servidor a servidor inválida.
- `401 ASSERTION_EXPIRED` — asserção fora da janela permitida.
- `403 FINANCE_PERMISSION_DENIED` — launcher corporativo recusado.
- `403 FINANCE_ACCESS_NOT_GRANTED` — usuário autenticado, mas sem concessão no BNK.
- `403 FINANCE_USER_BLOCKED` — acesso financeiro bloqueado ou revogado.
- `404 FINANCE_USER_NOT_PROVISIONED` — identidade técnica BNK incompleta.
- `409 ASSERTION_REPLAYED` — ticket/nonce já consumido.
- `504 FINANCE_BOOTSTRAP_TIMEOUT` — serviço financeiro não respondeu no limite.
- `500 FINANCE_BOOTSTRAP_FAILED` — falha interna sem detalhes sensíveis.

## Publicação do frontend

```bash
npm install
npm run build
```

Saída:

```text
dist/financeiro/
```

Copiar para o deploy da Intranet:

```text
public/financeiro/
```

Rewrite antes do fallback global:

```toml
[[redirects]]
  from = "/financeiro/*"
  to = "/financeiro/index.html"
  status = 200
```

## Functions obrigatórias no repositório da Intranet

```text
/api/auth/finance-launch
/api/finance/session/bootstrap
/api/finance/session/logout
```

Arquivos de referência:

```text
integration/intranet/frontend/FinanceControlLauncher.tsx
integration/intranet/netlify/functions/finance-launch.mts
integration/intranet/netlify/functions/finance-session-bootstrap.mts
integration/intranet/netlify/functions/finance-session-logout.mts
integration/intranet/machine-finance-module.json
```

O deploy atual da Intranet ainda não contém essas Functions. Enquanto elas não forem adicionadas ao repositório principal, `/financeiro/access` exibirá que a ponte financeira não está publicada.

## Migrações BNK

```text
20260715175017_add_intranet_sso_nonce_replay_protection.sql
20260715175100_add_consume_intranet_sso_nonce_rpc.sql
20260715180413_add_intranet_finance_identity_links.sql
20260715180445_add_resolve_intranet_finance_identity_rpc.sql
20260715182629_create_strict_finance_governance_and_biometrics.sql
20260715182709_fix_biometric_enrollment_rpc_scope.sql
20260715183459_add_finance_access_touch_rpc.sql
20260715185135_enforce_biometric_before_finance_privileges.sql
20260715185823_retire_legacy_finance_auth_paths.sql
20260715185912_force_rls_on_finance_security_tables.sql
```

## Testes de aceite

- [ ] launcher sem Bearer recebe `401`;
- [ ] launcher rejeita perfil sem UUID válido;
- [ ] ticket contém UUID principal e e-mail corporativo;
- [ ] ticket adulterado recebe `401`;
- [ ] nonce repetido recebe `409`;
- [ ] usuário autenticado sem concessão BNK recebe `403`;
- [ ] administrador comum da Intranet não administra o financeiro;
- [ ] opção de Master aparece somente para o Proprietário;
- [ ] Master não nomeia outro Master;
- [ ] Proprietário não pode ser bloqueado por operação comum;
- [ ] UUID principal é obrigatório para novas concessões;
- [ ] primeiro acesso exige MFA e cadastro facial;
- [ ] papel financeiro permanece bloqueado antes da biometria;
- [ ] imagens ficam em bucket privado do BNK;
- [ ] auditoria não permite alteração ou exclusão;
- [ ] dispositivo pendente bloqueia o dashboard;
- [ ] URL permanece em `intranet-step.netlify.app/financeiro/...`;
- [ ] não abre nova guia;
- [ ] não existe `iframe`;
- [ ] nenhuma Service Role financeira existe no deploy da Intranet;
- [ ] logout financeiro retorna à Intranet sem encerrar a sessão corporativa.
