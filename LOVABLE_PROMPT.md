# Prompt mestre — replicação integral do STEP Finance Control no Lovable

## Objetivo

Quero que você replique integralmente o módulo financeiro existente neste repositório, preservando arquitetura, regras de negócio, navegação, identidade visual, permissões e comportamento funcional. Este repositório é a **fonte de verdade**. Antes de alterar ou gerar qualquer arquivo, faça uma leitura completa de todos os diretórios, componentes, rotas, migrations, Edge Functions, estilos e documentação.

O sistema final deve ser uma aplicação funcional, não um protótipo estático. Não invente informações financeiras, não crie dados fictícios para esconder telas vazias e não substitua funcionalidades existentes por mocks. Quando o repositório ainda possuir uma função marcada como futura ou placeholder, mantenha-a claramente identificada como tal, sem simular que já funciona.

---

## 1. Fonte de verdade que deve ser analisada

Leia integralmente, no mínimo:

- `src/App.tsx`
- `src/components/**`
- `src/context/**`
- `src/lib/**`
- `src/routes/**`
- `src/types.ts`
- `src/styles.css`
- `src/step-one-sidebar.css`
- `src/step-one-sidebar-flow.css`
- `supabase/migrations/**`
- `supabase/functions/**`
- `docs/**`
- `intranet-card/**`
- `README.md`
- `netlify.toml`
- `.env.example`
- `vite.config.ts`
- `package.json`

Não reproduza somente o dashboard. O objetivo é reproduzir **todo o módulo Financeiro / Controle Bancário**.

---

## 2. Stack esperada

Manter preferencialmente a stack já utilizada pelo projeto:

- React
- TypeScript
- Vite
- React Router
- Supabase
- Lucide React
- Recharts
- CSS próprio do projeto

O projeto original utiliza Node 22.x e npm 10.x. Não troque a stack por outra sem necessidade técnica real.

No Lovable, use os recursos nativos de integração com Supabase quando isso simplificar o deploy, mas preserve todas as regras de negócio e segurança existentes.

---

## 3. Rotas obrigatórias

Replicar todas as rotas atuais e seus guards:

### Públicas / acesso

- `/login`
- `/blocked`

### Protegidas

- `/security/setup`
- `/security/device-check`
- `/dashboard`
- `/position/new`
- `/history`
- `/imports`
- `/reports`

### Somente administradores

- `/security`

Rotas desconhecidas devem redirecionar para `/dashboard` após autenticação.

A navegação deve respeitar permissões e não deve apenas esconder o menu: o acesso direto por URL também precisa ser bloqueado.

---

## 4. Perfis e permissões

Replicar os papéis existentes:

- `super_admin`
- `admin`
- `finance_editor`
- `finance_viewer`
- `auditor`
- `blocked`

Regras mínimas:

### super_admin / admin

- acesso total ao módulo;
- leitura e edição de dados financeiros;
- acesso à administração de segurança;
- aprovação/bloqueio de dispositivos;
- consulta aos eventos de auditoria.

### finance_editor

- visualizar dashboard e histórico;
- criar posição financeira;
- salvar rascunho;
- publicar posição financeira;
- trabalhar com importações quando estas estiverem implementadas.

### finance_viewer

- somente leitura dos dados financeiros permitidos;
- não pode alterar posição financeira.

### auditor

- acesso de leitura;
- comportamento de auditoria sem permissão de edição financeira.

### blocked

- acesso bloqueado e redirecionamento para a tela correspondente.

As permissões devem ser validadas no frontend **e no backend/RLS**.

---

## 5. Estrutura financeira

A aplicação trabalha com cinco grupos financeiros principais:

1. `bank_accounts` — Contas Bancárias / Contas e Bancos
2. `investments` — Investimentos
3. `credit_cards` — Cartões de Crédito
4. `credit_lines` — Linhas de Crédito
5. `companies` — Empresas / Contas vinculadas

O modelo precisa permanecer flexível por meio de templates de campos. Não transformar cada banco/conta em coluna fixa no código.

Cada template financeiro pode possuir:

- item_name
- bank_name
- account_type
- account_number
- company_name
- is_active
- order_index

A nova posição financeira deve usar esses templates para montar os campos dinamicamente.

---

## 6. Banco de dados

Crie uma migration completa e idempotente.

Preferência para a réplica nova: usar um schema isolado chamado `finance_bnk`, mantendo o módulo financeiro separado das tabelas gerais da aplicação.

Se a limitação técnica do Lovable/Supabase exigir uso do `public`, preserve obrigatoriamente as mesmas políticas de acesso e isolamento lógico.

O modelo funcional precisa contemplar, no mínimo:

### Autorização e segurança

- access_profiles ou profiles
- user_roles
- approved_devices
- access_tokens, quando houver segunda camada por token
- sessions, quando houver sessão financeira separada
- security_events
- webauthn_challenges
- webauthn_credentials

### Financeiro

- field_templates / finance_field_templates
- positions / finance_positions
- position_items / finance_position_items
- imports / finance_imports

### Views

Criar visão equivalente à última posição publicada.

Criar visão de totais do dashboard com:

- total_banks
- total_investments
- total_credit_cards_available
- total_credit_lines
- total_companies
- total_general

O `total_general` deve ser calculado pelo sistema. O usuário não deve digitar o total manualmente.

---

## 7. Segurança do Supabase

A aplicação contém dados financeiros sensíveis. Portanto:

- habilitar RLS nas tabelas acessíveis pela API;
- impedir escrita por perfil somente leitura;
- validar papel do usuário no banco;
- não expor `service_role` no navegador;
- não colocar segredos em código frontend;
- usar variáveis de ambiente;
- registrar ações relevantes em `security_events`;
- não armazenar token temporário em texto puro quando houver fluxo de segundo fator;
- quando usar token de uso único, persistir somente hash;
- expirar tokens e sessões;
- registrar tentativas relevantes de acesso e alterações financeiras;
- impedir bypass por chamada direta à API;
- manter controle de dispositivo quando essa função estiver habilitada.

Se usar Edge Functions para operações privilegiadas, toda autorização deve ser repetida dentro da função.

---

## 8. Autenticação

Há duas formas arquiteturais no histórico do módulo:

1. versão standalone com Supabase Auth;
2. versão integrada à Intranet STEP, onde a sessão corporativa abre o módulo Financeiro e existe uma segunda camada financeira.

Para a réplica no Lovable, construa o sistema de forma que funcione standalone com Supabase Auth, mas deixe a camada de autenticação desacoplada para futura integração SSO.

Não hardcode URLs antigas da Intranet, Netlify ou domínio de produção no núcleo da aplicação. Coloque origens externas e URLs de retorno em configuração/variáveis de ambiente.

Fluxo standalone esperado:

1. usuário autentica;
2. sistema carrega profile + role;
3. se bloqueado, redireciona `/blocked`;
4. se configuração de segurança estiver pendente, segue para setup;
5. se validação de dispositivo estiver habilitada, validar dispositivo;
6. usuário autorizado entra no dashboard.

---

## 9. Dashboard obrigatório

O dashboard deve manter a experiência visual atual do STEP Finance Control e ser totalmente responsivo.

### KPIs

Exibir:

- Saldo Total
- Saldo em Contas / Contas e Bancos
- Investimentos
- Limite de Cartões / Cartões disponíveis
- Linhas de Crédito
- Empresas vinculadas

Cada KPI deve puxar dados reais do banco.

Quando houver ao menos dois períodos, mostrar comparação com o período anterior.

### Gráficos

Replicar:

- evolução patrimonial por período;
- evolução/série histórica das posições publicadas;
- distribuição por categoria em gráfico de composição;
- agrupamento por banco/instituição quando houver dados.

Usar Recharts, salvo se existir uma razão forte para manter alternativa equivalente.

### Seções de detalhe

Replicar as áreas de:

- Contas e Bancos;
- Investimentos;
- Cartões;
- Linhas de Crédito;
- Empresas;
- histórico recente;
- alertas/estado de segurança quando aplicável.

Se não houver posição publicada, mostrar o estado vazio verdadeiro e CTA para criar a primeira posição. Não popular com valores fictícios.

---

## 10. Tela Nova Posição Financeira

Esta tela é central no sistema e deve funcionar de ponta a ponta.

Implementar:

- data da posição;
- observação geral;
- campos montados dinamicamente a partir dos templates ativos;
- agrupamento dos campos pelas cinco categorias financeiras;
- entrada monetária no padrão brasileiro;
- total por grupo calculado em tempo real;
- total geral calculado em tempo real;
- botão `Duplicar última posição`;
- botão `Salvar rascunho`;
- botão `Publicar no dashboard`.

### Duplicar última posição

Buscar a última posição publicada, copiar todos os valores para o formulário atual e permitir que o usuário altere apenas o que mudou.

### Salvar rascunho

Criar registro com status `draft` e respectivos itens.

### Publicar

Criar a posição com status `published`, gravar os itens e atualizar automaticamente o dashboard por meio das views/consultas.

Após publicação, registrar evento de auditoria.

Não permitir que `finance_viewer` ou `auditor` publique ou altere dados.

---

## 11. Histórico

Replicar a tela de histórico baseada nas posições financeiras registradas.

Ela deve permitir visualizar, no mínimo:

- data de referência;
- status;
- total consolidado;
- autor quando disponível;
- data de publicação;
- acesso ao detalhamento da posição.

Preservar a diferenciação entre draft, published e archived.

---

## 12. Importações

O código-fonte atual possui a tela preparada para:

- Excel / CSV
- PDF de fatura
- OFX

Importante: no código de referência, parte dessas opções ainda é uma preparação de interface. Não finja que uma importação funciona se o fluxo real ainda não existir.

Na réplica, reproduza o estado atual com fidelidade.

Toda futura importação deve seguir a regra:

**arquivo importado -> pré-conferência -> validação humana -> publicação**

Nunca publicar automaticamente no dashboard um arquivo recém-importado sem conferência.

---

## 13. Relatórios

Replique o estado funcional encontrado no repositório. Se a tela atual for placeholder, mantenha-a como placeholder claramente sinalizado.

Não criar relatórios fictícios apenas para preencher a interface.

A arquitetura deve, porém, permitir futura exportação de dashboard/posição financeira em PDF ou Excel.

---

## 14. Segurança e administração

Replicar as telas e fluxos existentes para:

- configuração de segurança;
- validação de dispositivo;
- dispositivos pendentes/aprovados/bloqueados;
- administração de segurança por admin;
- eventos de auditoria;
- suporte à estrutura de WebAuthn/Passkey já existente no repositório.

Se WebAuthn não puder ser ativado imediatamente no preview Lovable por restrições de domínio/RP ID, preserve toda a estrutura e implemente fallback seguro, documentando exatamente o que falta para produção.

Não desabilitar silenciosamente controles de segurança.

---

## 15. CRM Financeiro e cadastro estruturado

A versão integrada mais recente do módulo também organiza uma camada de informações financeiras/CRM. Estruture a réplica para suportar estes grupos sem misturá-los com a posição financeira consolidada:

### Contas e bancos

- Banco / instituição
- Empresa vinculada
- CNPJ
- Agência
- Conta
- Tipo de conta
- Saldo em conta
- Saldo disponível
- Data da posição
- Anexo / comprovante

### Investimentos

- Banco / corretora
- Produto
- Tipo de investimento
- Valor aplicado
- Saldo bruto
- Saldo líquido
- Rendimento do mês
- Taxa contratada
- Liquidez
- Vencimento
- Risco
- Observação

### Cartões

- Banco emissor
- Bandeira
- Final do cartão
- Empresa
- Limite total
- Limite disponível
- Fatura atual
- Melhor dia de compra
- Fechamento
- Vencimento
- Responsável

### Linhas de crédito

- Banco
- Modalidade
- Contrato
- Limite aprovado
- Limite utilizado
- Saldo disponível
- Taxa de juros
- Garantia
- Vencimento
- Status
- Próxima revisão

### Empresas vinculadas

- Empresa
- CNPJ
- Conta principal
- Banco principal
- Responsável financeiro
- Centro de custo
- Grupo
- Status
- Observação

### CRM Financeiro

- Tipo de atendimento
- Banco / fornecedor
- Assunto
- Prioridade
- Status
- Responsável
- Próxima ação
- Data de lembrete
- Pendência
- Observação

Não misture esses registros com os itens consolidados da posição sem uma relação explícita no banco.

---

## 16. Identidade visual

Preservar o padrão STEP One / STEP Finance Control encontrado nos CSS e componentes atuais.

Características:

- azul marinho profundo;
- azul STEP;
- azul/ciano claro para destaques;
- fundo claro;
- cards brancos;
- bordas discretas;
- sombras leves;
- visual corporativo e limpo;
- sidebar retrátil;
- responsividade desktop/tablet/mobile;
- Lucide Icons;
- gráficos limpos e legíveis;
- evitar aparência genérica de template de IA.

Não redesenhar o produto do zero. A prioridade é fidelidade ao módulo existente.

O menu principal deve incluir:

- Dashboard
- Nova Posição
- Histórico
- Importações
- Segurança, somente admin
- Relatórios

A sidebar deve poder recolher/expandir e preservar o estado local quando possível.

---

## 17. Formatação monetária e datas

Moeda padrão:

- BRL
- locale `pt-BR`

Entradas financeiras devem aceitar formato brasileiro e ser convertidas de maneira segura para número antes de persistir.

Datas exibidas devem usar o padrão brasileiro.

O banco deve persistir valores monetários como `numeric`, não como texto formatado.

---

## 18. Variáveis de ambiente

Criar `.env.example` sem segredo real.

Exemplos esperados:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Se funções privilegiadas forem necessárias, os segredos de backend devem ficar exclusivamente no ambiente de execução do backend/Edge Function.

Nunca gravar no Git:

- service role key;
- SMTP password;
- segredos HMAC;
- tokens de sessão;
- credenciais bancárias;
- chaves privadas.

---

## 19. Qualidade e integridade

Antes de considerar a réplica pronta:

1. executar TypeScript sem erros;
2. executar build de produção;
3. eliminar imports quebrados;
4. validar todas as rotas;
5. validar guards de usuário e admin;
6. validar RLS;
7. testar criação de draft;
8. testar publicação;
9. testar duplicação da última posição;
10. testar usuário somente leitura;
11. testar usuário bloqueado;
12. testar dashboard vazio;
13. testar dashboard com mais de uma posição;
14. testar sidebar em desktop e mobile;
15. testar logout;
16. testar que nenhuma chave privilegiada aparece no bundle do navegador.

Não finalize com erros de console relevantes.

---

## 20. Critérios de aceite

Considerarei o trabalho concluído somente quando:

- o projeto abrir sem erro;
- o login funcionar;
- os papéis e permissões funcionarem;
- o dashboard usar dados reais do Supabase;
- os KPIs forem calculados corretamente;
- os gráficos refletirem dados reais;
- a nova posição funcionar;
- rascunho funcionar;
- publicação funcionar;
- duplicação funcionar;
- histórico funcionar;
- segurança e dispositivos respeitarem o estado existente;
- a administração de segurança for restrita a admin;
- a interface estiver fiel ao STEP Finance Control;
- todas as telas forem responsivas;
- nenhuma informação sensível estiver hardcoded;
- migrations e instruções de instalação estiverem no repositório;
- o README explicar como configurar e executar;
- funcionalidades ainda não implementadas no código original não sejam apresentadas falsamente como prontas.

---

## 21. Procedimento de execução no Lovable

Siga esta ordem:

### Fase 1 — auditoria

Leia o repositório inteiro e faça internamente um mapa de:

- rotas;
- componentes;
- dados;
- queries;
- mutations;
- permissões;
- migrations;
- Edge Functions;
- estilos;
- partes ainda incompletas.

### Fase 2 — banco

Prepare Supabase, migrations, RLS, roles, views e funções necessárias.

### Fase 3 — autenticação e autorização

Implemente login, profile, roles, guards e segurança.

### Fase 4 — layout

Reproduza sidebar, header e padrão visual.

### Fase 5 — financeiro

Implemente dashboard, posições, itens, histórico e auditoria.

### Fase 6 — segurança

Implemente device check, admin e estrutura de passkey.

### Fase 7 — telas complementares

Replicar importações e relatórios exatamente no nível atual do código-fonte.

### Fase 8 — validação

Rodar build e testar os critérios de aceite.

---

## Regra final

**Não faça uma versão “inspirada” no sistema. Faça uma réplica funcional do módulo existente.**

O repositório fornecido é a referência. Preserve o que já funciona, preserve o fluxo real e preserve a identidade visual. Onde precisar adaptar infraestrutura para o Lovable, adapte somente a implementação técnica, sem alterar a regra de negócio.

Se encontrar qualquer divergência entre documentação e código executável, priorize nesta ordem:

1. código atualmente executado;
2. migrations atuais;
3. regras de segurança atuais;
4. documentação;
5. comentários antigos.

Ao final, entregue também um pequeno arquivo `REPLICA_AUDIT.md` contendo:

- o que foi replicado;
- o que foi adaptado;
- o que permaneceu placeholder por já ser placeholder na origem;
- migrations aplicadas;
- variáveis de ambiente necessárias;
- testes realizados;
- qualquer diferença inevitável entre a origem e o Lovable.
