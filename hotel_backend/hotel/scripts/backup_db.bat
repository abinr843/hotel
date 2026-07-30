@echo off
REM ============================================================
REM   Hotel POS — Nightly Database Backup Script
REM   Exports the PostgreSQL 'hotel' database to a compressed
REM   .dump file with a timestamp in the filename.
REM ============================================================
REM
REM  Usage:
REM    Double-click this file, OR run from Command Prompt:
REM      scripts\backup_db.bat
REM
REM  Schedule via Windows Task Scheduler for nightly runs.
REM ============================================================

setlocal enabledelayedexpansion

REM --- Configuration ---
set "DB_NAME=hotel"
set "DB_USER=postgres"
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_PASS=postgres1234"

REM --- Set PGPASSWORD so pg_dump does not prompt interactively ---
set "PGPASSWORD=%DB_PASS%"

REM --- Auto-detect PostgreSQL bin directory and add to PATH ---
if exist "C:\Program Files\PostgreSQL" (
    for /f "delims=" %%D in ('dir /b /ad /o-n "C:\Program Files\PostgreSQL" 2^>nul') do (
        if exist "C:\Program Files\PostgreSQL\%%D\bin\pg_dump.exe" (
            set "PATH=C:\Program Files\PostgreSQL\%%D\bin;!PATH!"
            goto :pg_found
        )
    )
)
:pg_found

REM --- Resolve the project root (one level up from scripts/) ---
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

REM --- Backup destination ---
set "BACKUP_DIR=%PROJECT_ROOT%\backups"

REM --- Create backups directory if it doesn't exist ---
if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
    echo [INFO] Created backup directory: %BACKUP_DIR%
)

REM --- Generate timestamp using PowerShell (reliable across all Windows locales) ---
for /f "delims=" %%T in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd_HHmmss'"') do set "STAMP=%%T"

set "BACKUP_FILE=%BACKUP_DIR%\hotel_backup_%STAMP%.dump"

REM --- Display banner ---
echo.
echo ============================================================
echo   HOTEL POS — DATABASE BACKUP
echo ============================================================
echo   Database : %DB_NAME%
echo   Host     : %DB_HOST%:%DB_PORT%
echo   User     : %DB_USER%
echo   Output   : %BACKUP_FILE%
echo   Time     : %date% %time%
echo ============================================================
echo.

REM --- Run pg_dump ---
echo [STEP 1/3] Running pg_dump ...
pg_dump -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% -F c -Z 9 -f "%BACKUP_FILE%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] pg_dump FAILED with exit code %ERRORLEVEL%.
    echo         Please check that PostgreSQL is running and credentials are correct.
    echo         If pg_dump is not recognized, add PostgreSQL bin to your system PATH.
    echo.
    exit /b 1
)

echo [STEP 1/3] pg_dump completed successfully.

REM --- Verify the file exists and show its size ---
echo [STEP 2/3] Verifying backup file ...
if exist "%BACKUP_FILE%" (
    for %%F in ("%BACKUP_FILE%") do (
        echo [OK]    Backup file created: %%~nxF
        echo [OK]    File size: %%~zF bytes
    )
) else (
    echo [ERROR] Backup file was NOT created. Something went wrong.
    exit /b 1
)

REM --- Cleanup: remove backups older than 30 days ---
echo [STEP 3/3] Cleaning up backups older than 30 days ...
forfiles /p "%BACKUP_DIR%" /m "hotel_backup_*.dump" /d -30 /c "cmd /c echo [CLEANUP] Deleting @file & del @path" 2>nul

echo.
echo ============================================================
echo   BACKUP COMPLETE
echo   File: %BACKUP_FILE%
echo ============================================================
echo.
echo   To copy to USB: copy "%BACKUP_FILE%" E:\
echo   (Replace E:\ with your USB drive letter)
echo.

REM --- Log the backup event ---
echo %date% %time% - SUCCESS - %BACKUP_FILE% >> "%BACKUP_DIR%\backup_log.txt"

exit /b 0
