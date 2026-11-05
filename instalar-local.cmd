@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-local.ps1"
if errorlevel 1 (
  echo.
  echo A instalacao terminou com erro. Leia a mensagem acima e tente novamente.
  pause
)
