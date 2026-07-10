@echo off
chcp 65001 >nul
title Subir login protegido admin - BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  STEP FINANCE CONTROL - LOGIN PROTEGIDO ADMIN
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

echo Adicionando arquivos...
git add src/routes/Login.tsx src/styles.css supabase/bootstrap_admin_douglas_BNK.sql README_ADMIN_DOUGLAS_BNK.md

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Atualiza login protegido e bootstrap do administrador"
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
echo.
pause
