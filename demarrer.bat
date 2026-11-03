@echo off
echo =======================================
echo     Lancement du SpeedTest Web
echo =======================================
echo.
echo [1/2] Demarrage du Backend (Port 8000)...
start "SpeedTest Backend" cmd /k "cd backend && node server.js"

echo [2/2] Demarrage du Frontend React (Port 3000)...
start "SpeedTest Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo Tout est lance ! Rendez-vous sur : http://localhost:3000
pause

