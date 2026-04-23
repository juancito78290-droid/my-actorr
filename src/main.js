import { Actor } from 'apify';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';

await Actor.init();

const input = await Actor.getInput();

const videoUrl = input.videoUrl;
const audioUrl = input.audioUrl;
const text = input.text || 'TEST';

if (!videoUrl || !audioUrl) {
    throw new Error('Faltan videoUrl o audioUrl');
}

// descargar
function download(url, path) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path);

        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            console.log('STATUS:', res.statusCode);

            if (![200, 206].includes(res.statusCode)) {
                reject(new Error('Status: ' + res.statusCode));
                return;
            }

            res.pipe(file);

            file.on('finish', () => {
                file.close(resolve);
            });

        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('Descargando video...');
        await download(videoUrl, 'video.mp4');

        console.log('Descargando audio...');
        await download(audioUrl, 'audio.mp3');

        console.log('Verificando ffmpeg...');
        execSync('ffmpeg -filters | grep drawtext || true', { stdio: 'inherit' });

        console.log('Procesando video + audio + texto...');

        // 👇 SIN fontfile → usa fontconfig (más estable aquí)
        const command = `ffmpeg -y \
-i video.mp4 \
-i audio.mp3 \
-filter_complex "[0:v]drawtext=text='${text}':x=(w-text_w)/2:y=h-80:fontsize=36:fontcolor=white:borderw=2:bordercolor=black[v]" \
-map "[v]" -map 1:a \
-c:v libx264 -c:a aac -shortest output.mp4`;

        execSync(command, { stdio: 'inherit' });

        console.log('✅ VIDEO FINAL LISTO');

        await Actor.pushData({
            output: 'output.mp4'
        });

        await Actor.exit();

    } catch (err) {
        console.error('❌ ERROR:', err);
        await Actor.exit();
    }
})();
