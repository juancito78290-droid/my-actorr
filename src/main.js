import { Actor } from 'apify';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';

await Actor.init();

console.log("🎬 PROCESO: VIDEO + AUDIO + SUBTITULOS");

// INPUT
const input = await Actor.getInput();
const { videoUrl, audioUrl, subtitleText } = input;

if (!videoUrl || !audioUrl || !subtitleText) {
    throw new Error('Faltan datos en el input');
}

// DESCARGAR ARCHIVOS
const download = (url, path) => new Promise((resolve, reject) => {
    const file = fs.createWriteStream(path);
    https.get(url, (res) => {
        if (res.statusCode !== 200) {
            reject(`Error descargando: ${url}`);
            return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
    }).on('error', reject);
});

console.log("⬇️ Descargando video y audio...");
await download(videoUrl, 'video.mp4');
await download(audioUrl, 'audio.mp3');

// OBTENER DURACIÓN DEL VIDEO
console.log("⏱ Obteniendo duración...");
const duration = parseFloat(execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 video.mp4`
).toString());

console.log("Duración:", duration);

// GENERAR SUBTÍTULOS AUTOMÁTICOS
const lines = subtitleText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);

const segment = duration / lines.length;

const formatTime = (sec) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${h}:${m}:${s},000`;
};

let srt = '';

lines.forEach((line, i) => {
    const start = i * segment;
    const end = (i + 1) * segment;

    srt += `${i + 1}\n`;
    srt += `${formatTime(start)} --> ${formatTime(end)}\n`;
    srt += `${line}\n\n`;
});

fs.writeFileSync('subs.srt', srt);

// PROCESAR CON FFMPEG
console.log("⚙️ Ejecutando FFmpeg...");

const cmd = `
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=subs.srt" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-c:a aac \
-shortest \
output.mp4
`;

execSync(cmd, { stdio: 'inherit' });

// GUARDAR RESULTADO
console.log("📤 Guardando resultado...");
const output = fs.readFileSync('output.mp4');

await Actor.setValue('OUTPUT_VIDEO', output, {
    contentType: 'video/mp4'
});

console.log("✅ PROCESO COMPLETADO");

await Actor.exit();
