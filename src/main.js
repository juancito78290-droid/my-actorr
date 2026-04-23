import { Actor } from 'apify';
import fs from 'fs';
import { spawnSync } from 'child_process';
import https from 'https';
import http from 'http';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

// 📥 Descargar archivos
const downloadFile = (url, path) =>
    new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(path);

        client.get(url, (res) => {
            res.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', reject);
    });

// 🎬 Crear subtítulos estilo bloque (TODO resaltado)
const createASS = (text, duration, file) => {
    const safeText = text
        .toUpperCase()
        .replace(/\n/g, '\\N');

    const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 480
PlayResY: 854

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,BackColour,OutlineColour,Bold,Alignment,MarginL,MarginR,MarginV,Outline,Shadow
Style: Default,Arial,40,&H00FFFFFF,&H00000000,&H00000000,1,2,20,20,60,3,0

[Events]
Format: Layer,Start,End,Style,Text
Dialogue: 0,0:00:00.00,0:00:${duration.toFixed(2)},Default,{\\bord6\\shad0\\c&H00FFFFFF&\\3c&H000000&\\fs44}${safeText}
`;

    fs.writeFileSync(file, ass);
};

for (let i = 0; i < items.length; i++) {
    console.log(`🎬 Procesando item ${i}`);

    const videoPath = `video_${i}.mp4`;
    const audioPath = `audio_${i}.mp3`;
    const audioFixed = `audio_fixed_${i}.mp3`;
    const subsPath = `subs_${i}.ass`;
    const output = `output_${i}.mp4`;

    await downloadFile(items[i].videoUrl, videoPath);
    await downloadFile(items[i].audioUrl, audioPath);

    // 🎧 Normalizar audio
    spawnSync('ffmpeg', [
        '-y',
        '-i', audioPath,
        '-vn',
        '-ar', '44100',
        '-ac', '2',
        '-b:a', '96k',
        audioFixed
    ], { stdio: 'inherit' });

    // ⏱ Duración audio
    const duration = 14; // puedes mejorar con ffprobe si quieres

    // 📝 Crear subtítulos tipo bloque (TODO resaltado)
    createASS(items[i].text, duration, subsPath);

    // 🎬 Combinar video + audio + subtítulos
    spawnSync('ffmpeg', [
        '-y',
        '-i', videoPath,
        '-i', audioFixed,
        '-vf', `scale=480:854,ass=${subsPath}`,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '32',
        '-c:a', 'aac',
        '-b:a', '64k',
        '-shortest',
        output
    ], { stdio: 'inherit' });

    await Actor.pushData({ output });
}

await Actor.exit();
