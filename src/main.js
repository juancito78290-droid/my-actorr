import axios from "axios";
import fs from "fs";
import { execSync } from "child_process";
import { Actor } from "apify";

await Actor.init();

const input = await Actor.getInput();

// Validación
if (!input?.audio_url || !input?.video_url) {
    throw new Error("Falta audio_url o video_url");
}

// ⚠️ Tu API key (puedes dejarla aquí o luego moverla a env)
const API_KEY = "bb920a640fbb45e2bd1f77cb091991a0";

// --------------------
// 1. ENVIAR A ASSEMBLY
// --------------------
const start = await axios.post(
    "https://api.assemblyai.com/v2/transcript",
    {
        audio_url: input.audio_url,
        speech_models: ["universal-2"],
        punctuate: true,
        format_text: true
    },
    {
        headers: {
            authorization: API_KEY,
            "content-type": "application/json"
        }
    }
);

const transcriptId = start.data.id;
console.log("Transcript ID:", transcriptId);

// --------------------
// 2. ESPERAR RESULTADO
// --------------------
let transcriptData;

while (true) {
    await new Promise(r => setTimeout(r, 4000));

    const res = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
            headers: { authorization: API_KEY }
        }
    );

    if (res.data.status === "completed") {
        transcriptData = res.data;
        break;
    }

    if (res.data.status === "error") {
        throw new Error("Error en transcripción: " + res.data.error);
    }

    console.log("Esperando...");
}

console.log("Texto final:", transcriptData.text);

// --------------------
// 3. GENERAR .ASS (subtítulos normales)
// --------------------
const words = transcriptData.words;

let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BorderStyle, Outline, Shadow, Alignment, MarginV
Style: Default,Arial,20,&H00FFFFFF,&H00000000,1,2,0,2,20

[Events]
Format: Layer, Start, End, Style, Text
`;

function formatTime(ms) {
    const date = new Date(ms);
    return date.toISOString().substr(11, 12);
}

// Agrupar palabras (líneas normales)
for (let i = 0; i < words.length; i += 8) {
    const chunk = words.slice(i, i + 8);

    const start = formatTime(chunk[0].start);
    const end = formatTime(chunk[chunk.length - 1].end);

    const text = chunk.map(w => w.text).join(" ");

    ass += `Dialogue: 0,${start},${end},Default,${text}\n`;
}

fs.writeFileSync("subs.ass", ass);

// --------------------
// 4. DESCARGAR VIDEO Y AUDIO
// --------------------
console.log("Descargando video...");
execSync(`curl -L "${input.video_url}" -o video.mp4`);

console.log("Descargando audio...");
execSync(`curl -L "${input.audio_url}" -o audio.mp3`);

// --------------------
// 5. FFMPEG (unir + subtítulos)
// --------------------
console.log("Procesando video con FFmpeg...");

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-vf "ass=subs.ass" \
-map 0:v -map 1:a \
-c:v libx264 -preset veryfast \
-c:a aac \
-shortest output.mp4
`);

// --------------------
// 6. GUARDAR RESULTADOS
// --------------------
await Actor.setValue("video_final.mp4", fs.readFileSync("output.mp4"), {
    contentType: "video/mp4"
});

await Actor.setValue("subtitulos.ass", ass);

await Actor.setValue("texto.txt", transcriptData.text);

// --------------------
await Actor.exit();
