import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

// 🔥 STORE ÚNICO
const randomId = Math.random().toString(36).substring(2, 10);
const store = await Actor.openKeyValueStore(`run-${Date.now()}-${randomId}`);
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
    const { imageBuffer, audioUrl, text } = items[i];

    console.log(`Procesando item ${i}`);

    // =========================
    // 🖼️ PROCESAR IMAGEN
    // =========================
    let buffer;

    if (typeof imageBuffer === 'string') {
        // 🔥 base64 desde Make
        buffer = Buffer.from(imageBuffer, 'base64');

    } else if (imageBuffer?.data) {
        // 🔥 binario directo
        buffer = imageBuffer.data;

    } else if (Buffer.isBuffer(imageBuffer)) {
        buffer = imageBuffer;

    } else {
        throw new Error('Formato de imagen no válido');
    }

    fs.writeFileSync(`image_${i}.jpg`, buffer);

    // =========================
    // 🔊 DESCARGAR AUDIO
    // =========================
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

    // 🔊 AUMENTAR VOLUMEN
    execSync(`ffmpeg -y -i audio_${i}.mp3 -af "volume=3.0" audio_fixed_${i}.mp3`);

    // =========================
    // ⏱️ OBTENER DURACIÓN AUDIO
    // =========================
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fixed_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`).toString()
    );

    console.log("Duración audio:", duration);

    // =========================
    // 🔥 TEXTO → SUBTÍTULOS
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
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,DejaVu Sans Bold,46,&H00FFFFFF,&H00000000,&H80000000,3,3,0,2,20,20,180

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
    // 🎬 EFECTOS (ZOOM + SHAKE)
    // =========================
    const effects = `
zoompan=z='min(zoom+0.0008,1.2)':d=125,
scale=720:1280,
tmix=frames=2:weights="1 1",
ass=subs_${i}.ass
`;

    // =========================
    // 🎬 CREAR VIDEO DESDE IMAGEN
    // =========================
    execSync(`
        ffmpeg -y -loop 1 -i image_${i}.jpg -i audio_fixed_${i}.mp3 \
        -vf "${effects}" \
        -t ${duration} \
        -c:v libx264 -preset ultrafast -crf 28 \
        -c:a aac -b:a 128k \
        -pix_fmt yuv420p \
        output_${i}.mp4
    `);

    // =========================
    // 💾 GUARDAR EN KV STORE
    // =========================
    const key = `output-${i}-${Date.now()}.mp4`;
    const fileBuffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(key, fileBuffer, {
        contentType: 'video/mp4'
    });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;

    console.log("VIDEO LISTO:", url);

    await Actor.pushData({
        videoUrl: url
    });
}

await Actor.exit();
