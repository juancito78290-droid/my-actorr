FROM apify/actor-node:18

USER root

# Instalar FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

# Volver a usuario normal
USER myuser

# Copiar archivos
COPY package*.json ./
RUN npm install

COPY . ./

# Ejecutar tu actor
CMD ["node", "src/main.js"]
