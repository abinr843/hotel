# 🏨 Hotel POS — Operations Manual

## Backup & Restore Procedures for Hotel Staff

> **Who is this for?** Any hotel staff member who needs to perform database backups or recover from a system failure. No programming knowledge is required.

---

## Table of Contents

1. [Understanding Backups](#1-understanding-backups)
2. [Nightly Automatic Backup (Setup)](#2-nightly-automatic-backup-setup)
3. [Running a Manual Backup](#3-running-a-manual-backup)
4. [Copying Backup to USB Drive](#4-copying-backup-to-usb-drive)
5. [Emergency: Restoring the Database](#5-emergency-restoring-the-database)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Understanding Backups

### What is a backup?
A backup is a copy of all your hotel data — menu items, orders, settlements, and settings. If the computer crashes or data is lost, you can use a backup to restore everything.

### Where are backups stored?
Backups are saved in the `backups` folder inside your project:
```
hotel_backend\hotel\backups\
```

### What do backup files look like?
Each backup file is named with the date and time it was created:
```
hotel_backup_20260730_230000.dump
                ↑         ↑
            Date: 2026-07-30   Time: 23:00:00
```

### How long are backups kept?
The system automatically deletes backups older than **30 days** when a new backup runs.

---

## 2. Nightly Automatic Backup (Setup)

Follow these steps **once** to set up automatic backups at hotel closing time (e.g., 11:00 PM).

### Step-by-Step: Windows Task Scheduler

1. **Open Task Scheduler**
   - Press `Windows Key + R`
   - Type `taskschd.msc` and press **Enter**

2. **Create a New Task**
   - In the right panel, click **"Create Basic Task..."**
   - Name: `Hotel Database Backup`
   - Description: `Nightly backup of Hotel POS database`
   - Click **Next**

3. **Set the Schedule**
   - Select **Daily**
   - Click **Next**
   - Set the start time to your hotel closing time (e.g., `11:00 PM`)
   - Set "Recur every" to `1` day
   - Click **Next**

4. **Set the Action**
   - Select **"Start a program"**
   - Click **Next**
   - In **"Program/script"**, click **Browse** and navigate to:
     ```
     C:\Users\abinr\PycharmProjects\PythonProject2\hotel_backend\hotel\scripts\backup_db.bat
     ```
   - In **"Start in (optional)"**, enter:
     ```
     C:\Users\abinr\PycharmProjects\PythonProject2\hotel_backend\hotel
     ```
   - Click **Next**

5. **Finish**
   - Check **"Open the Properties dialog"** and click **Finish**
   - In the Properties window:
     - Under the **General** tab, select **"Run whether user is logged on or not"**
     - Check **"Run with highest privileges"**
   - Click **OK** and enter your Windows password when prompted

6. **Test the Scheduled Task**
   - Right-click on `Hotel Database Backup` in the task list
   - Select **"Run"**
   - Check the `backups` folder — a new `.dump` file should appear

### Setting up PostgreSQL Password (One-Time)

To allow the backup script to run without asking for a password every time:

1. **Create a pgpass file**
   - Open Notepad
   - Type this single line (replace `postgres1234` with your actual password):
     ```
     localhost:5432:hotel:postgres:postgres1234
     ```
   - Save the file as `pgpass.conf` in your AppData folder:
     ```
     C:\Users\abinr\AppData\Roaming\postgresql\pgpass.conf
     ```
   - Create the `postgresql` folder if it doesn't exist

---

## 3. Running a Manual Backup

If you need to create a backup right now (before a big event, before system updates, etc.):

1. **Open Command Prompt**
   - Press `Windows Key + R`
   - Type `cmd` and press **Enter**

2. **Navigate to the project folder**
   ```
   cd C:\Users\abinr\PycharmProjects\PythonProject2\hotel_backend\hotel
   ```

3. **Run the backup script**
   ```
   scripts\backup_db.bat
   ```

4. **Enter the PostgreSQL password** when prompted: `postgres1234`

5. **Verify success** — You should see:
   ```
   ============================================================
     BACKUP COMPLETE
     File: backups\hotel_backup_20260730_143000.dump
   ============================================================
   ```

6. **Check the file** — Open the `backups` folder and confirm the new file exists.

---

## 4. Copying Backup to USB Drive

For extra safety, copy backups to a USB drive and store it offsite.

1. **Insert your USB drive** into the computer
2. **Note the drive letter** (e.g., `E:`, `F:`, or `D:`) — check in **File Explorer**
3. **Open Command Prompt** and run:
   ```
   copy backups\hotel_backup_*.dump E:\
   ```
   (Replace `E:\` with your actual USB drive letter)

4. **Or use File Explorer:**
   - Navigate to `hotel_backend\hotel\backups\`
   - Select the latest `.dump` file
   - Right-click → **Copy**
   - Navigate to your USB drive
   - Right-click → **Paste**

5. **Safely eject the USB** and store it in a secure location.

---

## 5. Emergency: Restoring the Database

> ⚠️ **USE THIS ONLY IN AN EMERGENCY** — This will erase ALL current data and replace it with the backup.

### When to Restore
- The computer was replaced or reformatted
- The database became corrupted
- Accidental data deletion occurred

### Prerequisites on a Clean Machine
Before restoring, ensure these are installed:
1. **PostgreSQL** (same version or newer) — [Download here](https://www.postgresql.org/download/windows/)
2. **Python 3.12+** — [Download here](https://www.python.org/downloads/)
3. **The project files** — Copy the entire `hotel_backend` folder to the new machine
4. **A backup .dump file** — From the `backups` folder or your USB drive

### Step-by-Step Restore

1. **Open Command Prompt as Administrator**
   - Press `Windows Key`, type `cmd`
   - Right-click **Command Prompt** → **Run as administrator**

2. **Navigate to the project folder**
   ```
   cd C:\Users\abinr\PycharmProjects\PythonProject2\hotel_backend\hotel
   ```

3. **Run the restore script** with the backup file path:
   ```
   scripts\restore_db.bat backups\hotel_backup_20260730_230000.dump
   ```
   Replace the filename with your actual backup file.

   **If restoring from USB:**
   ```
   scripts\restore_db.bat E:\hotel_backup_20260730_230000.dump
   ```

4. **Enter the PostgreSQL password** when prompted: `postgres1234`

5. **Type `YES`** when asked to confirm (this is case-insensitive)

6. **Wait for the restore to complete** — You should see:
   ```
   ============================================================
     RESTORE COMPLETE
   ============================================================
   ```

7. **Start the application server**
   ```
   python manage.py runserver
   ```

8. **Verify the restore worked:**
   - Open the browser and go to `http://localhost:8000`
   - Check that menu items, orders, and settings are present
   - Verify recent orders match what you expect from the backup date

### Restore on a Brand New Machine

If setting up from scratch on a new machine, do these additional steps first:

1. **Install Python dependencies:**
   ```
   pip install -r requirements.txt
   ```

2. **Make sure the `.env` file exists** in the project root with the correct database credentials.

3. **Then run the restore** as described above.

---

## 6. Troubleshooting

### "pg_dump is not recognized"
**Problem:** PostgreSQL tools are not in your system PATH.
**Fix:**
1. Find your PostgreSQL installation (usually `C:\Program Files\PostgreSQL\16\bin`)
2. Add it to your system PATH:
   - Press `Windows Key + R`, type `sysdm.cpl`, press **Enter**
   - Go to **Advanced** tab → **Environment Variables**
   - Under **System variables**, find **Path**, click **Edit**
   - Click **New** and add: `C:\Program Files\PostgreSQL\16\bin`
   - Click **OK** on all dialogs
   - **Restart Command Prompt**

### "Connection refused" or "could not connect to server"
**Problem:** PostgreSQL service is not running.
**Fix:**
1. Press `Windows Key + R`, type `services.msc`, press **Enter**
2. Find **postgresql-x64-16** (or similar)
3. Right-click → **Start**

### "Password authentication failed"
**Problem:** Wrong database password.
**Fix:** Check the `.env` file in the project root for the correct password in the `DATABASE_URL` line.

### "Database hotel does not exist" (during backup)
**Problem:** The database hasn't been created yet.
**Fix:** Run `createdb -U postgres hotel` first, then run Django migrations: `python manage.py migrate`

### Backup file is 0 bytes
**Problem:** The backup ran but captured no data.
**Fix:** Check that the database has data by running: `psql -U postgres -d hotel -c "SELECT count(*) FROM core_menuitem;"`

---

## Quick Reference Card

| Task | Command |
|------|---------|
| **Manual Backup** | `scripts\backup_db.bat` |
| **Restore from Backup** | `scripts\restore_db.bat backups\<filename>.dump` |
| **List Available Backups** | `dir backups\*.dump` |
| **Check PostgreSQL Running** | `pg_isready -h localhost -p 5432` |
| **Start Django Server** | `python manage.py runserver` |

---

*Last updated: July 2026*
