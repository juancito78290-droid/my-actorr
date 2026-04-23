import { Actor } from 'apify';
import fs from 'fs';
import https from 'https';
import axios from 'axios';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();
const { videoUrl, audioUrl } = input;

if (!videoUrl || !audioUrl) {
    throw new Error('Faltan videoUrl o audioUrl');
}

const apiKey = process.env.ASSEMBLYAI_API_KEY;

if (!apiKey) {
    throw new Error('Falta ASSEMBLYAI_API_KEY en variables de entorno');
}

// -------- DESCARGA --------
function download(url, path) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path);

        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            if (![200, 206].includes(res.statusCode)) {
                reject(new Error(`Error descarga: ${res.statusCode}`));
                return;
            }

            res.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', reject);
    });
}

// -------- TRANSCRIPCIÓN --------
async function transcribeAssembly() {

    console.log('Subiendo audio...');

    const upload = await axios({
        method: 'post',
        url: 'https://api.assemblyai.com/v2/upload',
        headers: { authorization: apiKey },
        data: fs.createReadStream('audio.mp3')
    });

    const audio_url = upload.data.upload_url;

    console.log('Creando transcripción...');

    const transcript = await axios.post(
        'https://api.assemblyai.com/v2/transcript',
        {
            audio_url,
            punctuate: true,
            format_text: true
        },
        {
            headers: { authorization: apiKey }
        }
    );

    const id = transcript.data.id;

    console.log('Esperando resultado...');

    while (true) {
        const polling = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${id}`,
            { headers: { authorization: apiKey } }
        );

        if (polling.data.status === 'completed') {
            if (!polling.data.words) {
                throw new Error('No se recibieron palabras de AssemblyAI');
            }
            return polling.data.words;
        }

        if (polling.data.status === 'error') {
            throw new Error(polling.data.error);
        }

        await new Promise(r => setTimeout(r, 3000));
    }
}

// -------- FORMATO TIEMPO --------
function secondsToASS(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = (sec % 60).toFixed(2);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(5,'0')}`;
}

// -------- SUBTÍTULOS --------
function createASS(words) {

    let content = `[Script Info]
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, BorderStyle, Outline, Shadow, Alignment
Style: Default,DejaVu Sans,60,&H00FFFFFF,&H0000FFFF,&H00000000,&H64000000,1,3,0,2

[Events]
Format: Start, End, Style, Text
`;

    for (let i = 0; i < words.length; i++) {
        const w = words[i];

        const start = secondsToASS(w.start / 1000);
        const end = secondsToASS(w.end / 1000);

        const windowSize = 3;

        const startIndex = Math.max(0, i - windowSize);
        const endIndex = Math.min(words.length, i + windowSize);

        let line = words.slice(startIndex, endIndex).map((wordObj, index) => {
            const clean = wordObj.text.replace(/[,{}]/g, '');

            if (startIndex + index === i) {
                return `{\\c&H00FFFF&}${clean}`;
            } else {
                return `{\\c&HFFFFFF&}${clean}`;
            }
        }).join(' ');

        content += `Dialogue: ${start},${end},Default,${line}\n`;
    }

    fs.writeFileSync('subs.ass', content);
}

// -------- MAIN --------
(async () => {
    try {

        console.log('Descargando video...');
        await download(videoUrl, 'video.mp4');

        console.log('Descargando audio...');
        await download(audioUrl, 'audio.mp3');

        const words = await transcribeAssembly();

        console.log('Creando subtítulos...');
        createASS(words);

        console.log('Renderizando video...');

        const command = `ffmpeg -y -stream_loop -1 -i video.mp4 -i audio.mp3 -vf "ass=subs.ass" -map 0:v -map 1:a -c:v libx264 -c:a aac -shortest output.mp4`;

        execSync(command, { stdio: 'inherit' });

        console.log('Subiendo resultado...');

        const store = await Actor.openKeyValueStore();

        await store.setValue('OUTPUT_VIDEO', fs.createReadStream('output.mp4'), {
            contentType: 'video/mp4'
        });

        const url = `https://api.apify.com/v2/key-value-stores/${store.id}/records/OUTPUT_VIDEO`;

        console.log('VIDEO URL:', url);

        await Actor.pushData({ url });

        await Actor.exit();

    } catch (err) {
        console.error('ERROR:', err);
        await Actor.exit();
    }
})();
