'use strict';
// Run after `npx cap add android`. Patches the generated Android project.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const and = path.join(root, 'android');
const main = path.join(and, 'app', 'src', 'main');
const res = path.join(main, 'res');
if (!fs.existsSync(and)) throw new Error('android/ not found - run "npx cap add android" first');

// 1) Manifest: camera (QR scanner) permissions
const mf = path.join(main, 'AndroidManifest.xml');
let m = fs.readFileSync(mf, 'utf8');
if (!m.includes('android.permission.CAMERA')) {
  m = m.replace('<application', `<uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application`);
}
if (!m.includes('windowSoftInputMode')) {
  m = m.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
}
fs.writeFileSync(mf, m);

// 2) Launcher icons
fs.rmSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true, force: true });
const src = path.join(root, 'mobile', 'res');
for (const d of fs.readdirSync(src)) {
  const to = path.join(res, d);
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(path.join(src, d))) fs.copyFileSync(path.join(src, d, f), path.join(to, f));
}

// 3) MainActivity: desktop-style wide viewport + pinch zoom (the admin panel is a desktop layout)
const pkgDir = path.join(main, 'java', 'lk', 'nimah', 'crave', 'adminpanel');
fs.mkdirSync(pkgDir, { recursive: true });
fs.writeFileSync(path.join(pkgDir, 'MainActivity.java'), `package lk.nimah.crave.adminpanel;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            WebSettings s = this.bridge.getWebView().getSettings();
            s.setUseWideViewPort(true);
            s.setLoadWithOverviewMode(true);
            s.setSupportZoom(true);
            s.setBuiltInZoomControls(true);
            s.setDisplayZoomControls(false);
        } catch (Exception ignored) { }
    }
}
`);

// 4) Version from CI run number
const gradle = path.join(and, 'app', 'build.gradle');
let g = fs.readFileSync(gradle, 'utf8');
const run = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10) || 1;
const ver = require(path.join(root, 'package.json')).version;
g = g.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "${ver}"`);
fs.writeFileSync(gradle, g);
console.log('android project patched (versionCode ' + run + ', versionName ' + ver + ')');
