import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    // Descargar video
    const videoRes = await fetch(videoUrl);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    fs.writeFileSync(`video_${i}.mp4`, videoBuffer);

    // Descargar audio
    const audioRes = await fetch(audioUrl);
    const audioBuffer = Buffer.from(await audioRes.arrayBuffer());
    fs.writeFileSync(`audio_${i}.mp3`, audioBuffer);

    // Corregir audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -ar 44100 -ac 2 audio_fixed_${i}.mp3`);

    // Subtítulos estilo BLOQUE resaltado (como TikTok)
    const assContent = `
[Script Info]
ScriptType: v4.00+
PlayResX: 480
PlayResY: 854

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,44,&H00FFFFFF,&H00000000,1,3,0,2,40,40,120
Style: Highlight,Arial,44,&H00000000,&H00000000,3,0,0,2,40,40,120

[Events]
Format: Layer, Start, End, Style, Text

Dialogue: 0,0:00:00.00,0:00:15.00,Highlight,{\\bord0\\shad0\\1c&H000000&\\3c&H00FFFF&\\p1}m 0 0 l 480 0 480 120 0 120{\\p0}
Dialogue: 0,0:00:00.00,0:00:15.00,Default,${text.toUpperCase()}
`;

    fs.writeFileSync(`subs_${i}.ass`, assContent);

    // Unir todo (video + audio + subtítulos)
    execSync(`ffmpeg -y -i video_${i}.mp4 -i audio_fixed_${i}.mp3 -vf "scale=480:854,ass=subs_${i}.ass" -map 0:v -map 1:a -c:v libx264 -preset ultrafast -crf 32 -c:a aac -b:a 64k -shortest output_${i}.mp4`);

    // Subir a Apify
    const buffer = fs.readFileSync(`output_${i}.mp4`);
    const store = await Actor.openKeyValueStore();
    const fileName = `output_${i}.mp4`;

    await store.setValue(fileName, buffer, {
        contentType: 'video/mp4',
    });

    const url = `https://api.apify.com/v2/key-value-stores/${store.id}/records/${fileName}`;

    console.log("✅ VIDEO LISTO:", url);

    await Actor.pushData({
        videoUrl: url
    });
}

await Actor.exit();
