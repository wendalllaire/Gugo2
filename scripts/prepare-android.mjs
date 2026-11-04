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

// Hide the Android status bar (clock, connectivity and battery) for an immersive app screen.
let immersiveActivity = fs.readFileSync(activityPath, 'utf8');
if (!immersiveActivity.includes('WindowInsetsControllerCompat')) {
  immersiveActivity = immersiveActivity.replace(
    'import androidx.core.content.ContextCompat;',
    'import androidx.core.content.ContextCompat;\\n' +
      'import androidx.core.view.WindowCompat;\\n' +
      'import androidx.core.view.WindowInsetsCompat;\\n' +
      'import androidx.core.view.WindowInsetsControllerCompat;'
  );
  immersiveActivity = immersiveActivity.replace(
    'super.onCreate(savedInstanceState);',
    'super.onCreate(savedInstanceState);\\n' +
      '        WindowInsetsControllerCompat systemBars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());\\n' +
      '        systemBars.hide(WindowInsetsCompat.Type.statusBars());\\n' +
      '        systemBars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);'
  );
  fs.writeFileSync(activityPath, immersiveActivity);
}

console.log('Permissão de câmara configurada e barra de estado Android ocultada.');
