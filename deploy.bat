@echo off
title Rise WhatsApp - Deploy Automatico
color 0A

echo.
echo  ================================================
echo   RISE WHATSAPP - Deploy Automatico para Vercel
echo  ================================================
echo.

:: Verificar se git esta instalado
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Git nao encontrado. Instale em: https://git-scm.com
    pause
    exit /b
)

:: Ir para a pasta do script automaticamente
cd /d "%~dp0"
echo  [OK] Pasta: %~dp0
echo.

:: Verificar se e um repositorio git
if not exist ".git" (
    echo  [INFO] Inicializando repositorio Git...
    git init
    git remote add origin https://github.com/gustavocarvalho-droid/riseapp.git
    echo  [OK] Repositorio iniciado
)

:: Verificar se o remote ja existe
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    git remote add origin https://github.com/gustavocarvalho-droid/riseapp.git
)

echo  [INFO] Adicionando arquivos...
git add .

:: Gerar mensagem de commit com data e hora
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set DATA=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set HORA=%%a:%%b

set MSG=Deploy %DATA% %HORA%

echo  [INFO] Commit: %MSG%
git commit -m "%MSG%"

if %errorlevel% neq 0 (
    echo.
    echo  [AVISO] Nenhuma alteracao detectada ou erro no commit.
    echo  Pode ser que os arquivos nao tenham mudado.
    pause
    exit /b
)

echo.
echo  [INFO] Enviando para GitHub...
git branch -M main
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo  ================================================
    echo   [SUCESSO] Deploy enviado para o GitHub!
    echo   A Vercel vai atualizar em cerca de 1 minuto.
    echo   Acesse: https://riseapp-henna.vercel.app
    echo  ================================================
) else (
    echo.
    echo  [ERRO] Falha no push. Verifique sua conexao
    echo  ou autenticacao do GitHub.
)

echo.
pause
