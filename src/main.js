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

    // 👉 fallback al audio de Piper
    const finalAudioUrl = audioUrl || "https://api.apify.com/v2/key-value-stores/6FqBZhJ6rpn8znfeu/records/OUTPUT_MP3?disableRedirect=true";

    console.log(`Procesando item ${i}`);

    // =========================
    // DESCARGAS
    // =========================
    execSync(`curl -L "${imageUrl}" -o image_${i}.jpg`, { stdio: 'inherit' });
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`, { stdio: 'inherit' });

    // 🔊 DESCARGAR AUDIO (sin asumir formato)
    execSync(`curl -L "${finalAudioUrl}" -o audio_${i}`, { stdio: 'inherit' });

    let inputAudio = `audio_${i}`;
    let outputMp3 = `audio_${i}.mp3`;

    // 🔁 CONVERTIR A MP3 SI NO LO ES
    if (!finalAudioUrl.toLowerCase().includes(".mp3")) {
        console.log("Convirtiendo audio a MP3...");
        execSync(`ffmpeg -y -i ${inputAudio} -vn -ar 44100 -ac 2 -b:a 128k ${outputMp3}`, { stdio: 'inherit' });
    } else {
        fs.renameSync(inputAudio, outputMp3);
    }

    // ⚡ AUDIO MÁS RÁPIDO
    execSync(`ffmpeg -y -i ${outputMp3} -filter:a "atempo=1.2" audio_fast_${i}.mp3`, { stdio: 'inherit' });

    // =========================
    // DURACIÓN
    // =========================
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fast_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`)
            .toString()
            .trim()
    );

    console.log("Duración:", duration);

    // =========================
    // SUBTÍTULOS
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
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,48,&H0000FFFF,&H00000000,&H00000000,1,3,0,2,20,20,240,1

[Events]
Format: Start,End,Style,Text
`;

    function formatTime(sec) {
        const m = Math.floor(sec / 60);
        const s = (sec % 60).toFixed(2);
        return `0:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
    }

    const partDuration = duration / parts.length;

    parts.forEach((p, idx) => {
        const start = idx * partDuration;
        const end = start + partDuration;
        ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,${p}\n`;
    });

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // =========================
    // 🎬 IMAGEN
    // =========================
    execSync(`
ffmpeg -y -loop 1 -i image_${i}.jpg -vf "
fps=60,
scale=720:1280:force_original_aspect_ratio=decrease,
pad=720:1280:(ow-iw)/2:(oh-ih)/2,
rotate='if(lt(t,0.2),2*PI*(t/0.2),0)':c=black@0,
zoompan=z='if(gt(on,12),1+0.002*(on-12),1)':d=300:s=720x1280,
setsar=1
" -t 5 -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p image_part_${i}.mp4
`, { stdio: 'inherit' });

    // =========================
    // 🎬 VIDEO
    // =========================
    const remaining = Math.max(duration - 5, 1);

    execSync(`
ffmpeg -y -i video_${i}.mp4 -vf "
setpts=PTS/1.5,
scale=720:1280:force_original_aspect_ratio=decrease,
pad=720:1280:(ow-iw)/2:(oh-ih)/2,
setsar=1
" -t ${remaining} -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_part_${i}.mp4
`, { stdio: 'inherit' });

    // =========================
    // UNIR
    // =========================
    fs.writeFileSync(`list_${i}.txt`,
`file 'image_part_${i}.mp4'
file 'video_part_${i}.mp4'`);

    execSync(`ffmpeg -y -f concat -safe 0 -i list_${i}.txt -c copy combined_${i}.mp4`, { stdio: 'inherit' });

    // =========================
    // FINAL
    // =========================
    execSync(`
ffmpeg -y -i combined_${i}.mp4 -i audio_fast_${i}.mp3 -vf "ass=subs_${i}.ass" -t ${duration} -c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k -pix_fmt yuv420p -shortest output_${i}.mp4
`, { stdio: 'inherit' });

    // =========================
    // GUARDAR
    // =========================
    const key = `output-${i}-${Date.now()}.mp4`;
    const buffer = fs.readFileSync(`output_${i}.mp4`);

    await Actor.setValue(key, buffer, { contentType: 'video/mp4' });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;
    console.log("VIDEO LISTO:", url);

    await Actor.pushData({ videoUrl: url });
}

await Actor.exit();
