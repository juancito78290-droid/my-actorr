import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

const input = await Actor.getInput();
const items = input.items || [];

const store = await Actor.openKeyValueStore();
const storeId = store.id;

for (let i = 0; i < items.length; i++) {
const { videoUrl, audioUrl, text } = items[i];

console.log(`🎬 Procesando item ${i}`);

// Descargar archivos
execSync(`curl -L "${videoUrl}" -o video_${i}.mp4`);
execSync(`curl -L "${audioUrl}" -o audio_${i}.mp3`);

// Normalizar audio
execSync(`ffmpeg -y -i audio_${i}.mp3 -ar 44100 -ac 2 audio_fixed_${i}.mp3`);

// 🔥 dividir texto dinámico
const words = text.split(" ");
const chunkSize = Math.ceil(words.length / 5);
const parts = [];

for (let j = 0; j < words.length; j += chunkSize) {
parts.push(words.slice(j, j + chunkSize).join(" "));
}

// 🔥 ASS (FUENTE + AMARILLO MÁS BRILLANTE)
let ass = `[Script Info]

ScriptType: v4.00+
PlayResX: 480
PlayResY: 854
WrapStyle: 0

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,DejaVu Sans Bold,56,&H0000EEFF,&H0000EEFF,&H00000000,&H00000000,3,3,0,2,20,20,70

[Events]
Format: Start,End,Style,Text
`;

const partDuration = 3;

function formatTime(sec) {
const h = Math.floor(sec / 3600);
const m = Math.floor((sec % 3600) / 60);
const s = (sec % 60).toFixed(2);
return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
}

parts.forEach((p, idx) => {
const start = idx * partDuration;
const end = start + partDuration;

ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,${p}\n`;
});

fs.writeFileSync(`subs_${i}.ass`, ass);

// 🎬 render final
execSync(`ffmpeg -y -i video_${i}.mp4 -i audio_fixed_${i}.mp3 -vf "scale=480:854,ass=subs_${i}.ass" -t 15 -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 96k output_${i}.mp4`);

// Guardar
const buffer = fs.readFileSync(`output_${i}.mp4`);
const key = `output_${i}.mp4`;

await Actor.setValue(key, buffer, {
contentType: 'video/mp4'
});

const url = `https://api.apify.com/v2/key-value-stores/${storeId}/records/${key}`;

console.log("✅ VIDEO LISTO:", url);

await Actor.pushData({
videoUrl: url
});

}

await Actor.exit();
