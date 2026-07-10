@echo off
chcp 65001 >nul
title Corrigir build Netlify e subir BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  CORRECAO BUILD NETLIFY - STEP FINANCE CONTROL
echo  Pasta: %PROJECT_DIR%
echo ============================================================
echo.

if not exist "%PROJECT_DIR%" (
    echo [ERRO] Pasta nao encontrada:
    echo %PROJECT_DIR%
    pause
    exit /b 1
)

cd /d "%PROJECT_DIR%"

if not exist "src" (
    echo [ERRO] Pasta src nao encontrada. Verifique se esta na raiz do projeto.
    pause
    exit /b 1
)

echo [1/6] Criando src\vite-env.d.ts...
(
    echo /// ^<reference types="vite/client" /^>
) > "src\vite-env.d.ts"

echo.
echo [2/6] Conferindo tsconfig.app.json...
echo Se ainda der erro, confirme que compilerOptions.types contem "vite/client".
echo.

echo [3/6] Garantindo remoto GitHub...
if not exist ".git" (
    git init
)
git branch -M %BRANCH%
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin %REPO_URL%
) else (
    git remote set-url origin %REPO_URL%
)

echo.
echo [4/6] Adicionando arquivos...
git add src/vite-env.d.ts tsconfig.app.json

echo.
echo [5/6] Commitando correcao...
git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Corrige tipos do Vite para build no Netlify"
) else (
    echo Nenhuma alteracao nova para commit.
)

echo.
echo [6/6] Enviando para GitHub...
git push -u origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [ERRO] Falha no push.
    echo Verifique login/permissao no GitHub.
    echo Dica: git credential-manager github login
    pause
    exit /b 1
)

echo.
echo ============================================================
echo  CORRECAO ENVIADA COM SUCESSO.
echo  O Netlify deve iniciar novo deploy automaticamente.
echo ============================================================
pause
