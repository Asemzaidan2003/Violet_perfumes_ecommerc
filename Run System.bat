@echo off
cd /d "%~dp0"
start "Nsamat server" cmd /k "npm run dev"
timeout /t 3 >nul
start http://localhost:5000/admin/html/index.html
