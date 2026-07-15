# Integração BNK dentro da Intranet STEP

## Objetivo

Disponibilizar o Controle Bancário na mesma origem da Intranet, em `/financeiro/*`, mantendo o repositório e o Supabase financeiros separados.

Não usar:

- domínio financeiro visível ao usuário;
- nova guia;
- `iframe`;
- segundo formulário de usuário e senha;
- Service Role financeira na Intranet ou no frontend.

## Fronteiras

| Camada | Responsabilidade |
|---|---|
| Intranet | Login corporativo, Bearer token, cards, launcher, permissão `financeiro:controle-bancario` e ticket `HttpOnly` |
| BNK frontend | Interface em `/financeiro/*`, consumo do bootstrap, MFA, dispositivo e telas financeiras |
| Supabase BNK | Validação HMAC, proteção contra replay, Auth financeiro, RLS, perfis, posições, dispositivos e auditoria |

## Fluxo final

```text
Card Financeiro > Controle Bancário
  └── /intranet/financeiro/controle-bancario
       └── POST /api/auth/finance-launch
            Authorization: Bearer <sessão corporativa>
            ├── consulta /api/auth/profile
            ├── exige financeiro:controle-bancario
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
                           ├── valida HMAC, prazo e permissão
                           ├── consome nonce de uso único
                           ├── valida profile, role e Auth
                           ├── registra auditoria
                           └── retorna token_hash
                                └── frontend verifyOtp
                                     ├── MFA/TOTP
                                     ├── dispositivo aprovado
                                     └── /financeiro/dashboard
```

## Por que existe um launcher

Os módulos existentes da Intranet usam Bearer token nos endpoints de lançamento. O bundle financeiro não deve ler nem armazenar esse Bearer token. Por isso:

1. a página interna do launcher recebe o token pelo contexto de autenticação da Intranet;
2. chama `/api/auth/finance-launch`;
3. o backend valida a identidade e gera um ticket `HttpOnly` curto;
4. somente depois o navegador é redirecionado para `/financeiro/access`.

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

- reutilizar o mecanismo atual de validação da Intranet;
- obter o e-mail e `allowedModules` de `/api/auth/profile` ou do resolvedor interno equivalente;
- autorizar somente `*`, `financeiro` ou `financeiro:controle-bancario`;
- ignorar qualquer identidade enviada pelo navegador;
- criar um `nonce` criptográfico de 32 bytes;
- assinar o ticket com `FINANCE_SSO_SHARED_SECRET`;
- manter validade máxima de 75 segundos.

Referências:

```text
integration/intranet/frontend/FinanceControlLauncher.tsx
integration/intranet/netlify/functions/finance-launch.mts
```

## Contrato do bootstrap

### Requisição do BNK frontend

```http
POST /api/finance/session/bootstrap
Accept: application/json
Content-Type: application/json
```

O cookie `step_finance_launch` é enviado automaticamente porque a chamada usa `credentials: include`.

### Resposta de sucesso

```http
HTTP/1.1 200 OK
Cache-Control: no-store, max-age=0
Set-Cookie: step_finance_launch=; Max-Age=0
```

```json
{
  "token_hash": "TOKEN_TEMPORARIO_GERADO_PELO_SUPABASE_BNK",
  "expires_in": 60
}
```

O frontend usa o valor uma única vez:

```ts
await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink'
});
```

A Function de bootstrap sempre apaga o ticket, inclusive em erro. Uma cópia reapresentada é recusada pela proteção de replay do Supabase BNK.

Referência:

```text
integration/intranet/netlify/functions/finance-session-bootstrap.mts
```

## Contrato servidor a servidor

A Function de bootstrap envia para:

```text
POST https://fowqidmmseynoneekrse.supabase.co/functions/v1/intranet-session-bootstrap
```

Cabeçalhos:

```http
Content-Type: application/json
apikey: <FINANCE_SUPABASE_PUBLISHABLE_KEY>
x-step-finance-signature: <HMAC_SHA256_HEX>
```

Corpo JSON, derivado do ticket validado:

```json
{
  "email": "usuario@step-og.com",
  "permission": "financeiro:controle-bancario",
  "issued_at": 1784137000000,
  "expires_at": 1784137075000,
  "nonce": "valor-aleatorio-com-pelo-menos-24-caracteres",
  "session_id": "identificador-da-sessao-corporativa"
}
```

Assinatura:

```text
HMAC-SHA256(FINANCE_SSO_SHARED_SECRET, "v1." + corpo_json_exato)
```

## Regras da Edge Function BNK

A Edge Function publicada é:

```text
intranet-session-bootstrap
```

Ela aplica:

- comparação de assinatura em tempo constante;
- tolerância máxima de relógio de 60 segundos;
- validade máxima da asserção de 90 segundos;
- permissão exata `financeiro:controle-bancario`;
- nonce de uso único;
- perfil financeiro previamente provisionado e ativo;
- papel financeiro existente e diferente de `blocked`;
- usuário correspondente no Supabase Auth;
- geração do `token_hash` pela Admin API dentro do próprio Supabase BNK;
- eventos de auditoria para emissão, assinatura inválida e replay.

Estruturas versionadas:

```text
supabase/functions/intranet-session-bootstrap/index.ts
supabase/migrations/20260715175000_intranet_sso_bridge.sql
```

Estruturas implantadas:

```text
security.intranet_sso_nonces
public.consume_intranet_sso_nonce(...)
```

A Service Role permanece exclusivamente dentro do Supabase BNK.

## Variáveis das Functions da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_PUBLISHABLE_KEY=<chave pública>
FINANCE_SSO_SHARED_SECRET=<segredo HMAC entre servidores>
```

Não configurar `FINANCE_SUPABASE_SERVICE_ROLE_KEY` na Intranet.

## Respostas de erro

- `401 INTRANET_SESSION_REQUIRED` — sessão corporativa ou ticket ausente/expirado.
- `401 INVALID_SIGNATURE` — assinatura servidor a servidor inválida.
- `401 ASSERTION_EXPIRED` — asserção fora da janela permitida.
- `403 FINANCE_PERMISSION_DENIED` — sem permissão corporativa.
- `403 FINANCE_USER_BLOCKED` — perfil financeiro inativo ou papel bloqueado.
- `404 FINANCE_USER_NOT_PROVISIONED` — e-mail não cadastrado no Supabase BNK.
- `409 ASSERTION_REPLAYED` — ticket/nonce já consumido.
- `504 FINANCE_BOOTSTRAP_TIMEOUT` — serviço financeiro não respondeu dentro do limite.
- `500 FINANCE_BOOTSTRAP_FAILED` — falha interna sem detalhes sensíveis.

Não criar acesso financeiro automaticamente para qualquer colaborador da Intranet. O usuário precisa estar provisionado e autorizado no Supabase BNK.

## Card, subcard e rota interna

```text
Financeiro
  └── Controle Bancário
       └── /intranet/financeiro/controle-bancario
```

O launcher redireciona, na mesma guia, para:

```text
/financeiro/access
```

Catálogo de referência:

```text
integration/intranet/machine-finance-module.json
```

## Publicação do frontend

No BNK:

```bash
npm install
npm run build
```

Saída:

```text
dist/financeiro/
```

Copiar para o deploy da Intranet como:

```text
public/financeiro/
```

O GitHub Actions também publica:

```text
bnk-financeiro-intranet
```

## Rewrite da Intranet

Adicionar antes do fallback global:

```toml
[[redirects]]
  from = "/financeiro/*"
  to = "/financeiro/index.html"
  status = 200
```

O deploy final deve conter:

```text
/financeiro/index.html
/financeiro/assets/*
```

## Saída do financeiro

```http
POST /api/finance/session/logout
```

O endpoint:

- limpa qualquer ticket residual;
- responde sem cache;
- não derruba a sessão corporativa principal.

O frontend encerra a sessão Supabase financeira e retorna para `/intranet`.

Referência:

```text
integration/intranet/netlify/functions/finance-session-logout.mts
```

## Segunda camada

Depois da criação da sessão financeira:

1. sem TOTP: `/financeiro/security/setup`;
2. TOTP configurado, mas AAL1: `/financeiro/security/challenge`;
3. após AAL2: validação do dispositivo;
4. dispositivo pendente: `/financeiro/security/device-check`;
5. dispositivo aprovado: `/financeiro/dashboard`.

## Testes de aceite

- [ ] launcher sem Bearer recebe `401`;
- [ ] usuário sem permissão recebe `403`;
- [ ] launcher retorna ticket `HttpOnly`, `Secure` e `SameSite=Strict`;
- [ ] ticket vence em até 75 segundos;
- [ ] `/financeiro/access` direto, sem launcher, recebe orientação para voltar ao card;
- [ ] ticket adulterado recebe `401`;
- [ ] assinatura HMAC adulterada recebe `401`;
- [ ] asserção expirada recebe `401`;
- [ ] nonce repetido recebe `409`;
- [ ] usuário não provisionado recebe `404`;
- [ ] usuário bloqueado não recebe token;
- [ ] ticket e `token_hash` não podem ser reutilizados;
- [ ] senha corporativa não aparece no fluxo;
- [ ] MFA continua obrigatório;
- [ ] dispositivo pendente bloqueia o dashboard;
- [ ] URL permanece em `intranet-step.netlify.app/financeiro/...`;
- [ ] não abre nova guia;
- [ ] não existe `iframe`;
- [ ] atualização direta de `/financeiro/dashboard` não gera 404;
- [ ] nenhuma Service Role financeira existe no deploy da Intranet;
- [ ] logout financeiro retorna à Intranet sem encerrar a sessão corporativa.
