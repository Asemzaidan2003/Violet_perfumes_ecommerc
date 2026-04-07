@echo off
cd /d "C:\Users\ASUS\Desktop\Nsamat system"

REM Start backend
start cmd /k "npm run dev"

REM Start Live Server WITHOUT opening browser
start cmd /k "live-server frontend --port=5500 --no-browser"

REM Wait a bit
timeout /t 3 >nul

REM Open only ONE browser tab (your index.html)
start http://127.0.0.1:5500/html/index.html