@echo off
chcp 65001 >nul
title Subir layout e correcao Netlify Node LTS - BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  STEP FINANCE CONTROL - LAYOUT + NODE LTS
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

echo Adicionando alteracoes...
git add -A

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Atualiza layout financeiro e estabiliza build no Netlify"
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
echo Correcao enviada.
echo No Netlify, se o deploy atual continuar preso, cancele e rode:
echo Deploys ^> Trigger deploy ^> Clear cache and deploy site
echo.
pause
