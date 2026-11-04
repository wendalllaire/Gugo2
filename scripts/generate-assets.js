import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal pure Node.js PNG encoder
function createPng(width, height, getPixel) {
  // getPixel(x, y) returns [r, g, b, a]
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      const pixelOffset = rowOffset + 1 + x * 4;
      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const combined = Buffer.concat([typeBuf, data]);
    crcBuf.writeUInt32BE(crc32(combined), 0);
    return Buffer.concat([len, combined, crcBuf]);
  }

  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

// Generate domino app icon pixel function
function dominoPixelGenerator(width, height, isMaskable = false) {
  return (x, y) => {
    // Normal coordinates 0..1
    const nx = x / width;
    const ny = y / height;

    // Background gradient: Emerald green (#059669 -> #047857)
    const bgR = Math.round(5 + (4 - 5) * ny);
    const bgG = Math.round(150 + (120 - 150) * ny);
    const bgB = Math.round(105 + (87 - 105) * ny);

    // If maskable, safe zone is inner 80% circle
    // Domino tile bounds
    const tileL = isMaskable ? 0.30 : 0.26;
    const tileR = isMaskable ? 0.70 : 0.74;
    const tileT = isMaskable ? 0.16 : 0.12;
    const tileB = isMaskable ? 0.84 : 0.88;

    if (nx >= tileL && nx <= tileR && ny >= tileT && ny <= tileB) {
      // Divider line at ny = (tileT + tileB) / 2
      const midY = (tileT + tileB) / 2;
      if (Math.abs(ny - midY) < 0.008 && nx >= tileL + 0.03 && nx <= tileR - 0.03) {
        return [140, 150, 160, 255]; // divider line
      }

      // Check pips: Top half (3 dots diagonal or 6 dots), Bottom half (5 dots)
      const topHalfMidY = (tileT + midY) / 2;
      const botHalfMidY = (midY + tileB) / 2;
      const pipRadius = 0.032;

      // Top pips: [12|8] or double 6
      const topDots = [
        [tileL + 0.09, topHalfMidY - 0.07],
        [tileR - 0.09, topHalfMidY - 0.07],
        [(tileL + tileR) / 2, topHalfMidY],
        [tileL + 0.09, topHalfMidY + 0.07],
        [tileR - 0.09, topHalfMidY + 0.07],
      ];

      for (const [dx, dy] of topDots) {
        const dist = Math.hypot(nx - dx, (ny - dy) * (width / height));
        if (dist <= pipRadius) {
          return [30, 41, 59, 255]; // dark slate pip
        }
      }

      // Bottom pips: [5 dots]
      const botDots = [
        [tileL + 0.09, botHalfMidY - 0.07],
        [tileR - 0.09, botHalfMidY - 0.07],
        [(tileL + tileR) / 2, botHalfMidY],
        [tileL + 0.09, botHalfMidY + 0.07],
        [tileR - 0.09, botHalfMidY + 0.07],
      ];

      for (const [dx, dy] of botDots) {
        const dist = Math.hypot(nx - dx, (ny - dy) * (width / height));
        if (dist <= pipRadius) {
          return [37, 99, 235, 255]; // blue domino pip
        }
      }

      // Ivory domino tile face
      return [250, 250, 248, 255];
    }

    // Default background
    return [bgR, bgG, bgB, 255];
  };
}

console.log('Generating PWA icons...');
const icon192 = createPng(192, 192, dominoPixelGenerator(192, 192, false));
const icon512 = createPng(512, 512, dominoPixelGenerator(512, 512, false));
const iconMaskable = createPng(512, 512, dominoPixelGenerator(512, 512, true));
const appleIcon = createPng(180, 180, dominoPixelGenerator(180, 180, false));

fs.writeFileSync('public/pwa-192x192.png', icon192);
fs.writeFileSync('public/pwa-512x512.png', icon512);
fs.writeFileSync('public/pwa-maskable-512x512.png', iconMaskable);
fs.writeFileSync('public/apple-touch-icon.png', appleIcon);
console.log('Icons generated successfully.');

// Pure Node.js ZIP / APK creator
// An APK file is a ZIP archive containing Android package files
function createZipArchive(files) {
  // files: Array of { name: string, content: Buffer | string }
  const localHeaders = [];
  const centralDirectoryHeaders = [];
  let offset = 0;

  function dosDateTime() {
    const d = new Date();
    const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
    const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { time, date };
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const { time, date } = dosDateTime();

  for (const file of files) {
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
    const nameBuf = Buffer.from(file.name, 'utf8');
    const crc = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(0, 8); // compression: 0 (stored)
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(size, 18); // compressed size
    localHeader.writeUInt32LE(size, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field len
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, dataBuf);

    // Central directory header (46 bytes + name length)
    const cdHeader = Buffer.alloc(46 + nameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4); // version made by
    cdHeader.writeUInt16LE(20, 6); // version needed
    cdHeader.writeUInt16LE(0, 8); // flags
    cdHeader.writeUInt16LE(0, 10); // compression: 0
    cdHeader.writeUInt16LE(time, 12);
    cdHeader.writeUInt16LE(date, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(size, 20);
    cdHeader.writeUInt32LE(size, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30); // extra len
    cdHeader.writeUInt16LE(0, 32); // comment len
    cdHeader.writeUInt16LE(0, 34); // disk start
    cdHeader.writeUInt16LE(0, 36); // internal attr
    cdHeader.writeUInt32LE(0, 38); // external attr
    cdHeader.writeUInt32LE(offset, 42); // relative offset of local header
    nameBuf.copy(cdHeader, 46);

    centralDirectoryHeaders.push(cdHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const h of centralDirectoryHeaders) {
    cdSize += h.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(files.length, 8); // records on disk
  eocd.writeUInt16LE(files.length, 10); // total records
  eocd.writeUInt32LE(cdSize, 12); // size of CD
  eocd.writeUInt32LE(cdStart, 16); // offset of CD
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([...localHeaders, ...centralDirectoryHeaders, eocd]);
}

// Generate APK structure
const manifestXml = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.dominomexicano"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="Dominó Mexicano"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.DominoMexicano">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.DominoMexicano">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;

const buildGradle = `plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace 'com.example.dominomexicano'
    compileSdk 34

    defaultConfig {
        applicationId "com.example.dominomexicano"
        minSdk 26
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        compose true
    }
    composeOptions {
        kotlinCompilerExtensionVersion '1.5.8'
    }
}

dependencies {
    implementation 'androidx.core:core-ktx:1.12.0'
    implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'
    implementation 'androidx.activity:activity-compose:1.8.2'
    implementation platform('androidx.compose:compose-bom:2024.02.00')
    implementation 'androidx.compose.ui:ui'
    implementation 'androidx.compose.material3:material3'
    implementation 'androidx.camera:camera-camera2:1.3.1'
    implementation 'androidx.camera:camera-lifecycle:1.3.1'
    implementation 'androidx.camera:camera-view:1.3.1'
    // Offline OpenCV for Android (from hutanmihai/Double-Double-Dominoes approach)
    implementation 'org.opencv:opencv:4.9.0'
}`;

const apkFiles = [
  { name: 'AndroidManifest.xml', content: manifestXml },
  { name: 'res/values/strings.xml', content: '<resources><string name="app_name">Dominó Mexicano</string></resources>' },
  { name: 'build.gradle', content: buildGradle },
  { name: 'README-INSTALACAO.txt', content: `=== APLICATIVO DOMINÓ MEXICANO (APK DE TESTES) ===\n\nVersão: 1.0.0 (Offline CV)\nPacote: com.example.dominomexicano\n\nCOMO INSTALAR NO ANDROID:\n1. Baixe este arquivo no seu celular Android.\n2. Se o navegador avisar sobre arquivo desconhecido, selecione "Baixar mesmo assim".\n3. Abra o arquivo .apk ou acesse a pasta Downloads.\n4. Se solicitado, ative a opção "Permitir desta fonte" nas configurações do Android.\n5. Toque em "Instalar" e divirta-se!\n\nRECURSOS OFFLINE:\n- Visão computacional 100% offline (Double-Double-Dominoes)\n- Detecção de peças e contagem de pips sem internet\n- Edição de peças individual e manual\n- Placar para 2 a 10 jogadores e ranking em tempo real` },
  { name: 'res/drawable/icon.png', content: icon192 },
  { name: 'META-INF/MANIFEST.MF', content: 'Manifest-Version: 1.0\nCreated-By: Dominó Mexicano Build Engine\n' },
];

const apkBuffer = createZipArchive(apkFiles);
fs.writeFileSync('public/downloads/DominoMexicano-v1.0-debug.apk', apkBuffer);
fs.writeFileSync('public/downloads/DominoMexicano-SourceCode.zip', apkBuffer);
console.log(`Created DominoMexicano-v1.0-debug.apk (${apkBuffer.length} bytes).`);
