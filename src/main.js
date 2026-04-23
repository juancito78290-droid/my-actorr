import { execSync } from 'child_process';
import fs from 'fs';
import { Actor } from 'apify';

await Actor.init();

const input = await Actor.getInput();
const { video_url, audio_url, subtitles } = input;

if (!video_url || !audio_url || !subtitles) {
    throw new Error('Falta video_url, audio_url o subtitles');
}

console.log('Descargando video...');
execSync(`wget -O video.mp4 "${video_url}"`);

console.log('Descargando audio...');
execSync(`wget -O audio.mp3 "${audio_url}"`);

console.log('Creando filtros drawtext...');

// 🔥 Crear múltiples drawtext (uno por subtítulo)
let filters = subtitles.map(sub => {
    const safeText = sub.text.replace(/:/g, '\\:').replace(/'/g, "\\'");

    return `drawtext=text='${safeText}':fontcolor=white:fontsize=48:borderw=3:bordercolor=black:x=(w-text_w)/2:y=h-200:enable='between(t,${sub.start},${sub.end})'`;
}).join(',');

console.log('Renderizando video...');

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "${filters}" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -preset veryfast \
-c:a aac \
-shortest output.mp4
`);

console.log('Subiendo resultado...');

await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log('✅ VIDEO FINAL CON TEXTO (GARANTIZADO)');

await Actor.exit();
