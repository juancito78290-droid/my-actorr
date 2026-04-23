import axios from "axios";
import { Actor } from "apify";

await Actor.init();

const input = await Actor.getInput();
const { audio_url } = input;

const API_KEY = process.env.ASSEMBLY_API_KEY;

if (!audio_url) {
    throw new Error("Falta audio_url en el input");
}

if (!API_KEY) {
    throw new Error("Falta ASSEMBLY_API_KEY en variables de entorno");
}

try {
    // 1. Enviar audio a AssemblyAI
    const response = await axios.post(
        "https://api.assemblyai.com/v2/transcript",
        {
            audio_url: audio_url,
            punctuate: true,
            format_text: true,
            speech_models: ["universal-2"] // 👈 CORRECTO
        },
        {
            headers: {
                authorization: API_KEY,
                "content-type": "application/json"
            }
        }
    );

    const transcriptId = response.data.id;

    console.log("Transcript ID:", transcriptId);

    // 2. Esperar resultado
    let completed = false;
    let result;

    while (!completed) {
        await new Promise(r => setTimeout(r, 5000));

        const polling = await axios.get(
            `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
            {
                headers: {
                    authorization: API_KEY
                }
            }
        );

        if (polling.data.status === "completed") {
            completed = true;
            result = polling.data;
        } else if (polling.data.status === "error") {
            throw new Error(polling.data.error);
        } else {
            console.log("Procesando...");
        }
    }

    console.log("Texto:", result.text);

    await Actor.pushData({
        text: result.text
    });

} catch (error) {
    console.error("ERROR:", error.response?.data || error.message);
    throw error;
}

await Actor.exit();
