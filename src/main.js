import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    // Descargar video
    const videoBuffer = await fetch(videoUrl).then(res => res.buffer());
    fs.writeFileSync(`video_${i}.mp4`, videoBuffer);

    // Descargar audio
    const audioBuffer = await fetch(audioUrl).then(res => res.buffer());
    fs.writeFileSync(`audio_${i}.mp3`, audioBuffer);

    // Corregir audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -ar 44100 -ac 2 audio_fixed_${i}.mp3`);

    // Crear subtítulos estilo resaltado COMPLETO (no palabra por palabra)
    const assContent = `
[Script Info]
ScriptType: v4.00+
PlayResX: 480
PlayResY: 854

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,42,&H00FFFFFF,&H00000000,1,3,0,2,40,40,120
Style: Highlight,Arial,42,&H00000000,&H00000000,3,0,0,2,40,40,120

[Events]
Format: Layer, Start, End, Style, Text
Dialogue: 0,0:00:00.00,0:00:14.00,Highlight,{\\bord0\\shad0\\1c&H000000&\\3c&H00FFFF&\\p1}m 0 0 l 480 0 480 100 0 100{\\p0}
Dialogue: 0,0:00:00.00,0:00:14.00,Default,${text.toUpperCase()}
`;

    fs.writeFileSync(`subs_${i}.ass`, assContent);

    // COMANDO FFmpeg (ARREGLADO en una sola línea)
    execSync(`ffmpeg -y -i video_${i}.mp4 -i audio_fixed_${i}.mp3 -vf "scale=480:854,ass=subs_${i}.ass" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 32 -c:a aac -b:a 64k -shortest output_${i}.mp4`);

    // 🔥 SUBIR A APIFY (AQUÍ ESTÁ LA CLAVE)
    const buffer = fs.readFileSync(`output_${i}.mp4`);
    const store = await Actor.openKeyValueStore();
    const fileName = `output_${i}.mp4`;

    await store.setValue(fileName, buffer, {
        contentType: 'video/mp4',
    });

    const url = `https://api.apify.com/v2/key-value-stores/${store.id}/records/${fileName}`;

    console.log("✅ VIDEO LISTO:", url);

    // DEVOLVER RESULTADO
    await Actor.pushData({
        videoUrl: url
    });
}

await Actor.exit();
