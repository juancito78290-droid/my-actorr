import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

// ================= INPUT =================
const input = await Actor.getInput() || {};

const videoUrl = input.video_url;
const audioUrl = input.audio_url;
const subtitles = input.subtitles;

if (!videoUrl || !audioUrl || !Array.isArray(subtitles) || subtitles.length === 0) {
    throw new Error('Input inválido');
}

// ================= DESCARGA =================
async function downloadFile(url, path) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Error descargando ${url}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
}

console.log('Descargando video...');
await downloadFile(videoUrl, 'video.mp4');

console.log('Descargando audio...');
await downloadFile(audioUrl, 'audio.mp3');

// ================= CREAR SRT =================
function formatTime(sec) {
    const hrs = String(Math.floor(sec / 3600)).padStart(2, '0');
    const min = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    const ms = String(Math.floor((sec % 1) * 1000)).padStart(3, '0');
    return `${hrs}:${min}:${s},${ms}`;
}

let srt = '';

subtitles.forEach((sub, i) => {
    srt += `${i + 1}\n`;
    srt += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srt += `${sub.text}\n\n`;
});

fs.writeFileSync('subtitles.srt', srt);

// ================= FFMPEG =================
console.log('Renderizando video...');

// IMPORTANTE: escapado correcto
const cmd = `
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subtitles.srt:charenc=UTF-8:force_style='FontName=DejaVu Sans,FontSize=24'" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-c:a aac \
-shortest \
output.mp4
`;

execSync(cmd, { stdio: 'inherit' });

// ================= GUARDAR =================
await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

const storeId = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID;

const finalUrl = `https://api.apify.com/v2/key-value-stores/${storeId}/records/output.mp4`;

await Actor.pushData({
    status: 'ok',
    video_url: finalUrl
});

console.log('VIDEO FINAL:', finalUrl);

await Actor.exit();
