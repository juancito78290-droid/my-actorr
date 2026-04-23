import { Actor } from 'apify';
import fs from 'fs';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();

// Soporta 1 o múltiples items
const items = Array.isArray(input) ? input : [input];

function dividirTexto(texto, partes = 3) {
    const palabras = texto.split(" ").filter(p => p.trim() !== "");
    const chunkSize = Math.ceil(palabras.length / partes);

    let resultado = [];
    for (let i = 0; i < palabras.length; i += chunkSize) {
        resultado.push(palabras.slice(i, i + chunkSize).join(" "));
    }
    return resultado;
}

function formatTime(t) {
    const h = String(Math.floor(t / 3600));
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = (t % 60).toFixed(2).padStart(5, '0');
    return `${h}:${m}:${s}`;
}

for (let i = 0; i < items.length; i++) {
    const { videoUrl, audioUrl, text } = items[i];

    if (!videoUrl || !audioUrl || !text) {
        console.log(`❌ Item ${i} inválido`);
        continue;
    }

    console.log(`\n🎬 Procesando item ${i}`);

    const videoFile = `video_${i}.mp4`;
    const audioFile = `audio_${i}.mp3`;
    const outputFile = `output_${i}.mp4`;
    const subsFile = `subs_${i}.ass`;

    try {
        // 1. Descargar archivos
        execSync(`curl -L "${videoUrl}" -o ${videoFile}`);
        execSync(`curl -L "${audioUrl}" -o ${audioFile}`);

        // 2. Duración audio
        const duration = parseFloat(
            execSync(`ffprobe -i ${audioFile} -show_entries format=duration -v quiet -of csv="p=0"`).toString()
        );

        if (!duration || isNaN(duration)) {
            console.log("❌ Error leyendo duración audio");
            continue;
        }

        // 3. Dividir texto
        const bloques = dividirTexto(text, 3);
        const tiempoPorBloque = duration / bloques.length;

        // 4. Crear ASS
        let ass = `[Script Info]
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,BackColour,Bold,Alignment,MarginL,MarginR,MarginV,BorderStyle,Outline,Shadow
Style: Default,Arial,60,&H00FFFFFF,&H00000000,1,2,50,50,120,1,2,0

[Events]
Format: Start,End,Style,Text
`;

        bloques.forEach((bloque, index) => {
            const start = index * tiempoPorBloque;
            const end = (index + 1) * tiempoPorBloque;

            ass += `Dialogue: ${formatTime(start)},${formatTime(end)},Default,{\\an2\\bord3\\shad0}${bloque}\n`;
        });

        fs.writeFileSync(subsFile, ass);

        // 5. FFmpeg
        execSync(`
        ffmpeg -y \
        -i ${videoFile} \
        -i ${audioFile} \
        -t ${duration} \
        -vf "ass=${subsFile}" \
        -c:v libx264 -preset ultrafast -crf 28 \
        -c:a aac -shortest \
        ${outputFile}
        `, { stdio: 'inherit' });

        // 6. Guardar output
        const buffer = fs.readFileSync(outputFile);

        const key = `OUTPUT_VIDEO_${i}`;

        await Actor.setValue(key, buffer, {
            contentType: "video/mp4"
        });

        const url = `https://api.apify.com/v2/key-value-stores/default/records/${key}`;

        await Actor.pushData({
            index: i,
            videoUrl: url
        });

        console.log(`✅ Item ${i} listo`);

    } catch (err) {
        console.log(`❌ Error en item ${i}`, err.message);
    }
}

await Actor.exit();
