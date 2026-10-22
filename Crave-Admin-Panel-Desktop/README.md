# Crave Admin Panel (Desktop + Android)

Push this folder to GitHub (branch `main`) → **Actions**:
- *Build Desktop App* → artifact `Crave-Admin-Panel-windows` (Setup .exe + Portable .exe)
- *Build Android APK* → artifact `Crave-Admin-Panel-android` (Crave-Admin-Panel-Android.apk)

Release + auto-update (desktop): `git tag v1.0.0 && git push origin v1.0.0`

Local: `npm install && npm start` (desktop) · `npm run dist` (Windows build)
Keep this repo **private** (android-signing/ keystore is inside).
