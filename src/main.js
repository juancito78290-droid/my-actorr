import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';
import axios from 'axios';

await Actor.init();

// 📥 INPUT
const input = await Actor.getInput();
const { video_url, audio_url, apiKey } = input;

if (!video_url || !audio_url || !apiKey) {
    throw new Error("Faltan datos: video_url, audio_url o apiKey");
}

// 📥 DESCARGAR ARCHIVOS
console.log("Descargando video...");
execSync(`curl -L "${video_url}" -o video.mp4`);

console.log("Descargando audio...");
execSync(`curl -L "${audio_url}" -o audio.mp3`);

// 🎤 TRANSCRIPCIÓN (AssemblyAI FIX)
console.log("Enviando audio a AssemblyAI...");

const transcriptResponse = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    {
        audio_url: audio_url,
        speech_models: ["universal"] // ✅ FIX AQUÍ
    },
    {
        headers: {
            authorization: apiKey,
            "content-type": "application/json"
        }
    }
);

const transcriptId = transcriptResponse.data.id;
console.log("Transcript ID:", transcriptId);

// ⏳ ESPERAR RESULTADO
let textoFinal = "";

while (true) {
    const polling = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
            headers: { authorization: apiKey }
        }
    );

    if (polling.data.status === "completed") {
        textoFinal = polling.data.text;
        break;
    }

    if (polling.data.status === "error") {
        throw new Error("Error en transcripción");
    }

    await new Promise(r => setTimeout(r, 3000));
}

console.log("Texto final:", textoFinal);

// 📝 CREAR SUBTÍTULOS (ASS - pequeños abajo)
const ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,22,&H00FFFFFF,&H00000000,1,1,0,2,20,20,40

[Events]
Format: Start, End, Style, Text
Dialogue: 0:00:00.00,0:00:20.00,Default,${textoFinal}
`;

fs.writeFileSync("subs.ass", ass);

// 🎬 FFmpeg (FIX AUDIO + SUBS)
console.log("Procesando video...");

execSync(`
ffmpeg -y \
-err_detect ignore_err \
-i video.mp4 \
-i audio.mp3 \
-vf "ass=subs.ass" \
-c:v libx264 \
-c:a aac \
-shortest \
output.mp4
`);

console.log("✅ Video creado");

// 📤 OUTPUT
await Actor.pushData({
    status: "success",
    video: "output.mp4"
});

await Actor.exit();
