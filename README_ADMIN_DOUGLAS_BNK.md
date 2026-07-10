# Login protegido + administrador inicial - BNK

## O que foi alterado

- Tela de login redesenhada com visual mais próximo da Intranet STEP.
- Layout com aparência de cofre financeiro protegido.
- E-mail do administrador inicial pré-preenchido:
  - `douglas.tabella@step-og.com`
- A senha **não foi colocada no código**, por segurança.
- Criado SQL para transformar o usuário em Super Administrador.

## Como cadastrar o administrador

1. Vá no Supabase do BNK.
2. Acesse **Authentication > Users**.
3. Clique em **Add user**.
4. Crie o usuário:

```text
E-mail: douglas.tabella@step-og.com
Senha: a senha definida por você
```

5. Depois vá em **SQL Editor**.
6. Execute o arquivo:

```text
supabase/bootstrap_admin_douglas_BNK.sql
```

Ou rode diretamente:

```sql
SELECT security.bootstrap_super_admin('douglas.tabella@step-og.com');
```

## Por que a senha não ficou no frontend?

Porque senha hardcoded no React/Vite iria para o navegador, GitHub e build do Netlify. Isso quebraria a segurança do projeto.

O correto é:
- criar a senha no Supabase Auth;
- deixar o usuário como Super Administrador via SQL;
- exigir MFA e aprovação de dispositivo no primeiro acesso.
