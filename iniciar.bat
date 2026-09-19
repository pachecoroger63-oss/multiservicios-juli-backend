@echo off
cd /d "C:\Users\FZ ROGER\OneDrive - SENATI\Documentos\programacion.html"
start "" node index.js
timeout /t 2 /nobreak >nul
start http://localhost:3000