import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    const videoFile = `video_${i}.mp4`;
    const audioFile = `audio_${i}.mp3`;
    const audioFixed = `audio_fixed_${i}.mp3`;
    const outputFile = `output_${i}.mp4`;
    const subsFile = `subs_${i}.ass`;

    // Descargar
    execSync(`curl -L "${videoUrl}" -o ${videoFile}`);
    execSync(`curl -L "${audioUrl}" -o ${audioFile}`);

    // 🔧 Reparar audio (evita errores mp3 corrupto)
    execSync(`ffmpeg -y -i ${audioFile} -ar 44100 -ac 2 -b:a 128k ${audioFixed}`);

    // 📏 Duración del audio
    const duration = parseFloat(
        execSync(`ffprobe -i ${audioFixed} -show_entries format=duration -v quiet -of csv="p=0"`).toString()
    );

    // ✂️ Dividir texto en bloques naturales
    const words = text.split(" ");
    const chunkSize = Math.ceil(words.length / 4); // 4 bloques
    const chunks = [];

    for (let j = 0; j < words.length; j += chunkSize) {
        chunks.push(words.slice(j, j + chunkSize).join(" "));
    }

    const timePerChunk = duration / chunks.length;

    // 🎨 Crear subtítulos estilo TikTok
    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Arial,36,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,30,30,80,1

[Events]
Format: Layer,Start,End,Style,Text
`;

    function toTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}`;
    }

    chunks.forEach((chunk, index) => {
        const start = toTime(index * timePerChunk);
        const end = toTime((index + 1) * timePerChunk);

        // ✨ Resaltado (amarillo progresivo)
        const highlighted = `{\\c&H00FFFF&}${chunk}`;

        ass += `Dialogue: 0,${start},${end},Default,${highlighted}\n`;
    });

    fs.writeFileSync(subsFile, ass);

    // 🎬 FFmpeg FINAL (recorta video al audio + subtítulos abajo)
    execSync(`
        ffmpeg -y \
        -i ${videoFile} \
        -i ${audioFixed} \
        -vf "ass=${subsFile}" \
        -map 0:v:0 -map 1:a:0 \
        -t ${duration} \
        -c:v libx264 -preset veryfast -crf 30 \
        -c:a aac -b:a 96k \
        -shortest \
        ${outputFile}
    `);

    // 💾 Guardar en Key-Value Store (SIN errores)
    await Actor.setValue(`video_${i}.mp4`, fs.readFileSync(outputFile), {
        contentType: 'video/mp4',
    });

    console.log(`✅ Item ${i} listo`);
}

await Actor.exit();
