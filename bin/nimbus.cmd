@echo off
:: Nimbus CLI launcher for Windows (CMD / PowerShell).
:: Resolves the package root relative to this script's location so it works
:: when npm installs the bin entry as a junction/shim in node_modules/.bin/.

setlocal enabledelayedexpansion

:: Locate the package root (one level up from this bin\ directory)
set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
set "PKG_ROOT=%SCRIPT_DIR%\.."
set "ENTRY=%PKG_ROOT%\src\nimbus.ts"

:: Primary: Node.js >= 18 with tsx ESM loader (project is Node.js-native)
where node >nul 2>&1
if %errorlevel% equ 0 (
  set "TSX_ESM=%PKG_ROOT%\node_modules\tsx\dist\esm\index.mjs"
  if exist "!TSX_ESM!" (
    node --loader "!TSX_ESM!" "%ENTRY%" %*
    exit /b %errorlevel%
  )
  :: Try global tsx loader
  for /f "delims=" %%i in ('npm root -g 2^>nul') do set "NPM_GLOBAL=%%i"
  if defined NPM_GLOBAL (
    set "TSX_GLOBAL=!NPM_GLOBAL!\tsx\dist\esm\index.mjs"
    if exist "!TSX_GLOBAL!" (
      node --loader "!TSX_GLOBAL!" "%ENTRY%" %*
      exit /b %errorlevel%
    )
  )
  :: Last resort: node --import tsx
  node --import tsx "%ENTRY%" %*
  exit /b %errorlevel%
)

echo Error: Nimbus requires Node.js ^>= 18. >&2
echo. >&2
echo Install Node.js: >&2
echo   https://nodejs.org/ >&2
exit /b 1
