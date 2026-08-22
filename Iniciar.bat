@echo off
title Esports Hub
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado.
  echo  Instale em https://nodejs.org e execute este arquivo de novo.
  echo.
  pause
  exit /b 1
)

node scripts\launcher.mjs

echo.
echo  O Esports Hub foi encerrado.
pause
