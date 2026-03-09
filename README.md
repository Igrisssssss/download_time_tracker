# TimeTrack Pro

TimeTrack Pro is a Laravel + React time tracking platform with a desktop shell for tracker workflows and a full-featured web app for management/reporting.

## Highlights

- Desktop shell with focused actions: Timer, Dashboard (opens web), Edit Time, Settings, and admin-only Screenshot shortcut.
- Web dashboard is report-first (role-based).
- Attendance with punch in/out, leave requests, time-edit requests, and calendar.
- Payroll structures, payslip generation, payment marking, and PDF download.
- Admin user management with add/edit/delete users.
- Report groups (teams) to filter reports by group or selected users.
- Separate desktop/web tokens via auth handoff.
- Tab-isolated web sessions (`sessionStorage`) so logout in one tab does not force logout in others.

## Tech Stack

### Backend
- Laravel 11
- PostgreSQL
- Token auth via `personal_access_tokens`

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- React Router
- Axios

### Desktop
- Electron shell (`desktop/`)

## Repository Structure

```text
demo_laravel_2/
  backend/                 Laravel API
  frontend/                React app
  desktop/                 Electron shell
  SPEC.md
  TODO.md
  README.md
```

## Setup

## 1) Backend

```bash
cd backend
composer install
copy .env.example .env
php artisan key:generate
```

Configure DB in `backend/.env`:

```env
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=timetrackpro
DB_USERNAME=postgres
DB_PASSWORD=your_password
```

Run migrations:

```bash
php artisan migrate
```

Start backend:

```bash
php artisan serve
```

## 2) Frontend

```bash
cd frontend
npm install
```

Create/update `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000/api
# optional for desktop external-open target:
# VITE_WEB_APP_URL=http://localhost:5173
# optional installer/download button override on login page:
# VITE_DESKTOP_DOWNLOAD_URL=https://your-domain.com/api/downloads/desktop/windows
# VITE_DESKTOP_DOWNLOAD_LABEL=Download for Windows
```

Start frontend:

```bash
npm run dev
```

## Live deployment

For a deployed setup, configure the frontend and backend with public URLs.

Example backend `.env`:

```env
APP_URL=https://your-backend-domain.com
FRONTEND_URL=https://your-frontend-domain.com
DESKTOP_WINDOWS_DOWNLOAD_URL=https://github.com/Igrisssssss/download_time_tracker/releases/download/v1.0.0/TimeTrack.Pro-Setup-1.0.0-x64.exe
```

Example frontend `.env`:

```env
VITE_API_URL=https://your-backend-domain.com/api
VITE_WEB_APP_URL=https://your-frontend-domain.com
```

With that setup, the login page download button will call:

```text
https://your-backend-domain.com/api/downloads/desktop/windows
```

The browser will start downloading the installer directly through your backend endpoint.

## 3) Desktop (optional)

```bash
cd desktop
npm install
npm start
```

Optional desktop URL override:

```powershell
$env:APP_URL="http://localhost:5173"
npm start
```

If you want users to install the desktop app from the login page, host your installer somewhere public and set `VITE_DESKTOP_DOWNLOAD_URL` in `frontend/.env`. The login page will then show a download button automatically.

To make the download start from your own app domain instead of sending users to GitHub, set this in `backend/.env`:

```env
DESKTOP_WINDOWS_DOWNLOAD_URL=https://github.com/Igrisssssss/download_time_tracker/releases/latest/download/TimeTrack%20Pro-Setup-1.0.0-x64.exe
```

The public endpoint will then be:

```text
http://localhost:8000/api/downloads/desktop/windows
```

Your login page is already configured to use that backend endpoint by default.

## Role-Based Behavior

- Employee:
  - Web dashboard shows self report only.
  - Desktop screenshot shortcut is hidden.
- Admin/Manager:
  - Web dashboard defaults to team report.
  - Can filter reports by team, selected users, or groups.
  - Can access User Management and manage groups.

## New Report Group Feature

Backend endpoints:

- `GET /api/report-groups`
- `POST /api/report-groups`
- `PUT /api/report-groups/{id}`
- `DELETE /api/report-groups/{id}`

Reports endpoint supports group filtering:

- `GET /api/reports/overall?group_ids[]=1&group_ids[]=2`

## Auth and Session Notes

- Desktop -> web links pass `desktop_token` and web exchanges it via:
  - `POST /api/auth/handoff`
- Web auth state uses `sessionStorage` (tab/window isolated).

## Important Migration Note

If you pull latest changes and get `relation "report_groups" does not exist`, run:

```bash
cd backend
php artisan migrate
```

This creates:

- `report_groups`
- `report_group_user`

## Build/Test

### Frontend production build

```bash
cd frontend
npm run build
```

### Backend tests

```bash
cd backend
php artisan test
```

## License

Commercial - All rights reserved.
