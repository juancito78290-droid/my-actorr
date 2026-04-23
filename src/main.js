import { execSync } from 'child_process';
import fs from 'fs';

const input = JSON.parse(await fs.promises.readFile('INPUT.json', 'utf-8'));

for (let i = 0; i < input.items.length; i++) {
    const { videoUrl, audioUrl, text } = input.items[i];

    console.log(`🎬 Procesando item ${i}`);

    // Descargar (silencioso)
    execSync(`curl -sL "${videoUrl}" -o v.mp4`);
    execSync(`curl -sL "${audioUrl}" -o a.mp3`);

    // ---- SUBTÍTULOS ASS (bloques resaltados amarillo) ----
    const lines = text.split('. ').filter(t => t.trim());
    const d = 2.3;

    let ass = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding

; TEXTO NEGRO + FONDO AMARILLO
Style: Default,Arial,20,&H00000000,&H00000000,&H00000000,&H0000FFFF,1,0,0,0,100,100,0,0,3,0,0,2,10,10,50,1

[Events]
Format: Layer,Start,End,Style,Text
`;

    let t = 0;

    const fmt = (x) => {
        const h = String(Math.floor(x / 3600)).padStart(2, '0');
        const m = String(Math.floor((x % 3600) / 60)).padStart(2, '0');
        const s = String(Math.floor(x % 60)).padStart(2, '0');
        const cs = String(Math.floor((x % 1) * 100)).padStart(2, '0');
        return `${h}:${m}:${s}.${cs}`;
    };

    for (const line of lines) {
        ass += `Dialogue: 0,${fmt(t)},${fmt(t + d)},Default,${line}\n`;
        t += d;
    }

    fs.writeFileSync('s.ass', ass);

    // ---- FFmpeg ULTRA OPTIMIZADO ----
    execSync(`
        ffmpeg -loglevel error -y \
        -i v.mp4 -i a.mp3 \
        -vf "scale=480:854,ass=s.ass" \
        -map 0:v:0 -map 1:a:0 \
        -c:v libx264 -preset ultrafast -crf 35 \
        -c:a aac -b:a 48k -ac 1 \
        -r 24 \
        -threads 1 \
        -shortest \
        o.mp4
    `);

    console.log(`✅ Listo: o.mp4`);
}
