import fs from 'node:fs';
import path from 'node:path';

const appId = 'com.example.dominomexicano';
const packagePath = appId.split('.').join(path.sep);
const manifestPath = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
const activityPath = path.join('android', 'app', 'src', 'main', 'java', packagePath, 'MainActivity.java');

if (!fs.existsSync(manifestPath) || !fs.existsSync(activityPath)) {
  throw new Error('Estrutura Android gerada pelo Capacitor não encontrada.');
}

let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.CAMERA')) {
  manifest = manifest.replace(
    '<application',
    '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n\n    <application',
  );
  fs.writeFileSync(manifestPath, manifest);
}

let activity = fs.readFileSync(activityPath, 'utf8');
if (!activity.includes('requestPermissions(new String[]{Manifest.permission.CAMERA}')) {
  activity = activity.replace(
    /^package [^;]+;\s*/m,
    (line) => line +
      '\nimport android.Manifest;\n' +
      'import android.content.pm.PackageManager;\n' +
      'import android.os.Bundle;\n' +
      'import androidx.core.app.ActivityCompat;\n' +
      'import androidx.core.content.ContextCompat;\n',
  );

  const emptyClass = /public class MainActivity extends BridgeActivity\s*\{\s*\}/;
  if (!emptyClass.test(activity)) {
    throw new Error('Formato inesperado de MainActivity; não foi possível configurar a permissão da câmara.');
  }

  activity = activity.replace(
    emptyClass,
    `public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 7401;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.CAMERA},
                    CAMERA_PERMISSION_REQUEST
            );
        }
    }
}`,
  );
  fs.writeFileSync(activityPath, activity);
}

console.log('Permissão de câmara configurada para o APK Android.');
