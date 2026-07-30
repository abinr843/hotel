@echo off
REM ============================================================
REM   Hotel POS — Database Restore Script
REM   Restores the PostgreSQL 'hotel' database from a .dump file.
REM   WARNING: This will DROP and RECREATE the database!
REM ============================================================
REM
REM  Usage:
REM    scripts\restore_db.bat path\to\hotel_backup_YYYYMMDD_HHMMSS.dump
REM
REM  Example:
REM    scripts\restore_db.bat backups\hotel_backup_20260730_230000.dump
REM ============================================================

setlocal enabledelayedexpansion

REM --- Configuration ---
set "DB_NAME=hotel"
set "DB_USER=postgres"
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_PASS=postgres1234"

REM --- Set PGPASSWORD so tools do not prompt interactively ---
set "PGPASSWORD=%DB_PASS%"

REM --- Auto-detect PostgreSQL bin directory and add to PATH ---
if exist "C:\Program Files\PostgreSQL" (
    for /f "delims=" %%D in ('dir /b /ad /o-n "C:\Program Files\PostgreSQL" 2^>nul') do (
        if exist "C:\Program Files\PostgreSQL\%%D\bin\pg_restore.exe" (
            set "PATH=C:\Program Files\PostgreSQL\%%D\bin;!PATH!"
            goto :pg_found
        )
    )
)
:pg_found

REM --- Resolve project root for backup listing ---
set "SCRIPT_DIR=%~dp0"
set "BACKUP_DIR=!SCRIPT_DIR!..\backups"

REM --- Validate input ---
if "%~1"=="" (
    echo.
    echo ============================================================
    echo   HOTEL POS — DATABASE RESTORE
    echo ============================================================
    echo.
    echo   ERROR: No backup file specified.
    echo.
    echo   Usage:
    echo     scripts\restore_db.bat ^<path-to-backup-file.dump^>
    echo.
    echo   Example:
    echo     scripts\restore_db.bat backups\hotel_backup_20260730_230000.dump
    echo.
    echo   Available backups:
    echo   ------------------

    if exist "!BACKUP_DIR!" (
        for %%F in ("!BACKUP_DIR!\hotel_backup_*.dump") do (
            echo     %%~nxF  ^(%%~zF bytes^)
        )
    ) else (
        echo     No backups directory found.
    )
    echo.
    pause
    exit /b 1
)

set "BACKUP_FILE=%~1"

REM --- Check the backup file exists ---
if not exist "%BACKUP_FILE%" (
    echo [ERROR] Backup file not found: %BACKUP_FILE%
    echo         Please provide the full or relative path to the .dump file.
    pause
    exit /b 1
)

REM --- Display warning ---
echo.
echo ============================================================
echo   HOTEL POS — DATABASE RESTORE
echo ============================================================
echo   Backup File : %BACKUP_FILE%
echo   Database    : %DB_NAME%
echo   Host        : %DB_HOST%:%DB_PORT%
echo   User        : %DB_USER%
echo ============================================================
echo.
echo   *** WARNING ***
echo   This will COMPLETELY ERASE the current '%DB_NAME%' database
echo   and replace it with the data from the backup file.
echo.
echo   ALL CURRENT DATA WILL BE LOST.
echo.

set /p "CONFIRM=Type YES to confirm restore: "
if /i not "%CONFIRM%"=="YES" (
    echo.
    echo [CANCELLED] Restore aborted by user.
    pause
    exit /b 0
)

echo.
echo [STEP 1/4] Terminating existing connections to '%DB_NAME%' ...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '%DB_NAME%' AND pid <> pg_backend_pid();" 2>nul

echo [STEP 2/4] Dropping existing database '%DB_NAME%' ...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "DROP DATABASE IF EXISTS %DB_NAME%;"

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to drop database. Check if PostgreSQL is running.
    pause
    exit /b 1
)

echo [STEP 3/4] Creating fresh database '%DB_NAME%' ...
psql -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d postgres -c "CREATE DATABASE %DB_NAME%;"

if %ERRORLEVEL% neq 0 (
    echo [ERROR] Failed to create database. Check PostgreSQL credentials.
    pause
    exit /b 1
)

echo [STEP 4/4] Restoring from backup file ...
pg_restore -h %DB_HOST% -p %DB_PORT% -U %DB_USER% -d %DB_NAME% --no-owner --no-acl --verbose "%BACKUP_FILE%"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [WARNING] pg_restore completed with warnings (exit code %ERRORLEVEL%).
    echo          Some non-critical warnings are normal (e.g., role does not exist).
    echo          Check the output above for actual errors.
    echo.
) else (
    echo [STEP 4/4] Restore completed successfully.
)

echo.
echo ============================================================
echo   RESTORE COMPLETE
echo ============================================================
echo   Database '%DB_NAME%' has been restored from:
echo     %BACKUP_FILE%
echo.
echo   Next steps:
echo     1. Start the Django server:  python manage.py runserver
echo     2. Verify the application loads correctly.
echo     3. Check a few orders and menu items are present.
echo ============================================================
echo.

pause
exit /b 0
