# TimeTrackPro Desktop

This desktop shell wraps the frontend and exposes desktop-only tracking APIs:
- periodic screenshot capture
- system idle-time checks

## Run

1. Start backend API (`http://localhost:8000`)
2. Start frontend (`http://localhost:5173`)
3. Start desktop app:

```powershell
cd desktop
npm install
npm start
```

By default Electron loads `http://localhost:5173`.
To change URL:

```powershell
$env:APP_URL="http://localhost:4173"
npm start
```

## Build Windows installer

Install dependencies:

```powershell
cd desktop
npm install
```

Build Windows artifacts:

```powershell
npm run dist:win
npm run dist:portable
```

Output files are generated in `desktop/release/`. You will get files similar to:

- `TimeTrack Pro-Setup-1.0.0-x64.exe`
- `TimeTrack Pro-Portable-1.0.0-x64.exe`

Use the `Setup` `.exe` as the main installer you upload to GitHub Releases.

Desktop and installer icons are loaded from `desktop/assets/icon.ico` and `desktop/assets/icon.png`.

## Share download link

After uploading the installer asset to GitHub Releases, point the web login button at:

```text
https://github.com/<owner>/<repo>/releases/latest/download/<installer-file-name>.exe
```

Example:

```text
https://github.com/acme/timetrackpro/releases/latest/download/TimeTrack%20Pro-Setup-1.0.0-x64.exe
```
