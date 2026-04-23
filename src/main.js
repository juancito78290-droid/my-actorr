import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

// ================= INPUT =================
const input = await Actor.getInput() || {};

const videoUrl = input.video_url;
const audioUrl = input.audio_url;
const subtitles = input.subtitles;

// Validación
if (!videoUrl || !audioUrl || !Array.isArray(subtitles) || subtitles.length === 0) {
    throw new Error('Input inválido: se requiere video_url, audio_url y subtitles[]');
}

// ================= DESCARGAS =================
async function downloadFile(url, path) {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Error descargando: ${url}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
}

console.log('Descargando video...');
await downloadFile(videoUrl, 'video.mp4');

console.log('Descargando audio...');
await downloadFile(audioUrl, 'audio.mp3');

// ================= SRT =================
function formatTime(sec) {
    const hours = String(Math.floor(sec / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const seconds = String(Math.floor(sec % 60)).padStart(2, '0');
    const millis = String(Math.floor((sec % 1) * 1000)).padStart(3, '0');

    return `${hours}:${minutes}:${seconds},${millis}`;
}

let srtContent = '';

subtitles.forEach((sub, i) => {
    if (
        typeof sub.start !== 'number' ||
        typeof sub.end !== 'number' ||
        typeof sub.text !== 'string'
    ) return;

    srtContent += `${i + 1}\n`;
    srtContent += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srtContent += `${sub.text}\n\n`;
});

if (!srtContent) {
    throw new Error('Subtítulos inválidos');
}

fs.writeFileSync('subtitles.srt', srtContent);

// ================= FFMPEG =================
console.log('Renderizando video...');

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subtitles.srt:force_style='FontName=DejaVu Sans,FontSize=36,PrimaryColour=&H00FFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=60'" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-preset veryfast \
-crf 28 \
-c:a aac \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// ================= GUARDAR =================
await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

// ================= LINK FINAL =================
const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

const finalUrl = `https://api.apify.com/v2/key-value-stores/${storeId}/records/output.mp4`;

await Actor.pushData({
    status: 'ok',
    video_url: finalUrl
});

console.log('VIDEO FINAL:', finalUrl);

await Actor.exit();
