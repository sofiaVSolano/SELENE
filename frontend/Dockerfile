# Imagen de desarrollo (Vite dev server con hot-reload). Para produccion,
# se recomienda un build multi-stage con `npm run build` + nginx aparte.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 5173

# `npm install` tambien al arrancar, no solo al construir la imagen.
#
# Motivo: docker-compose monta el volumen con nombre `frontend_node_modules`
# sobre /app/node_modules. Docker solo siembra un volumen con nombre desde la
# imagen la PRIMERA vez que lo crea; despues nunca lo vuelve a tocar. Sin esta
# linea, cualquier dependencia añadida a package.json despues de ese primer
# arranque jamas llega al contenedor, aunque se reconstruya la imagen, y Vite
# falla con un ENOENT confuso sobre el paquete que falta (paso exactamente eso
# con @fontsource/*). Con node_modules al dia la orden tarda ~2 s.
CMD ["sh", "-c", "npm install && npm run dev"]
