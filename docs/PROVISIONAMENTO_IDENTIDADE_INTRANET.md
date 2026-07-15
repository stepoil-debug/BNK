# Provisionamento de identidade Intranet → BNK

A identidade autenticada na Intranet pode usar um e-mail corporativo diferente do e-mail do Supabase Auth financeiro. O vínculo é explícito e fica em:

```text
security.intranet_identity_links
```

## Regra

- `corporate_email`: e-mail retornado pela sessão da Intranet, normalizado em minúsculas.
- `finance_user_id`: UUID existente em `auth.users` e `public.profiles` do BNK.
- `status`: `active`, `blocked` ou `revoked`.

A Edge Function tenta primeiro esse vínculo. Somente quando não existe vínculo ela tenta localizar um perfil financeiro com o mesmo e-mail corporativo.

## Criar ou atualizar um vínculo

Execute no projeto Supabase BNK, substituindo os e-mails:

```sql
insert into security.intranet_identity_links (
  corporate_email,
  finance_user_id,
  status,
  updated_at
)
select
  lower('usuario.corporativo@step-og.com'),
  p.id,
  'active',
  now()
from public.profiles p
where lower(p.email) = lower('email-do-usuario-no-bnk@example.com')
on conflict (corporate_email) do update
set finance_user_id = excluded.finance_user_id,
    status = excluded.status,
    updated_at = now();
```

## Bloquear ou revogar

```sql
update security.intranet_identity_links
set status = 'blocked', updated_at = now()
where corporate_email = lower('usuario.corporativo@step-og.com');
```

```sql
update security.intranet_identity_links
set status = 'revoked', updated_at = now()
where corporate_email = lower('usuario.corporativo@step-og.com');
```

Um vínculo bloqueado ou revogado impede a emissão do token financeiro, mesmo que a conta BNK continue ativa.

## Segurança

- tabela com RLS;
- sem permissões para `anon` ou `authenticated`;
- acesso somente por `service_role` dentro do Supabase BNK;
- resolução feita pela RPC `public.resolve_intranet_finance_identity`, executável somente por `service_role`.
