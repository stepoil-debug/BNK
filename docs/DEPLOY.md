# Deploy

## 1. Supabase

Crie um projeto novo, exclusivo para o financeiro.

Execute:

```txt
supabase/migrations/001_step_finance_control.sql
```

No painel do Supabase, habilite MFA/TOTP se necessário nas configurações de Auth.

## 2. GitHub

Crie um repositório separado, por exemplo:

```txt
step-finance-control
```

Suba este projeto completo.

## 3. Netlify

Crie um site novo e conecte o GitHub separado.

Build command:

```bash
npm run build
```

Publish directory:

```txt
dist
```

Variáveis:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
VITE_APP_NAME=STEP Finance Control
VITE_REQUIRE_PASSKEY=false
```

## 4. Card na Intranet

Use os arquivos em:

```txt
intranet-card/
```

Altere a URL para o domínio real do Netlify.

## 5. Edge Functions opcionais

Para capturar IP do dispositivo:

```bash
supabase functions deploy register-device
```

Para WebAuthn/Passkey:

```bash
supabase functions deploy passkey-register-options
supabase functions deploy passkey-register-verify
supabase functions deploy passkey-auth-options
supabase functions deploy passkey-auth-verify
```

Configure secrets:

```bash
supabase secrets set WEBAUTHN_RP_ID=seu-dominio.netlify.app
supabase secrets set WEBAUTHN_ORIGIN=https://seu-dominio.netlify.app
supabase secrets set WEBAUTHN_RP_NAME="STEP Finance Control"
```
