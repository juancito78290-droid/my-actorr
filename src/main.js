import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    if (!videoUrl || !audioUrl || !text) {
        throw new Error("Faltan datos");
    }

    // Descargar
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // Arreglar audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -vn -ar 44100 -ac 2 -b:a 96k audio_fixed_${i}.mp3`);

    // 🔥 Dividir texto en bloques (NO palabra por palabra)
    const bloques = text
        .split('.')
        .map(t => t.trim())
        .filter(t => t.length > 0);

    let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,BackColour,Bold,Italic,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Default,Arial,42,&H00000000,&H0000FFFF,1,0,3,0,0,2,30,30,80,1

[Events]
Format: Layer,Start,End,Style,Text
`;

    let tiempo = 0;
    const duracion = 3; // segundos por bloque

    const formatTime = (t) => {
        const h = Math.floor(t / 3600);
        const m = Math.floor((t % 3600) / 60);
        const s = (t % 60).toFixed(2);
        return `${h}:${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
    };

    for (let j = 0; j < bloques.length; j++) {
        const start = tiempo;
        const end = tiempo + duracion;

        ass += `Dialogue: 0,${formatTime(start)},${formatTime(end)},Default,${bloques[j]}\n`;

        tiempo += duracion;
    }

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // 🎬 Render final (480p barato)
    execSync(`
        ffmpeg -y
        -i video_${i}.mp4
        -i audio_fixed_${i}.mp3
        -vf "scale=480:854,ass=subs_${i}.ass"
        -map 0:v -map 1:a
        -c:v libx264 -preset ultrafast -crf 32
        -c:a aac -b:a 64k
        -shortest
        output_${i}.mp4
    `);

    // Guardar en Apify (LINK)
    const buffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(`video_${i}.mp4`, buffer, {
        contentType: 'video/mp4'
    });

    await Actor.pushData({
        index: i,
        url: `https://api.apify.com/v2/key-value-stores/default/records/video_${i}.mp4`
    });

    console.log(`✅ Video listo`);
}

await Actor.exit();
