import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

const store = await Actor.openKeyValueStore();
const storeId = store.id;

// Funcion para numero aleatorio entre min y max
function rand(min, max) {
    return (Math.random() * (max - min) + min).toFixed(3);
}

for (let i = 0; i < items.length; i++) {
    const { imageUrl, videoUrl, audioUrl, audioBase64, text: rawText } = items[i];
    const text = (rawText || "").replace(/[\x00-\x1F\x7F]/g, " ").trim();

    console.log(`\n=== ITEM ${i} ===`);

    // =========================
    // TRANSFORMACIONES ALEATORIAS — diferentes en cada ejecucion
    // =========================
    const doMirror = Math.random() > 0.5;                      // 50% chance de mirror
    const speed = parseFloat(rand(1.3, 1.7));                  // velocidad entre 1.3x y 1.7x
    const cropFactor = parseFloat(rand(0.92, 0.98));           // recorte entre 2% y 8%
    const brightness = parseFloat(rand(-0.05, 0.08));          // brillo aleatorio
    const contrast = parseFloat(rand(1.05, 1.20));             // contraste aleatorio
    const saturation = parseFloat(rand(1.05, 1.35));           // saturacion aleatoria
    const rotation = parseFloat(rand(-1.5, 1.5));              // rotacion leve
    const noise = parseFloat(rand(2, 8));                      // grano de video
    const audioTempo = speed;                                   // audio igual que video
    const audioVolume = parseFloat(rand(0.9, 1.1));            // volumen aleatorio
    const audioPitch = parseFloat(rand(0.95, 1.05));           // pitch aleatorio

    console.log(`Mirror: ${doMirror}, Speed: ${speed}, Crop: ${cropFactor}`);
    console.log(`Brightness: ${brightness}, Contrast: ${contrast}, Saturation: ${saturation}`);
    console.log(`Rotation: ${rotation}, Noise: ${noise}`);
    console.log(`Audio tempo: ${audioTempo}, Volume: ${audioVolume}, Pitch: ${audioPitch}`);

    // =========================
    // DESCARGAR MEDIA
    // =========================
    execSync(`curl -L "${imageUrl}" -o image_${i}.jpg`, { stdio: 'inherit' });
    execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`, { stdio: 'inherit' });

    // =========================
    // AUDIO DESDE BASE64 (Gemini TTS), URL MP3 o Google Drive
    // =========================
    let inputAudio = `audio_${i}.mp3`;

    if (audioBase64) {
        console.log("Convirtiendo audioBase64 de Gemini TTS a MP3...");
        const pcmBuffer = Buffer.from(audioBase64, 'base64');
        fs.writeFileSync(`audio_${i}.pcm`, pcmBuffer);
        execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i audio_${i}.pcm -codec:a libmp3lame -qscale:a 2 ${inputAudio}`, { stdio: 'inherit' });
    } else if (audioUrl) {
        let downloadUrl = audioUrl;
        const driveMatch = audioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (driveMatch) {
            const fileId = driveMatch[1];
            downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            console.log("Google Drive detectado, descargando con ID:", fileId);
        } else {
            console.log("Descargando audio MP3 desde URL...");
        }
        execSync(`curl -L -c /tmp/cookies.txt -b /tmp/cookies.txt "${downloadUrl}" -o ${inputAudio}`, { stdio: 'inherit' });
    } else {
        throw new Error("Debes enviar audioBase64 o audioUrl");
    }

    // =========================
    // PROCESAR AUDIO — tempo + pitch + volumen aleatorios
    // =========================
    execSync(`ffmpeg -y -i ${inputAudio} -filter:a "atempo=${audioTempo},asetrate=44100*${audioPitch},aresample=48000,volume=${audioVolume}" audio_fast_${i}.mp3`, { stdio: 'inherit' });

    // =========================
    // DURACION
    // =========================
    const duration = parseFloat(
        execSync(`ffprobe -i audio_fast_${i}.mp3 -show_entries format=duration -v quiet -of csv="p=0"`)
            .toString().trim()
    );
    console.log("Duracion:", duration);

    // =========================
    // SUBTITULOS
    // =========================
    const words = (text || "").toUpperCase().split(" ");
    const chunkSize = 2;
    const parts = [];

    for (let j = 0; j < words.length; j += chunkSize) {
        parts.push(words.slice(j, j + chunkSize).join(" "));
    }

    let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 480
PlayResY: 854

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Bold
Style: Default,DejaVu Sans,36,&H0000FFFF,&H00000000,&H00000000,1,3,0,2,20,20,180,1

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
    // VIDEO — todas las transformaciones anti-deteccion aleatorias
    // =========================
    const remaining = Math.max(duration, 1);
    const mirrorFilter = doMirror ? 'hflip,' : '';
    const rotateFilter = rotation !== 0 ? `rotate=${rotation}*PI/180:ow=rotw(${rotation}*PI/180):oh=roth(${rotation}*PI/180),` : '';

    const videoFilter = `setpts=PTS/${speed},${mirrorFilter}crop=iw*${cropFactor}:ih*${cropFactor}:(iw-iw*${cropFactor})/2:(ih-ih*${cropFactor})/2,${rotateFilter}eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation},noise=alls=${noise}:allf=t,scale=480:854:force_original_aspect_ratio=decrease,pad=480:854:(ow-iw)/2:(oh-ih)/2,setsar=1`;

    execSync(`ffmpeg -y -i video_${i}.mp4 -vf "${videoFilter}" -t ${remaining} -an -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p video_part_${i}.mp4`, { stdio: 'inherit' });

    // =========================
    // FINAL — audio + subtitulos
    // =========================
    execSync(`ffmpeg -y -i video_part_${i}.mp4 -i audio_fast_${i}.mp3 -vf "ass=subs_${i}.ass,fps=30" -t ${duration} -c:v libx264 -preset ultrafast -crf 28 -maxrate 3M -bufsize 6M -pix_fmt yuv420p -c:a aac -b:a 128k -ar 48000 -movflags +faststart -shortest output_${i}.mp4`, { stdio: 'inherit' });

    // =========================
    // GUARDAR
    // =========================
    const key = `output-${Date.now()}-${i}.mp4`;
    const bufferOut = fs.readFileSync(`output_${i}.mp4`);
    await Actor.setValue(key, bufferOut, { contentType: 'video/mp4' });

    const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;
    console.log("VIDEO LISTO:", url);
    await Actor.pushData({ videoUrl: url });

    // =========================
    // LIMPIEZA
    // =========================
    execSync(`rm -f image_${i}.jpg video_${i}.mp4 audio_${i}.mp3 audio_${i}.pcm audio_fast_${i}.mp3 video_part_${i}.mp4 subs_${i}.ass output_${i}.mp4`);
}

await Actor.exit();
