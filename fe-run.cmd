@echo off
REM fe-run.cmd - wrapper for fe-run.ps1 (bypasses PowerShell execution policy).
REM For cmd.exe / Explorer double-click. All logic lives in the .ps1 file.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fe-run.ps1" %*
