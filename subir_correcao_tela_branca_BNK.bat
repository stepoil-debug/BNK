@echo off
chcp 65001 >nul
title Subir correcao tela branca - BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  STEP FINANCE CONTROL - CORRECAO TELA BRANCA
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

git --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Git nao encontrado.
    pause
    exit /b 1
)

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

echo Adicionando correcao...
git add -A

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Corrige tela branca quando variaveis Supabase nao estao configuradas"
) else (
    echo Nenhuma alteracao nova para commit.
)

git push -u origin %BRANCH%
if errorlevel 1 (
    echo [ERRO] Falha ao subir para o GitHub.
    pause
    exit /b 1
)

echo.
echo Correcao enviada. O Netlify deve iniciar novo deploy automaticamente.
echo Depois configure no Netlify:
echo VITE_SUPABASE_URL
echo VITE_SUPABASE_ANON_KEY
echo.
pause
