# Correção Netlify preso em Installing npm packages

Este pacote atualiza o layout do painel e trava o build em Node LTS 22.

## O que foi alterado

- Novo layout do Dashboard Financeiro
- `package.json` com engines:
  - Node 22.x
  - npm 10.x
- `.nvmrc`
- `.node-version`
- `netlify.toml` com `NODE_VERSION = "22"`
- `src/vite-env.d.ts`

## Como aplicar

1. Suba esse projeto para o GitHub.
2. No Netlify, se o deploy atual estiver preso, clique em **Cancel deploy**.
3. Vá em **Deploys > Trigger deploy > Clear cache and deploy site**.

Isso força o Netlify a limpar dependências antigas e reconstruir com Node LTS.
