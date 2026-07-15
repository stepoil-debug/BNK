# Integração BNK dentro da Intranet STEP

## Objetivo

Disponibilizar o módulo financeiro na mesma origem da Intranet, em `/financeiro/*`, mantendo o repositório e o Supabase financeiros separados.

Não usar:

- domínio financeiro visível ao usuário;
- nova guia;
- `iframe`;
- segundo formulário de usuário e senha;
- `SERVICE_ROLE_KEY` no frontend.

## Fronteiras

| Camada | Responsabilidade |
|---|---|
| Intranet | Login corporativo, cookie de sessão, cards, permissão `financeiro:controle-bancario` e endpoint de bootstrap |
| BNK frontend | Interface em `/financeiro/*`, troca do token temporário, MFA, dispositivo e telas financeiras |
| Supabase financeiro | Auth financeiro, RLS, perfis, posições, dispositivos, eventos e auditoria |

## Contrato do endpoint de bootstrap

### Requisição

```http
POST /api/finance/session/bootstrap
Accept: application/json
Content-Type: application/json
Cookie: <sessão HttpOnly da Intranet>
```

```json
{
  "permission": "financeiro:controle-bancario"
}
```

O frontend usa `credentials: include`. O endpoint não deve aceitar identidade, e-mail ou perfil enviados livremente pelo navegador. Esses dados precisam vir da sessão corporativa validada no servidor.

### Resposta de sucesso

```http
HTTP/1.1 200 OK
Cache-Control: no-store, max-age=0
Content-Type: application/json
```

```json
{
  "token_hash": "TOKEN_TEMPORARIO_GERADO_PELO_SUPABASE"
}
```

O `token_hash` deve ser criado com o Admin API do Supabase financeiro:

```js
const { data, error } = await financeAdmin.auth.admin.generateLink({
  type: 'magiclink',
  email: corporateUser.email,
  options: {
    redirectTo: `${origin}/financeiro/access`
  }
});

const tokenHash = data.properties.hashed_token;
```

O frontend usa esse valor somente uma vez:

```ts
await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: 'magiclink'
});
```

### Respostas de erro

```json
{
  "code": "FINANCE_PERMISSION_DENIED",
  "message": "Usuário sem acesso ao Controle Bancário."
}
```

Códigos mínimos:

- `401 INTRANET_SESSION_REQUIRED` — sessão corporativa ausente ou inválida.
- `403 FINANCE_PERMISSION_DENIED` — sem `financeiro:controle-bancario`.
- `403 FINANCE_USER_BLOCKED` — perfil financeiro inativo ou bloqueado.
- `404 FINANCE_USER_NOT_PROVISIONED` — e-mail ainda não cadastrado no Supabase financeiro.
- `429 FINANCE_BOOTSTRAP_RATE_LIMITED` — excesso de tentativas.
- `500 FINANCE_BOOTSTRAP_FAILED` — falha interna sem expor detalhes sensíveis.

## Algoritmo obrigatório no backend da Intranet

1. Ler e validar o cookie assinado `HttpOnly` já usado pela Intranet.
2. Carregar o usuário corporativo pelo identificador da sessão.
3. Verificar a permissão canônica `financeiro:controle-bancario`.
4. Aplicar rate limit por usuário, sessão e IP.
5. Normalizar o e-mail corporativo em minúsculas.
6. Criar um cliente Supabase financeiro com `FINANCE_SUPABASE_SERVICE_ROLE_KEY`, exclusivamente no servidor.
7. Consultar `profiles` pelo e-mail e exigir `status = active`.
8. Consultar `user_roles` e rejeitar `blocked`.
9. Gerar o link temporário com `auth.admin.generateLink`.
10. Retornar somente `properties.hashed_token`.
11. Registrar sucesso ou falha em `security_events`/auditoria financeira.
12. Responder com `Cache-Control: no-store`.

Não criar automaticamente acesso financeiro para qualquer colaborador da Intranet. O usuário precisa estar previamente provisionado e autorizado no Supabase financeiro.

## Variáveis do backend da Intranet

```bash
FINANCE_SUPABASE_URL=https://fowqidmmseynoneekrse.supabase.co
FINANCE_SUPABASE_SERVICE_ROLE_KEY=<somente servidor>
FINANCE_REQUIRED_PERMISSION=financeiro:controle-bancario
```

A chave `FINANCE_SUPABASE_SERVICE_ROLE_KEY` deve existir apenas nas variáveis protegidas do Netlify/backend. Nunca prefixar com `VITE_`.

## Endpoint de saída

```http
POST /api/finance/session/logout
Cookie: <sessão HttpOnly da Intranet>
```

Responsabilidades:

- invalidar eventual ticket financeiro ainda aberto;
- registrar o evento de saída;
- responder `204` ou `200` com `Cache-Control: no-store`;
- não encerrar obrigatoriamente a sessão principal da Intranet.

O frontend encerra a sessão Supabase financeira e retorna para `/intranet`.

## Publicação do frontend

No repositório BNK:

```bash
npm ci
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
- [ ] `SERVICE_ROLE_KEY` não aparece no bundle ou no DevTools;
- [ ] saída do financeiro retorna para `/intranet` sem derrubar a sessão corporativa.
