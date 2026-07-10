# Cadastro local - BNK / STEP Finance Control

Este pacote muda o login para **autenticação local**, sem precisar criar usuários em:

```text
Supabase > Authentication > Users
```

## Administrador inicial

O SQL cria o usuário local:

```text
E-mail: douglas.tabella@step-og.com
Senha: definida no SQL enviado
Perfil: super_admin
```

## Como aplicar

1. Rode no Supabase SQL Editor:

```text
supabase/migrations/002_local_auth_bnk.sql
```

2. Suba o projeto corrigido no GitHub.
3. O Netlify faz o deploy.
4. Faça login com o usuário local.
5. Entre em **Segurança** para criar novos usuários.

## Segurança

- A senha é salva com hash bcrypt usando `crypt()` e `gen_salt('bf', 12)`.
- O frontend não acessa senha nem hash.
- A sessão usa token aleatório e armazena somente hash no banco.
- O primeiro dispositivo do Super Administrador é aprovado automaticamente.
- Novos usuários ficam com dispositivo pendente até o administrador aprovar.

## Observação importante

Como agora é autenticação local, não use mais `Supabase Authentication > Users` para criar login.
O cadastro passa a ser feito dentro do próprio painel, menu **Segurança**.
