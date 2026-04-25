import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

// STORE ÚNICO
const randomId = Math.random().toString(36).substring(2, 10);
const store = await Actor.openKeyValueStore(`run-${Date.now()}-${randomId}`);
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
    const { imageBuffer, audioUrl, text } = items[i];

    console.log(`Procesando item ${i}`);

    // 🖼️ GUARDAR IMAGEN BINARIA
    fs.writeFileSync(`image_${i}.jpg`, Buffer.from(imageBuffer, 'base64'));

    // 🔊 DESCARGAR AUDIO
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // 🔊 AUMENTAR VOLUMEN
    execSync(`ffmpeg -y -i audio_${i}.mp3 -af "volume=3.0" -ar 44100 -ac 2 -b:a 128k audio_fixed_${i}.mp3`);

    // ⏱️ DURACIÓN REAL DEL AUDIO
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fixed_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`).toString().trim()
    );

    // 🔥 TEXTO EN MAYÚSCULAS (igual)
    const words = text.toUpperCase().split(" ");
    const chunkSize = Math.ceil(words.length / 5);
    const parts = [];

    for (let j = 0; j < words.length; j += chunkSize) {
        parts.push(words.slice(j, j + chunkSize).join(" "));
    }

    // 🔥 ASS (igual pero ahora sincronizado con duración real)
    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,DejaVu Sans Bold,46,&H0000EEFF,&H0000EEFF,&H00000000,&H80000000,3,3,1,2,20,20,180

[Events]
Format: Start,End,Style,Text
`;

    const partDuration = duration / parts.length;

    function formatTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2);
        return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
    }

    parts.forEach((p, idx) => {
        const start = idx * partDuration;
        const end = start + partDuration;
        ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,{\\fad(200,200)}${p}\n`;
    });

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // 🎬 EFECTOS: zoom in + zoom out + shake ligero
    const fps = 25;
    const totalFrames = Math.floor(duration * fps);

    const filter = `
scale=720:1280,
zoompan=
z='if(lte(on,${totalFrames/2}),
    1+0.0008*on,
    1.4-0.0008*(on-${totalFrames/2})
 )':
x='iw/2-(iw/zoom/2)+sin(on/8)*2':
y='ih/2-(ih/zoom/2)+cos(on/10)*2':
d=${totalFrames},
fps=${fps},
ass=subs_${i}.ass
`.replace(/\n/g,'');

    // 🎬 GENERAR VIDEO DESDE IMAGEN
    execSync(`
        ffmpeg -y \
        -loop 1 -i image_${i}.jpg \
        -i audio_fixed_${i}.mp3 \
        -vf "${filter}" \
        -t ${duration} \
        -map 0:v -map 1:a \
        -c:v libx264 -preset ultrafast -crf 32 \
        -c:a aac -b:a 128k \
        -shortest \
        output_${i}.mp4
    `);

    // 💾 GUARDAR
    const buffer = fs.readFileSync(`output_${i}.mp4`);
    const key = `output-${i}-${Date.now()}.mp4`;

    await Actor.setValue(key, buffer, {
        contentType: 'video/mp4'
    });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;

    console.log("VIDEO LISTO:", url);

    await Actor.pushData({
        videoUrl: url
    });
}

await Actor.exit();
