# Imagen de desarrollo (Vite dev server con hot-reload). Para produccion,
# se recomienda un build multi-stage con `npm run build` + nginx aparte.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev"]
