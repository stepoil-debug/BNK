# Provisionamento de identidade Intranet → BNK

## Fonte de identidade

O usuário é autenticado exclusivamente pelo Supabase principal da Intranet. O BNK não mantém um segundo cadastro de login para o colaborador.

Cada acesso autorizado precisa estar em:

```text
security.finance_access_grants
```

Campos obrigatórios:

- `intranet_user_id`: UUID real do usuário no Supabase principal;
- `corporate_email`: e-mail corporativo normalizado;
- `finance_user_id`: identidade técnica interna do BNK;
- `role`: `owner`, `master_admin`, `editor`, `viewer` ou `auditor`;
- `status`: `pending_face`, `active`, `blocked` ou `revoked`;
- `biometric_required`: sempre `true` para usuários financeiros.

## Regra de criação

Não inserir usuários financeiros manualmente pelo SQL e não criar acesso somente pelo e-mail.

O fluxo aprovado é:

1. selecionar um usuário existente no Supabase principal da Intranet;
2. enviar o UUID, nome e e-mail corporativo para `finance-access-control`;
3. a Edge Function cria ou localiza a identidade técnica interna;
4. a função SQL registra a concessão e a auditoria;
5. `public.user_roles` permanece `blocked`;
6. no primeiro acesso, o usuário cadastra a biometria facial;
7. somente após biometria ativa o papel financeiro é liberado.

A identidade técnica criada para novos usuários utiliza e-mail interno não entregável:

```text
intranet-<UUID>@bnk.internal.invalid
```

Esse e-mail não é usado para login, recuperação de senha ou envio de token.

## Quem pode conceder

- `owner`: concede usuários comuns e define o Administrador Master.
- `master_admin`: concede somente `editor`, `viewer` e `auditor`.
- qualquer outro perfil: não lista nem modifica concessões.

A rota de nomeação do Master é visível e executável somente pelo Proprietário.

## Compatibilidade anterior

A tabela abaixo permanece apenas para compatibilidade com o primeiro vínculo criado antes da adoção do UUID principal:

```text
security.intranet_identity_links
```

Ela não deve ser usada para novas concessões. O bootstrap atual consulta `finance_access_grants` e vincula `intranet_user_id` no primeiro lançamento autenticado.

## Bloqueio e revogação

As mudanças são feitas somente pela Edge Function `finance-access-control`, que chama:

```text
public.finance_change_access_status(...)
```

Regras:

- o Proprietário nunca pode ser bloqueado por essa operação;
- somente o Proprietário modifica o Master;
- o Master não modifica a si mesmo para preservar privilégios;
- ativação é recusada enquanto a biometria não estiver `active`;
- todo bloqueio, reativação ou revogação exige motivo e gera auditoria.

## Segurança

- schema `security` sem acesso para `public`, `anon` ou `authenticated`;
- RLS forçada nas tabelas de governança e biometria;
- funções administrativas executáveis somente por `service_role`;
- auditoria imutável;
- um único Proprietário e um único Master;
- identidade da Intranet vinculada pelo UUID, não apenas pelo e-mail;
- rotas antigas de login local, token por e-mail e passkey aposentadas.
