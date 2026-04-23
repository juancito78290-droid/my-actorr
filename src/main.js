import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input?.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);
    console.log("TEXT:", text);

    if (!videoUrl || !audioUrl || !text) {
        throw new Error("Faltan datos en el input");
    }

    // Descargar archivos
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // Arreglar audio (una sola línea → sin errores)
    execSync(`ffmpeg -y -i audio_${i}.mp3 -vn -ar 44100 -ac 2 -b:a 96k audio_fixed_${i}.mp3`);

    // Formatear texto (saltos tipo subtítulos)
    const formattedText = text
        .replace(/\. /g, '.\\N')
        .replace(/,/g, '\\N');

    // Crear ASS (subtítulos estilo TikTok abajo)
    const ass = `
[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,38,&H00000000,&H0000FFFF,0,0,3,0,0,2,10,10,60,1

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:00.00,0:00:20.00,Default,${formattedText}
`;

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // Crear video (480p + rápido + barato)
    execSync(`ffmpeg -y -i video_${i}.mp4 -i audio_fixed_${i}.mp3 -vf "scale=480:-2,ass=subs_${i}.ass" -c:v libx264 -preset ultrafast -crf 32 -c:a aac -b:a 64k -shortest output_${i}.mp4`);

    console.log(`✅ Video listo`);

    // Guardar en Apify (GENERA LINK)
    const buffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(`video_${i}.mp4`, buffer, {
        contentType: 'video/mp4'
    });

    await Actor.pushData({
        index: i,
        url: `https://api.apify.com/v2/key-value-stores/default/records/video_${i}.mp4`
    });
}

await Actor.exit();
