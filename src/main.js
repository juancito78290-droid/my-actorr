import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

// ✅ INPUT CORRECTO DE APIFY
const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    const videoPath = `video_${i}.mp4`;
    const audioPath = `audio_${i}.mp3`;
    const audioFixed = `audio_fixed_${i}.mp3`;
    const assPath = `subs_${i}.ass`;
    const outputPath = `output_${i}.mp4`;

    // 📥 Descargar video y audio
    execSync(`curl -L "${videoUrl}" -o ${videoPath}`);
    execSync(`curl -L "${audioUrl}" -o ${audioPath}`);

    // 🎧 Arreglar audio
    execSync(`ffmpeg -y -i ${audioPath} -ar 44100 -ac 2 -b:a 96k ${audioFixed}`);

    // ✂️ Dividir texto en bloques cortos
    const chunks = text.match(/.{1,40}([.!?]|$)/g) || [text];

    // 🧠 Crear ASS (subtítulos tipo TikTok)
    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,Arial,28,&H00000000,&H00000000,1,1,0,2,20,20,80
Style: Highlight,Arial,32,&H00000000,&H00000000,3,0,0,2,20,20,80

[Events]
Format: Start,End,Style,Text
`;

    let time = 0;
    const durationPerChunk = 2.5;

    for (let j = 0; j < chunks.length; j++) {
        const start = formatTime(time);
        const end = formatTime(time + durationPerChunk);

        const cleanText = chunks[j].trim().toUpperCase();

        ass += `Dialogue: ${start},${end},Highlight,{\\bord0\\shad0\\1c&H000000&\\3c&H00FFFF&\\fs32\\pos(360,1100)}${cleanText}\n`;

        time += durationPerChunk;
    }

    fs.writeFileSync(assPath, ass);

    // 🎬 FFmpeg ULTRA OPTIMIZADO (480p + barato)
    execSync(`
        ffmpeg -y \
        -i ${videoPath} \
        -i ${audioFixed} \
        -vf "scale=480:854,ass=${assPath}" \
        -map 0:v:0 -map 1:a:0 \
        -c:v libx264 -preset ultrafast -crf 32 \
        -c:a aac -b:a 64k \
        -shortest \
        ${outputPath}
    `);

    console.log(`✅ Video listo: ${outputPath}`);

    // 📤 Guardar en dataset
    await Actor.pushData({
        video: outputPath
    });
}

await Actor.exit();

function formatTime(seconds) {
    const h = String(Math.floor(seconds / 3600)).padStart(1, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = (seconds % 60).toFixed(2).padStart(5, '0');
    return `${h}:${m}:${s}`;
}
