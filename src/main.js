import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

function downloadFile(url, path) {
    const res = execSync(`curl -L "${url}" -o ${path}`);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = (seconds % 60).toFixed(2);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(5, '0')}`;
}

function splitText(text) {
    // divide en frases naturales
    return text
        .replace(/\n/g, ' ')
        .split(/\.|,|\n/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
}

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    console.log(`🎬 Procesando item ${i}`);

    // Descargar archivos
    downloadFile(videoUrl, `video_${i}.mp4`);
    downloadFile(audioUrl, `audio_${i}.mp3`);

    // Normalizar audio
    execSync(`ffmpeg -y -i audio_${i}.mp3 -ar 44100 -ac 2 audio_fixed_${i}.mp3`);

    // Dividir texto
    const parts = splitText(text);

    const totalDuration = 15; // SIEMPRE 15 segundos
    const partDuration = totalDuration / parts.length;

    // Crear ASS
    let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,48,&H00FFFFFF,&H00000000,1,3,0,2,20,20,60

[Events]
Format: Layer, Start, End, Style, Text
`;

    parts.forEach((line, index) => {
        const start = formatTime(index * partDuration);
        const end = formatTime((index + 1) * partDuration);

        ass += `Dialogue: 0,${start},${end},Default,${line}\n`;
    });

    fs.writeFileSync(`subs_${i}.ass`, ass);

    // Crear video final
    execSync(`
ffmpeg -y \
-i video_${i}.mp4 \
-i audio_fixed_${i}.mp3 \
-vf "scale=480:854,ass=subs_${i}.ass" \
-map 0:v -map 1:a \
-c:v libx264 -preset ultrafast -crf 28 \
-c:a aac -b:a 96k \
-shortest \
output_${i}.mp4
`);

    // Guardar en Apify storage
    const fileBuffer = fs.readFileSync(`output_${i}.mp4`);

    const { url } = await Actor.setValue(`output_${i}.mp4`, fileBuffer, {
        contentType: 'video/mp4',
    });

    console.log(`✅ VIDEO LISTO: ${url}`);
}

await Actor.exit();
