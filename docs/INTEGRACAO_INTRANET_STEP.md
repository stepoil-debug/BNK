# Integração BNK dentro da Intranet STEP

## Objetivo

Disponibilizar o módulo financeiro na mesma origem da Intranet, em `/financeiro/*`, mantendo o repositório e o Supabase financeiros separados.

Não usar:

- domínio financeiro visível ao usuário;
- nova guia;
- `iframe`;
- segundo formulário de usuário e senha;
- `SERVICE_ROLE_KEY` financeira na Intranet ou no frontend.

## Fronteiras

| Camada | Responsabilidade |
|---|---|
| Intranet | Login corporativo, sessão, cards, permissão `financeiro:controle-bancario` e assinatura da asserção HMAC |
| BNK frontend | Interface em `/financeiro/*`, troca do token temporário, MFA, dispositivo e telas financeiras |
| Supabase financeiro | Validação da asserção, proteção contra replay, Auth financeiro, RLS, perfis, posições, dispositivos, eventos e auditoria |

## Arquitetura de menor privilégio

A Service Role do Supabase financeiro permanece exclusivamente dentro do projeto BNK. A Intranet conhece somente:

- a URL pública do Supabase financeiro;
- a chave publicável;
- um segredo HMAC compartilhado entre servidores.

```text
Navegador
  └── POST /api/finance/session/bootstrap
          └── Netlify Function da Intranet
                 ├── valida sessão corporativa
                 ├── exige financeiro:controle-bancario
                 ├── deriva e-mail da sessão
                 ├── cria nonce + validade curta
                 └── assina v1.<corpo JSON> com HMAC-SHA256
                          └── Edge Function BNK intranet-session-bootstrap
                                 ├── valida HMAC e prazo
                                 ├── consome nonce de uso único
                                 ├── valida profile/role/Auth
                                 ├── registra auditoria
                                 └── gera token_hash de magic link
                                          └── frontend verifyOtp
```

## Contrato público para o frontend

### Requisição

```http
POST /api/finance/session/bootstrap
Accept: application/json
Content-Type: application/json
Cookie: <sessão da Intranet, quando aplicável>
Authorization: Bearer <token da Intranet, quando aplicável>
```

```json
{
  "permission": "financeiro:controle-bancario"
}
```

O endpoint da Intranet não aceita e-mail, usuário, papel ou módulos enviados pelo navegador. A identidade é obtida exclusivamente da sessão corporativa validada.

### Resposta de sucesso

```http
HTTP/1.1 200 OK
Cache-Control: no-store, max-age=0
Content-Type: application/json
```

```json
{
  "token_hash": "TOKEN_TEMPORARIO_GERADO_PELO_SUPABASE_BNK",
  "expires_in": 60
}
```

O frontend usa esse valor uma única vez:

```ts
await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink'
});
```

## Contrato servidor a servidor

A Netlify Function da Intranet envia para:

```text
POST https://fowqidmmseynoneekrse.supabase.co/functions/v1/intranet-session-bootstrap
```

Cabeçalhos:

```http
Content-Type: application/json
apikey: <FINANCE_SUPABASE_PUBLISHABLE_KEY>
x-step-finance-signature: <HMAC_SHA256_HEX>
```

Corpo JSON serializado uma única vez:

```json
{
  "email": "usuario@step-og.com",
  "permission": "financeiro:controle-bancario",
  "issued_at": 1784137000000,
  "expires_at": 1784137090000,
  "nonce": "valor-aleatorio-com-pelo-menos-24-caracteres",
  "session_id": "identificador-da-sessao-corporativa"
}
```

Assinatura:

```text
HMAC-SHA256(FINANCE_SSO_SHARED_SECRET, "v1." + corpo_json_exato)
```

Regras aplicadas pela Edge Function BNK:

- tolerância máxima de relógio: 60 segundos;
- validade máxima da asserção: 90 segundos;
- permissão exata `financeiro:controle-bancario`;
- nonce de uso único;
- comparação de assinatura em tempo constante;
- perfil financeiro previamente provisionado e ativo;
- papel financeiro existente e diferente de `blocked`;
- usuário correspondente no Supabase Auth;
- auditoria dos sucessos, falhas de assinatura e tentativas de replay.

## Respostas de erro

```json
{
  "code": "FINANCE_PERMISSION_DENIED",
  "message": "Usuário sem acesso ao Controle Bancário."
}
```

Códigos mínimos:

- `401 INTRANET_SESSION_REQUIRED` — sessão corporativa ausente ou inválida na Intranet.
- `401 INVALID_SIGNATURE` — assinatura servidor a servidor inválida.
- `401 ASSERTION_EXPIRED` — asserção vencida ou fora da tolerância.
- `403 FINANCE_PERMISSION_DENIED` — sem `financeiro:controle-bancario`.
- `403 FINANCE_USER_BLOCKED` — perfil financeiro inativo ou bloqueado.
- `404 FINANCE_USER_NOT_PROVISIONED` — e-mail ainda não cadastrado no Supabase financeiro.
- `409 ASSERTION_REPLAYED` — nonce já utilizado.
- `429 FINANCE_BOOTSTRAP_RATE_LIMITED` — excesso de tentativas, quando o limitador da Intranet for acionado.
- `500 FINANCE_BOOTSTRAP_FAILED` — falha interna sem expor detalhes sensíveis.

## Algoritmo da Netlify Function da Intranet

1. Aceitar somente `POST`.
2. Validar a sessão da Intranet usando o mecanismo já existente.
3. Carregar o perfil corporativo e `allowedModules`.
4. Autorizar `*`, `financeiro` ou `financeiro:controle-bancario`.
5. Normalizar o e-mail corporativo em minúsculas.
6. Criar `issued_at`, `expires_at`, `nonce` criptográfico e identificador da sessão.
7. Serializar o corpo uma única vez.
8. Assinar `v1.<corpo>` com `FINANCE_SSO_SHARED_SECRET`.
9. Chamar a Edge Function BNK com timeout de até 12 segundos.
10. Repassar somente a resposta segura da Edge Function.
11. Responder com `Cache-Control: no-store`.
12. Nunca aceitar a identidade enviada pelo navegador.

A implementação de referência está em:

```text
integration/intranet/netlify/functions/finance-session-bootstrap.mts
```

## Variáveis das Functions da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_PUBLISHABLE_KEY=<chave pública>
FINANCE_SSO_SHARED_SECRET=<segredo HMAC entre servidores>
```

Não configurar `FINANCE_SUPABASE_SERVICE_ROLE_KEY` na Intranet.

## Configuração dentro do Supabase BNK

A Edge Function publicada é:

```text
intranet-session-bootstrap
```

Estruturas de proteção contra replay:

```text
security.intranet_sso_nonces
public.consume_intranet_sso_nonce(...)
```

O segredo HMAC é armazenado como configuração privada do ambiente BNK. A Service Role é usada apenas pela Edge Function do próprio projeto financeiro.

Não criar automaticamente acesso financeiro para qualquer colaborador da Intranet. O usuário precisa estar previamente provisionado e autorizado no Supabase financeiro.

## Endpoint de saída

```http
POST /api/finance/session/logout
```

Responsabilidades:

- registrar a saída financeira quando aplicável;
- responder `204` ou `200` com `Cache-Control: no-store`;
- não encerrar obrigatoriamente a sessão principal da Intranet.

O frontend encerra a sessão Supabase financeira e retorna para `/intranet`.

## Publicação do frontend

No repositório BNK:

```bash
npm install
npm run build
```

Saída:

```text
dist/financeiro/
```

No pipeline da Intranet, copiar o conteúdo para:

```text
public/financeiro/
```

O deploy final deve conter:

```text
/financeiro/index.html
/financeiro/assets/*
```

O GitHub Actions do BNK também publica o artefato:

```text
bnk-financeiro-intranet
```

## Rewrites no projeto da Intranet

O rewrite precisa ser incluído antes do fallback global da SPA da Intranet:

```toml
[[redirects]]
  from = "/financeiro/*"
  to = "/financeiro/index.html"
  status = 200
```

Arquivos reais em `/financeiro/assets/*` devem continuar sendo servidos normalmente.

## Card e subcard

Fluxo visual:

```text
Financeiro
  └── Controle Bancário
       └── /financeiro/access
```

A abertura deve ocorrer na mesma guia:

```ts
window.location.assign('/financeiro/access');
```

Catálogo de referência:

```text
integration/intranet/machine-finance-module.json
```

## Segunda camada de segurança

Depois da sessão temporária ser criada:

1. usuário sem TOTP configurado vai para `/financeiro/security/setup`;
2. usuário com TOTP em AAL1 vai para `/financeiro/security/challenge`;
3. após AAL2, o dispositivo é validado;
4. dispositivo pendente vai para `/financeiro/security/device-check`;
5. somente então o dashboard é liberado.

## Testes de aceite

- [ ] usuário sem sessão da Intranet recebe `401`;
- [ ] usuário sem permissão recebe `403`;
- [ ] e-mail enviado pelo navegador é ignorado;
- [ ] assinatura HMAC adulterada recebe `401`;
- [ ] asserção expirada recebe `401`;
- [ ] nonce repetido recebe `409`;
- [ ] usuário não provisionado no financeiro recebe `404`;
- [ ] usuário bloqueado não recebe token;
- [ ] token temporário não pode ser reutilizado;
- [ ] senha não aparece no fluxo integrado;
- [ ] MFA continua obrigatório;
- [ ] dispositivo pendente continua bloqueando o dashboard;
- [ ] URL permanece em `intranet-step.netlify.app/financeiro/...`;
- [ ] nenhuma página é aberta em nova guia;
- [ ] não existe `iframe`;
- [ ] assets carregam corretamente sob `/financeiro/assets/*`;
- [ ] atualizar diretamente `/financeiro/dashboard` não gera 404;
- [ ] nenhuma `SERVICE_ROLE_KEY` financeira existe no deploy da Intranet;
- [ ] saída do financeiro retorna para `/intranet` sem derrubar a sessão corporativa.
