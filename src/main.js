import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';
import { Actor } from 'apify';

// 🔗 URL del video
const url = 'https://api.apify.com/v2/key-value-stores/lH2gvPfXIkqZQpEqC/records/video-f75e06531605bbdc76401cbd19c453af-b0442d.mp4?signature=z88rM9dFKbyB3j1cP4VD';

// 📥 función para descargar
function download(url, path) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(path);

        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        }, (res) => {

            console.log('STATUS:', res.statusCode);

            // aceptar solo 200 y 206
            if (res.statusCode !== 200 && res.statusCode !== 206) {
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

// 🚀 ejecución principal
(async () => {
    await Actor.init();

    try {
        console.log('Descargando...');
        await download(url, 'input.mp4');

        console.log('Procesando con ffmpeg...');
        execSync('ffmpeg -y -i input.mp4 -c copy output.mp4');

        console.log('Guardando en Apify Storage...');

        // guardar el video en storage
        await Actor.setValue('output-video', fs.readFileSync('output.mp4'), {
            contentType: 'video/mp4'
        });

        console.log('✅ Listo');

    } catch (err) {
        console.error('❌ Error:', err.message);
    }

    await Actor.exit();
})();
