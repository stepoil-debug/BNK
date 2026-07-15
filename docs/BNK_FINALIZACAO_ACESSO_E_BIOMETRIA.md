# Estado final — BNK, governança e biometria

Data: 15/07/2026

## Concluído no repositório BNK

- aplicação preparada para `/financeiro/*`;
- autenticação independente por senha removida do fluxo integrado;
- launcher de referência com UUID do Supabase principal;
- ticket `HttpOnly`, HMAC e proteção contra replay;
- MFA/TOTP obrigatório;
- cadastro facial obrigatório no primeiro acesso;
- aprovação de dispositivo após a biometria;
- gestão de usuários exclusiva do Proprietário e do Administrador Master;
- rota de nomeação do Master visível somente ao Proprietário;
- build Vite e TypeScript aprovados;
- artefato `bnk-financeiro-intranet` publicado.

## Concluído no Supabase BNK

- Proprietário inicial cadastrado como Douglas;
- nenhum Administrador Master definido;
- acesso do Proprietário em `pending_face`;
- papel financeiro legado em `blocked` até a biometria;
- tabelas privadas de governança, biometria e auditoria;
- RLS forçada e ausência de privilégios para `anon` e `authenticated`;
- bucket privado `biometric-reference-images`;
- auditoria imutável;
- Edge Functions `intranet-session-bootstrap`, `finance-access-control` e `finance-biometric` ativas;
- rotas antigas de login local, token por e-mail e passkey sem privilégios para autenticar;
- helpers de papel indisponíveis para usuários anônimos.

## Dependências externas restantes

### Repositório principal da Intranet

Aplicar:

```text
/api/auth/finance-launch
/api/finance/session/bootstrap
/api/finance/session/logout
/intranet/financeiro/controle-bancario
public/financeiro/*
```

O deploy atual não contém essas Functions. Por isso a tela `/financeiro/access` ainda informa falha de comunicação.

### Supabase principal da Intranet

Necessário para:

- consultar os usuários reais;
- obter o UUID do Proprietário;
- substituir campos manuais por seleção de usuário;
- validar o Bearer e o contrato real de `/api/auth/profile`;
- testar a ponte ponta a ponta.

### Reconhecimento facial do Apontamento

O BNK já possui captura guiada, armazenamento privado, hashes, consentimento, sessões e suporte a descriptor criptografado. O motor exato de detecção/comparação do Apontamento ainda depende do acesso ao repositório correspondente. Ele será conectado como adaptador, sem mover imagens ou biometria para fora do BNK.

## Não realizar ainda

- não fazer merge do PR antes de aplicar a integração no repositório principal;
- não definir um Administrador Master sem UUID real do Supabase principal;
- não alterar manualmente `public.user_roles` para liberar acesso antes da biometria;
- não publicar Service Role financeira na Intranet.
