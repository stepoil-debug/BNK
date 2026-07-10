@echo off
chcp 65001 >nul
title Subir correcao validacao seguranca - BNK

set "PROJECT_DIR=C:\Users\douglas.tabella\Downloads\STEP BANK\step-finance-control"
set "REPO_URL=https://github.com/STEP-SOLUTIONS/BNK.git"
set "BRANCH=main"

echo ============================================================
echo  STEP FINANCE CONTROL - CORRECAO VALIDANDO SEGURANCA
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

if not exist "src\components\ProtectedRoute.tsx" (
    echo [ERRO] Arquivo src\components\ProtectedRoute.tsx nao encontrado.
    echo Confirme se esta na pasta raiz correta.
    pause
    exit /b 1
)

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
git add src/components/ProtectedRoute.tsx

git diff --cached --quiet
if errorlevel 1 (
    git commit -m "Corrige loading infinito na validacao de seguranca"
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
