@echo off
chcp 65001 >nul
title Subir cadastro local - BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  STEP FINANCE CONTROL - CADASTRO LOCAL
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
git add src/context/AuthContext.tsx src/components/ProtectedRoute.tsx src/routes/Login.tsx src/routes/DeviceCheck.tsx src/routes/SecurityAdmin.tsx src/styles.css supabase/migrations/002_local_auth_bnk.sql README_CADASTRO_LOCAL_BNK.md

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Implementa cadastro e login local"
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
echo Cadastro local enviado. O Netlify deve iniciar novo deploy automaticamente.
echo Lembre de rodar no Supabase o SQL:
echo supabase/migrations/002_local_auth_bnk.sql
echo.
pause
