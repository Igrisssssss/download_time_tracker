# CareVance Tracker Desktop

The desktop app is an Electron 33 shell around the web frontend. It exposes desktop-only APIs for:

- screenshot capture
- system idle time
- active window context

## Run

1. Start the backend API.
2. Start the frontend app.
3. Start the desktop shell:

```powershell
cd desktop
npm install
npm start
```

## URL Selection

`desktop/main.cjs` reads the frontend URL from the `APP_URL` process environment variable.

Default:

```text
http://localhost:5173
```

Override for another local or deployed frontend:

```powershell
$env:APP_URL="https://your-frontend-domain.com"
npm start
```

## Build Windows Artifacts

```powershell
cd desktop
npm install
npm run dist:win
npm run dist:portable
```

Outputs are written to `desktop/release/`.

Typical files:

- `CareVance Tracker-Setup-1.0.0-x64.exe`
- `CareVance Tracker-Portable-1.0.0-x64.exe`

## Download Link Flow

- Upload the installer to a public URL such as GitHub Releases.
- Put that URL in backend `DESKTOP_WINDOWS_DOWNLOAD_URL`.
- The frontend can then use the backend endpoint `/api/downloads/desktop/windows`.
