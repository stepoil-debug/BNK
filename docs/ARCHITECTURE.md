# Arquitetura

## Por que projeto separado?

O financeiro deve ficar fora da Intranet principal para reduzir exposição.

Separação recomendada:

| Camada | Recomendação |
|---|---|
| Código | GitHub separado |
| Banco | Supabase separado |
| Deploy | Netlify separado |
| Acesso na Intranet | Card com redirect |
| Permissões | RLS + roles no banco |
| Segurança | MFA + dispositivo aprovado + logs |

## Fluxo de dados

```txt
Formulário financeiro
  ↓
finance_positions
  ↓
finance_position_items
  ↓
v_dashboard_totals
  ↓
Dashboard
```

## Campos financeiros

A planilha original tinha colunas fixas. O sistema transforma essas colunas em `finance_field_templates`.

Isso permite cadastrar novo banco/cartão/linha de crédito sem alterar código ou banco.

## Perfis

| Perfil | Descrição |
|---|---|
| super_admin | Controle total |
| admin | Aprova dispositivos e gerencia acessos |
| finance_editor | Preenche e publica posições |
| finance_viewer | Visualiza dashboard |
| auditor | Visualiza dados e logs |
| blocked | Sem acesso |
