import fs from "fs";
import fetch from "node-fetch";
import { spawn } from "child_process";
import os from "os";

// ==========================
// DESCARGA SEGURA
// ==========================
async function download(url, path) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(path, Buffer.from(buffer));
}

// ==========================
// DURACIÓN VIDEO
// ==========================
function getDuration() {
    return new Promise((resolve) => {
        const ff = spawn("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            "video.mp4"
        ]);

        let data = "";
        ff.stdout.on("data", chunk => data += chunk);

        ff.on("close", () => {
            resolve(parseFloat(data));
        });
    });
}

// ==========================
// EJECUTAR FFMPEG (SEGURO)
// ==========================
function runFFmpeg(args) {
    return new Promise((resolve, reject) => {
        const ff = spawn("ffmpeg", args, {
            stdio: "inherit"
        });

        ff.on("close", code => {
            if (code === 0) resolve();
            else reject(new Error("FFmpeg falló"));
        });
    });
}

// ==========================
// MAIN
// ==========================
console.log("🔥 MODO PRO ULTRA ESTABLE 🔥");

// URLs
const videoUrl = "TU_VIDEO_URL";
const audioUrl = "TU_AUDIO_URL";

// Descargar
console.log("⬇️ Descargando...");
await download(videoUrl, "video.mp4");
await download(audioUrl, "audio.mp3");

// Duración
console.log("⏱ Analizando...");
const duration = await getDuration();
console.log("Duración:", duration);

// Subtítulos simples
fs.writeFileSync("subs.srt", `1
00:00:00,000 --> 00:00:${Math.floor(duration).toString().padStart(2, "0")},000
Hola
Este video tiene audio nuevo
`);

// Cortar audio
console.log("✂️ Cortando audio...");
await runFFmpeg([
    "-y",
    "-i", "audio.mp3",
    "-t", duration.toString(),
    "-c", "copy",
    "audio_cut.mp3"
]);

// ==========================
// CONTROL DE RAM REAL
// ==========================
const ramMB = os.totalmem() / 1024 / 1024;
console.log("RAM:", ramMB);

// 🔥 CLAVES PARA NO MORIR
let scale = "720:-2";
let crf = "28";

if (ramMB > 8000) {
    scale = "854:-2";
    crf = "26";
}
if (ramMB > 16000) {
    scale = "960:-2";
    crf = "25";
}

// 🚫 NUNCA 1080 con subtitles en Apify
// (eso fue lo que te mató)
console.log("Resolución:", scale);

// ==========================
// FFMPEG FINAL (OPTIMIZADO)
// ==========================
console.log("⚙️ Procesando...");

await runFFmpeg([
    "-y",
    "-i", "video.mp4",
    "-i", "audio_cut.mp3",

    "-vf", `scale=${scale},subtitles=subs.srt:force_style='FontName=Arial,FontSize=24,Outline=1'`,

    "-map", "0:v:0",
    "-map", "1:a:0",

    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", crf,

    "-threads", "2",        // 🔥 clave anti kill
    "-max_muxing_queue_size", "1024",

    "-c:a", "aac",
    "-b:a", "128k",

    "-shortest",
    "output.mp4"
]);

console.log("✅ LISTO SIN MUERTES");
