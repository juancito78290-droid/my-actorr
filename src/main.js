import { Actor } from 'apify';
import fs from 'fs';
import axios from 'axios';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const { videoUrl, audioUrl, subtitles } = input;

if (!videoUrl || !audioUrl || !subtitles?.length) {
    throw new Error('Faltan datos en el input');
}

// 📥 DESCARGAR VIDEO
console.log('⬇️ Descargando video...');
const videoRes = await axios({ url: videoUrl, method: 'GET', responseType: 'stream' });
await new Promise((res, rej) => {
    const s = fs.createWriteStream('video.mp4');
    videoRes.data.pipe(s);
    s.on('finish', res);
    s.on('error', rej);
});

// 📥 DESCARGAR AUDIO
console.log('🎵 Descargando audio...');
const audioRes = await axios({ url: audioUrl, method: 'GET', responseType: 'stream' });
await new Promise((res, rej) => {
    const s = fs.createWriteStream('audio.mp3');
    audioRes.data.pipe(s);
    s.on('finish', res);
    s.on('error', rej);
});

// 🔄 NORMALIZAR VIDEO (evita errores raros)
console.log('🔄 Normalizando video...');
execSync(`ffmpeg -y -i video.mp4 -vf scale=480:854 -c:v libx264 -preset veryfast -crf 28 -an video_clean.mp4`);

// 🔄 NORMALIZAR AUDIO
console.log('🔄 Normalizando audio...');
execSync(`ffmpeg -y -i audio.mp3 -ar 44100 -ac 2 -b:a 128k audio_clean.mp3`);

// ⏱ DURACIÓN REAL
const duration = parseFloat(
    execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 video_clean.mp4`)
        .toString()
        .trim()
);

// 📝 CREAR SRT
console.log('📝 Generando subtítulos...');

let srt = '';
const segment = duration / subtitles.length;

const formatTime = (sec) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${h}:${m}:${s},000`;
};

subtitles.forEach((text, i) => {
    const start = i * segment;
    const end = (i + 1) * segment;

    srt += `${i + 1}
${formatTime(start)} --> ${formatTime(end)}
${text}

`;
});

fs.writeFileSync('subs.srt', srt);

// ✂️ AJUSTAR AUDIO AL VIDEO
execSync(`ffmpeg -y -i audio_clean.mp3 -t ${duration} -c copy audio_final.mp3`);

// 🎬 RENDER FINAL
console.log('⚙️ Render final...');

execSync(`
ffmpeg -y -i video_clean.mp4 -i audio_final.mp3 \
-vf "subtitles=subs.srt:force_style='FontName=Arial,FontSize=30,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,BorderStyle=1,Outline=2,Shadow=1'" \
-map 0:v -map 1:a \
-c:v libx264 -preset veryfast -crf 27 \
-c:a aac -b:a 128k \
-shortest output.mp4
`);

// 📤 SUBIR OUTPUT
console.log('📤 Subiendo...');

const buffer = fs.readFileSync('output.mp4');

await Actor.setValue('OUTPUT', buffer, {
    contentType: 'video/mp4'
});

console.log('✅ LISTO → OUTPUT (link disponible)');

await Actor.exit();
