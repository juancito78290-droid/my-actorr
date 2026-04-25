import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

// STORE
const store = await Actor.openKeyValueStore(`run-${Date.now()}`);
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
    const { imageBuffer, audioUrl, text } = items[i];

    console.log(`Procesando item ${i}`);

    // =========================
    // 🖼️ IMAGEN
    // =========================
    let buffer;

    if (typeof imageBuffer === 'string') {
        buffer = Buffer.from(imageBuffer, 'base64');
    } else if (imageBuffer?.data) {
        buffer = imageBuffer.data;
    } else if (Buffer.isBuffer(imageBuffer)) {
        buffer = imageBuffer;
    } else {
        throw new Error('Formato de imagen inválido');
    }

    fs.writeFileSync(`image_${i}.jpg`, buffer);

    // =========================
    // 🔊 AUDIO
    // =========================
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`, { stdio: 'inherit' });

    // reparar audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -vn -acodec libmp3lame audio_fixed_${i}.mp3`, { stdio: 'inherit' });

    // =========================
    // ⏱️ DURACIÓN
    // =========================
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fixed_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`)
            .toString()
            .trim()
    );

    if (!duration || isNaN(duration)) {
        throw new Error('No se pudo obtener duración del audio');
    }

    console.log("Duración:", duration);

    // =========================
    // 🔤 TEXTO → ASS (AMARILLO)
    // =========================
    const words = text.toUpperCase().split(" ");
    const chunkSize = Math.ceil(words.length / 5);
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
Style: Default,Arial,52,&H0000FFFF,&H00000000,&H80000000,3,3,0,2,20,20,220

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

    // =========================
    // 🎬 FFMPEG (VERTICAL REAL)
    // =========================
    const filter = `
zoompan=z='min(zoom+0.0008,1.2)':d=125,
scale=720:1280:force_original_aspect_ratio=decrease,
pad=720:1280:(720-iw)/2:(1280-ih)/2,
setsar=1,
ass=subs_${i}.ass
`.replace(/\n/g, '');

    execSync(`
        ffmpeg -y -loop 1 -i image_${i}.jpg -i audio_fixed_${i}.mp3 \
        -vf "${filter}" \
        -t ${duration} \
        -c:v libx264 -preset ultrafast -crf 28 \
        -c:a aac -b:a 128k \
        -pix_fmt yuv420p \
        -shortest \
        output_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // 💾 GUARDAR
    // =========================
    const key = `output-${i}-${Date.now()}.mp4`;
    const videoBuffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(key, videoBuffer, {
        contentType: 'video/mp4'
    });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;

    console.log("VIDEO LISTO:", url);

    await Actor.pushData({ videoUrl: url });
}

await Actor.exit();
