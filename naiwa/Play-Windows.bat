@echo off
setlocal
cd /d "%~dp0"
set PORT=8000

python --version >nul 2>nul
if %errorlevel%==0 goto HAVEPYTHON
py --version >nul 2>nul
if %errorlevel%==0 goto HAVEPY
node --version >nul 2>nul
if %errorlevel%==0 goto HAVENODE
goto NOENGINE

:HAVEPYTHON
start "" "http://127.0.0.1:%PORT%/"
echo Game is running. Keep this window open. Close it to quit.
python -m http.server %PORT% --bind 127.0.0.1
goto :eof

:HAVEPY
start "" "http://127.0.0.1:%PORT%/"
echo Game is running. Keep this window open. Close it to quit.
py -m http.server %PORT% --bind 127.0.0.1
goto :eof

:HAVENODE
start "" "http://127.0.0.1:%PORT%/"
node server.mjs %PORT%
goto :eof

:NOENGINE
echo This game needs Python OR Node.js to run locally.
echo Install Python: https://www.python.org/downloads/
echo (tick "Add python.exe to PATH" during install, then run this file again)
pause
