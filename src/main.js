import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input?.items || [];

for (let i = 0; i < items.length; i++) {
    console.log(`Procesando item ${i}`);

    const { image, audio, text } = items[i];

    // 📥 Descargar
    execSync(`curl -L "${image}" -o image_${i}.jpg`);
    execSync(`curl -L "${audio}" -o audio_${i}.mp3`);

    // 🔊 Acelerar audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -filter:a "atempo=1.3" audio_fast_${i}.mp3`);

    // ⏱️ Duración
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fast_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`).toString()
    );

    // 🔤 Crear subtítulos ASS (amarillo + DejaVu)
    const words = text.toUpperCase().split(" ");
    const chunkSize = Math.ceil(words.length / 4);
    const parts = [];

    for (let j = 0; j < words.length; j += chunkSize) {
        parts.push(words.slice(j, j + chunkSize).join(" "));
    }

    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,DejaVu Sans Bold,60,&H00FFFF00,&H00000000,&H00000000,1,3,0,2,20,20,200

[Events]
Format: Start,End,Style,Text
`;

    function formatTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
    }

    const partDuration = duration / parts.length;

    parts.forEach((p, idx) => {
        const start = idx * partDuration;
        const end = start + partDuration;
        ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,${p}\n`;
    });

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // 🎬 Crear video base (blur → nítido)
    execSync(`ffmpeg -y -loop 1 -i image_${i}.jpg -i audio_fast_${i}.mp3 -filter_complex "[0:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,split=2[base][blur];[blur]gblur=sigma=20[blurred];[base]null[normal];[blurred][normal]xfade=transition=fade:duration=0.6:offset=0.4" -map 0:v -map 1:a -t ${duration} -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k -pix_fmt yuv420p temp_${i}.mp4`);

    // 🔤 Quemar subtítulos
    execSync(`ffmpeg -y -i temp_${i}.mp4 -vf "ass=subs_${i}.ass" -c:v libx264 -preset ultrafast -crf 28 -c:a copy output_${i}.mp4`);

    console.log(`✅ Video final: output_${i}.mp4`);

    await Actor.pushData({
        video: `output_${i}.mp4`
    });
}

await Actor.exit();
