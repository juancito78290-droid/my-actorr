FROM apify/actor-node:18

# Instalar FFmpeg y fuentes necesarias para subtítulos
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos del proyecto
COPY . ./

# Instalar dependencias
RUN npm install --omit=dev

# Ejecutar
CMD ["node", "main.js"]
