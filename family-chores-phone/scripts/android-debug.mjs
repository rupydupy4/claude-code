// Builds the Android debug APK (for testing on a phone or emulator) if the Android SDK and a
// Java JDK are installed. Usage: npm run android:debug
// Output: android/app/build/outputs/apk/debug/app-debug.apk
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const android = fileURLToPath(new URL('../android/', import.meta.url));
const home = process.env.LOCALAPPDATA ?? process.env.HOME ?? '';
const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, join(home, 'Android', 'Sdk'), join(home, 'Library', 'Android', 'sdk')].find((p) => p && existsSync(p));
const studioJdk = ['C:/Program Files/Android/Android Studio/jbr', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'].find((p) => existsSync(p));
const java = process.env.JAVA_HOME || studioJdk;

const missing = [];
if (!sdk) missing.push('the Android SDK (install Android Studio, open it once, and let it download the SDK)');
if (!java) missing.push('a Java JDK (Android Studio includes one)');
if (missing.length) {
  console.error(`Can't build the Android APK on this computer yet. Missing: ${missing.join(' and ')}.`);
  console.error('The Android project is ready in the android/ folder: open it in Android Studio to build and run it.');
  process.exit(2);
}

const env = { ...process.env, ANDROID_HOME: sdk, JAVA_HOME: java };
const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const r = spawnSync(gradlew, ['assembleDebug'], { cwd: android, env, stdio: 'inherit', shell: process.platform === 'win32' });
if (r.status === 0) console.log('\nDebug APK: android/app/build/outputs/apk/debug/app-debug.apk');
process.exit(r.status ?? 1);
