FROM node:18-bullseye

# Instalar ffmpeg y fuentes
RUN apt-get update && apt-get install -y \
    ffmpeg \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN npm install

CMD ["node", "main.js"]
