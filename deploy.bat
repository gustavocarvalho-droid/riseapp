@echo off
title Rise WhatsApp - Deploy Automatico
color 0A

echo.
echo  ================================================
echo   RISE WHATSAPP - Deploy Automatico para Vercel
echo  ================================================
echo.

git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Git nao encontrado. Instale em: https://git-scm.com
    pause
    exit /b
)

cd /d "%~dp0"
echo  [OK] Pasta: %~dp0
echo.

if not exist ".git" (
    echo  [INFO] Inicializando repositorio Git...
    git init
)

git remote set-url origin https://github.com/gustavocarvalho-droid/riseapp.git >nul 2>&1
if %errorlevel% neq 0 (
    git remote add origin https://github.com/gustavocarvalho-droid/riseapp.git
)

echo  [INFO] Adicionando arquivos...
git add .

for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATA=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set HORA=%%a:%%b
set MSG=Deploy %DATA% %HORA%

echo  [INFO] Commit: %MSG%
git commit -m "%MSG%" >nul 2>&1

echo  [INFO] Sincronizando com GitHub...
git branch -M main
git pull origin main --rebase --allow-unrelated-histories >nul 2>&1

echo  [INFO] Enviando para GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo  [INFO] Tentando push forcado...
    git push origin main --force
)

if %errorlevel% equ 0 (
    echo.
    echo  ================================================
    echo   [SUCESSO] Deploy enviado!
    echo   Vercel atualiza em ~1 minuto.
    echo   Acesse: https://riseapp-henna.vercel.app
    echo  ================================================
) else (
    echo.
    echo  [ERRO] Falha no push. Verifique autenticacao GitHub.
)

echo.
pause
