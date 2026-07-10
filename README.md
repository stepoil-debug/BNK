# STEP Finance Control

Sistema financeiro separado da Intranet, preparado para funcionar como um cofre financeiro com:

- Supabase separado.
- GitHub separado.
- Netlify separado.
- Login fechado por convite.
- MFA/TOTP obrigatório via Authy, Google Authenticator ou Microsoft Authenticator.
- Aprovação manual do primeiro dispositivo.
- Perfis de acesso.
- Row Level Security em todas as tabelas.
- Logs de segurança e auditoria.
- Formulário interno para alimentar o dashboard financeiro sem Open Finance.
- Estrutura preparada para importação de arquivos e futura integração Open Finance.

## Decisão recomendada de hospedagem

Use **Netlify separado** para este projeto.

A Intranet deve ter apenas um card de acesso que redireciona para o domínio do cofre financeiro. Assim, o financeiro fica isolado em infraestrutura, banco, deploy, variáveis e permissões.

Modelo:

```txt
Intranet STEP
  └── Card "Controle Financeiro"
       └── redireciona para Netlify separado
             └── STEP Finance Control
                  └── Supabase financeiro separado
```

## Instalação local

```bash
npm install
cp .env.example .env
npm run dev
```

Preencha o `.env`:

```bash
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_ANON_KEY
```

## Banco Supabase

1. Crie um projeto novo no Supabase.
2. Execute o SQL em:

```txt
supabase/migrations/001_step_finance_control.sql
```

3. Crie seu usuário administrador no Supabase Auth.
4. Depois de criar seu usuário, rode no SQL Editor:

```sql
update public.user_roles
set role = 'super_admin'
where user_id = '<SEU_USER_ID>';
```

## Fluxo de acesso

1. E-mail e senha.
2. Se o usuário ainda não configurou MFA, ele é obrigado a configurar.
3. O sistema exibe QR Code para Authy/Google Authenticator/Microsoft Authenticator.
4. O usuário valida o código de 6 dígitos.
5. O dispositivo é identificado pelo navegador.
6. Se for primeiro acesso, o dispositivo fica pendente.
7. O Super Admin aprova ou bloqueia.
8. Acesso ao dashboard é liberado.

## Alimentação do dashboard

Nesta primeira versão não usamos Open Finance.

O dashboard é alimentado pela tela:

```txt
Nova Posição Financeira
```

Ela contém os campos da planilha enviada, organizados por grupos:

- Contas Bancárias.
- Investimentos.
- Cartões de Crédito.
- Linhas de Crédito.
- Empresas / Contas vinculadas.

Os totais são calculados automaticamente. O usuário não digita total.

## Próximas etapas

- Importação Excel/CSV.
- Importação OFX.
- Leitura de PDF de fatura.
- Passkey/WebAuthn ativada no frontend.
- Exportação PDF do dashboard.
- Integração Pluggy/Belvo em sandbox.
