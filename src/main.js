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

console.log('Generando archivo SRT...');

// 🔥 Convertir JSON → SRT REAL
let srtContent = '';

const formatTime = (seconds) => {
    const date = new Date(seconds * 1000);
    return date.toISOString().substr(11, 12).replace('.', ',');
};

subtitles.forEach((sub, index) => {
    srtContent += `${index + 1}\n`;
    srtContent += `${formatTime(sub.start)} --> ${formatTime(sub.end)}\n`;
    srtContent += `${sub.text}\n\n`;
});

// Guardar en ruta absoluta (clave en Apify)
fs.writeFileSync('/usr/src/app/subtitles.srt', srtContent);

// DEBUG (opcional)
console.log('Contenido SRT:\n', srtContent);

console.log('Renderizando video con subtítulos...');

// 🔥 FFmpeg CORRECTO
execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "subtitles=/usr/src/app/subtitles.srt:force_style='Fontsize=40,PrimaryColour=&Hffffff&,OutlineColour=&H000000&,BorderStyle=3'" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -preset veryfast \
-c:a aac \
-shortest output.mp4
`);

console.log('Subiendo resultado...');

await Actor.setValue('output.mp4', fs.readFileSync('output.mp4'), {
    contentType: 'video/mp4',
});

console.log('✅ VIDEO FINAL listo con subtítulos');

await Actor.exit();
