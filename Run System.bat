@echo off
cd /d "%~dp0"
if not exist "admin\node_modules" call npm --prefix admin ci
call npm --prefix admin run build
start "Nsamat server" cmd /k "npm run dev"
timeout /t 3 >nul
start http://localhost:5000/admin/
