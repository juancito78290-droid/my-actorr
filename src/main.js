import { execSync } from "child_process";
import fs from "fs";
import { Actor } from "apify";

await Actor.init();

console.log("🔥 MODO PRO ACTIVADO 🔥");

const input = await Actor.getInput();

const {
    videoUrl,
    audioUrl,
    subtitlesText = "Texto de prueba",
} = input;

// ==========================
// 🔽 DESCARGA SEGURA
// ==========================
const download = async (url, path) => {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Error descargando: ${url} - ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path, buffer);
};

console.log("⬇️ Descargando archivos...");
await download(videoUrl, "video.mp4");
await download(audioUrl, "audio.mp3");

// ==========================
// 📝 CREAR SUBTÍTULOS
// ==========================
console.log("📝 Generando subtítulos...");

const subtitles = `1
00:00:00,000 --> 00:00:30,000
${subtitlesText}
`;

fs.writeFileSync("subs.srt", subtitles);

// ==========================
// ⏱ OBTENER DURACIÓN VIDEO
// ==========================
console.log("⏱ Analizando video...");

const duration = parseFloat(execSync(`
ffprobe -v error -show_entries format=duration \
-of default=noprint_wrappers=1:nokey=1 video.mp4
`).toString());

console.log("Duración:", duration);

// ==========================
// 🧠 DETECTAR RAM DISPONIBLE
// ==========================
const totalMem = require("os").totalmem() / 1024 / 1024; // MB

console.log("RAM disponible:", totalMem, "MB");

let scale = "720:-2";
let crf = 28;

if (totalMem < 1500) {
    scale = "480:-2";
    crf = 30;
}

if (totalMem < 800) {
    scale = "360:-2";
    crf = 32;
}

console.log(`Resolución: ${scale} | CRF: ${crf}`);

// ==========================
// ✂️ CORTAR AUDIO AUTOMÁTICO
// ==========================
console.log("✂️ Ajustando audio...");

execSync(`
ffmpeg -y -i audio.mp3 -t ${duration} -c copy audio_cut.mp3
`);

// ==========================
// 🎬 PROCESAMIENTO FINAL
// ==========================
console.log("⚙️ Ejecutando FFmpeg PRO...");

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio_cut.mp3 \
-vf "scale=${scale},subtitles=subs.srt" \
-map 0:v:0 -map 1:a:0 \
-c:v libx264 -preset ultrafast -crf ${crf} \
-c:a aac \
-shortest \
output.mp4
`, { stdio: "inherit" });

// ==========================
// 📤 GUARDAR RESULTADO
// ==========================
console.log("📤 Subiendo resultado...");

await Actor.setValue("OUTPUT_VIDEO", fs.readFileSync("output.mp4"), {
    contentType: "video/mp4",
});

console.log("✅ TODO PERFECTO");

await Actor.exit();
