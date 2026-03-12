# TimeTrack Pro Backend

This folder contains the Laravel 12 API used by the React frontend and Electron desktop shell.

## Runtime

- PHP 8.2+
- Laravel 12
- Default database target: PostgreSQL
- Default queue connection: `database`
- Private file storage for screenshots and chat attachments

## Setup

```bash
composer install
copy .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

If you want queued jobs processed in development, run:

```bash
php artisan queue:listen --tries=1 --timeout=0
```

## Important Environment Variables

```env
APP_URL=http://localhost:8000
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=timetrackpro
DB_USERNAME=postgres
DB_PASSWORD=your_password

QUEUE_CONNECTION=database
FILESYSTEM_DISK=local
API_TOKEN_TTL_MINUTES=10080
DESKTOP_WINDOWS_DOWNLOAD_URL=https://github.com/<owner>/<repo>/releases/latest/download/TimeTrack%20Pro-Setup-1.0.0-x64.exe
ATTENDANCE_LATE_AFTER=09:30:00
ATTENDANCE_SHIFT_SECONDS=28800
```

## Notes

- The API authenticates bearer tokens through `App\Http\Middleware\AuthenticateApiToken`.
- The codebase uses the `personal_access_tokens` table but does not rely on Sanctum middleware wiring.
- There is no separate broadcasting server configuration in this repo.
- Screenshots are exposed through short-lived signed URLs, and chat attachments stream through authenticated endpoints.
