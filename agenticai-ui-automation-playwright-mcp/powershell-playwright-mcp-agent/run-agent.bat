@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%Invoke-PlaywrightMcpAgent.ps1"
set "FILE_PATH=%~1"
set "FOLDER_PATH=%~2"

if "%FILE_PATH%"=="" (
  if not "%FOLDER_PATH%"=="" goto :run_folder
  if exist "%SCRIPT_DIR%instruction files\" (
    set "FOLDER_PATH=%SCRIPT_DIR%instruction files"
  ) else if exist "%SCRIPT_DIR%InstructionFiles\" (
    set "FOLDER_PATH=%SCRIPT_DIR%InstructionFiles"
  )
)

if "%FILE_PATH%"=="" if "%FOLDER_PATH%"=="" set "FOLDER_PATH=%SCRIPT_DIR%InstructionFiles"

if not "%FILE_PATH%"=="" goto :run_file

:run_folder
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -InstructionsFolder "%FOLDER_PATH%"
goto :after_run

:run_file
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" -InstructionsPath "%FILE_PATH%"

:after_run
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Automation finished successfully.
) else (
  echo Automation failed with exit code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
