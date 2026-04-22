import { Actor } from 'apify';
import { execSync } from 'child_process';
import fs from 'fs';

await Actor.init();

try {
    console.log('🚀 Iniciando FFmpeg...');

    // URL de video (puedes cambiarla luego)
    const videoUrl = 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4';

    const inputPath = '/tmp/input.mp4';
    const outputPath = '/tmp/output.mp4';

    // Descargar video
    const response = await fetch(videoUrl);
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(inputPath, buffer);

    console.log('✅ Video descargado');

    // Editar video (ejemplo: reducir tamaño)
    execSync(`ffmpeg -i ${inputPath} -vf scale=320:240 ${outputPath}`);

    console.log('🎬 Video procesado');

    // Leer resultado
    const resultBuffer = fs.readFileSync(outputPath);

    // Guardar resultado en dataset
    await Actor.pushData({
        message: 'Video procesado con FFmpeg ✅',
        size: resultBuffer.length
    });

} catch (error) {
    console.error('❌ Error:', error);
} finally {
    await Actor.exit();
}
