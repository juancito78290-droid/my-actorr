import { Actor } from 'apify';
import fs from 'fs';
import axios from 'axios';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();

if (!input?.audio_url || !input?.video_url || !input?.apiKey) {
    throw new Error("Falta audio_url, video_url o apiKey");
}

const { audio_url, video_url, apiKey } = input;

// 1. TRANSCRIPCIÓN
const transcriptRes = await axios.post(
    'https://api.assemblyai.com/v2/transcript',
    {
        audio_url: audio_url,
        punctuate: true,
        format_text: true,
        speech_model: "universal-2"
    },
    {
        headers: { authorization: apiKey }
    }
);

const transcriptId = transcriptRes.data.id;
console.log("Transcript ID:", transcriptId);

// Esperar resultado
let text = "";
while (true) {
    const polling = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        { headers: { authorization: apiKey } }
    );

    if (polling.data.status === "completed") {
        text = polling.data.text;
        break;
    }

    if (polling.data.status === "error") {
        throw new Error(polling.data.error);
    }

    await new Promise(r => setTimeout(r, 3000));
}

console.log("Texto final:", text);

// 2. DESCARGAR VIDEO Y AUDIO
console.log("Descargando video...");
execSync(`curl -L "${video_url}" -o video.mp4`);

console.log("Descargando audio...");
execSync(`curl -L "${audio_url}" -o audio_raw.mp3`);

// 🔥 3. LIMPIAR AUDIO (CLAVE)
console.log("Reparando audio...");
execSync(`ffmpeg -y -i audio_raw.mp3 -vn -acodec aac audio.aac`);

// 4. CREAR SUBTÍTULOS BONITOS (ASS)
const duration = 20;

const ass = `
[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV
Style: Default,Arial,28,&H00FFFFFF,&H00000000,1,2,0,2,20,20,40

[Events]
Format: Start,End,Style,Text
Dialogue: 0:00:00.00,0:00:${duration}.00,Default,${text}
`;

fs.writeFileSync("subs.ass", ass);

// 5. PROCESAR VIDEO FINAL
console.log("Procesando video con FFmpeg...");

execSync(`
ffmpeg -y \
-i video.mp4 \
-i audio.aac \
-vf "ass=subs.ass" \
-map 0:v:0 \
-map 1:a:0 \
-c:v libx264 \
-c:a aac \
-shortest \
output.mp4
`, { stdio: 'inherit' });

// 6. SUBIR RESULTADO
const fileUrl = await Actor.uploadFile("output.mp4", "output.mp4");

console.log("VIDEO FINAL:", fileUrl);

await Actor.exit();
