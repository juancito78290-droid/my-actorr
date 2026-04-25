import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

const store = await Actor.openKeyValueStore();
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
    const { imageUrl, videoUrl, audioUrl, text } = items[i];

    console.log(`Procesando item ${i}`);

    // =========================
    // 🖼️ IMAGEN (URL)
    // =========================
    execSync(`curl -L "${imageUrl}" -o image_${i}.jpg`, { stdio: 'inherit' });

    // =========================
    // 🎥 VIDEO (URL)
    // =========================
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`, { stdio: 'inherit' });

    // =========================
    // 🔊 AUDIO
    // =========================
    execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`, { stdio: 'inherit' });

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
    // 🔤 TEXTO → ASS (AMARILLO SIN FONDO)
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
Style: Default,Arial,52,&H0000FFFF,&H00000000,&H00000000,1,2,0,2,20,20,220

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
    // 🎬 PARTE 1: IMAGEN (5s con zoom, 9:16)
    // =========================
    execSync(`
        ffmpeg -y -loop 1 -i image_${i}.jpg \
        -vf "zoompan=z='min(zoom+0.001,1.3)':d=125,scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" \
        -t 5 \
        -c:v libx264 -preset ultrafast -crf 28 \
        -pix_fmt yuv420p \
        image_part_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // 🎬 PARTE 2: VIDEO (RESTO DEL TIEMPO)
    // =========================
    const remaining = Math.max(duration - 5, 1);

    execSync(`
        ffmpeg -y -i video_${i}.mp4 \
        -vf "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280" \
        -t ${remaining} \
        -c:v libx264 -preset ultrafast -crf 28 \
        -pix_fmt yuv420p \
        video_part_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // 🔗 UNIR VIDEO
    // =========================
    fs.writeFileSync(`list_${i}.txt`, `
file 'image_part_${i}.mp4'
file 'video_part_${i}.mp4'
    `);

    execSync(`
        ffmpeg -y -f concat -safe 0 -i list_${i}.txt \
        -c copy combined_${i}.mp4
    `, { stdio: 'inherit' });

    // =========================
    // 🎬 FINAL + AUDIO + SUBS
    // =========================
    execSync(`
        ffmpeg -y -i combined_${i}.mp4 -i audio_fixed_${i}.mp3 \
        -vf "ass=subs_${i}.ass" \
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
