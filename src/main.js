import fs from 'fs';
import https from 'https';
import http from 'http';
import { execSync } from 'child_process';
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput();

// INPUT esperado
const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const subtitles = input.subtitles || [];

// ----------------------------
// DESCARGAR ARCHIVOS (sin curl)
// ----------------------------
function download(url, filename) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;

        client.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(`Error descargando ${url}`);
                return;
            }

            const file = fs.createWriteStream(filename);
            res.pipe(file);

            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', reject);
    });
}

console.log('Descargando video...');
await download(videoUrl, 'video.mp4');

console.log('Descargando audio...');
await download(audioUrl, 'audio.mp3');

// ----------------------------
// GENERAR drawtext dinámico
// ----------------------------
function escapeText(text) {
    return text
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/,/g, '\\,');
}

const drawtexts = subtitles.map(sub => {
    const text = escapeText(sub.text);

    return `drawtext=text='${text}':x=(w-text_w)/2:y=h-120:fontsize=32:fontcolor=white:enable='between(t,${sub.start},${sub.end})'`;
}).join(',');

// ----------------------------
// FFmpeg
// ----------------------------
console.log('Renderizando video...');

const command = `
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-filter_complex "${drawtexts}" \
-map 0:v -map 1:a \
-c:v libx264 -preset veryfast -crf 28 \
-c:a aac \
-shortest output.mp4
`;

execSync(command, { stdio: 'inherit' });

// ----------------------------
// GUARDAR OUTPUT
// ----------------------------
await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log('VIDEO FINAL GENERADO');

await Actor.exit();
