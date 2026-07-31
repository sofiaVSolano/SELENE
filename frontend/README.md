# SELENE — Frontend (React + Vite + Tailwind)

Landing page, acceso (login/register) y panel de escaneo en vivo para
SELENE, el sistema de gestión inteligente de luminarias.

## Stack

- **React 18 + Vite** — SPA con `react-router-dom`.
- **Tailwind CSS** — paleta propia (`void`/`haze`/`beam`/`glow`, ver
  `tailwind.config.js`) en tonos negro, gris, naranja y amarillo.
- **Framer Motion** — transiciones, tilt 3D en las cards, radar animado del
  login y meters del panel.
- **Cámara + Canvas nativos** (`getUserMedia` + `<canvas>`) — captura de
  frames y dibujo de bounding boxes; sin librerías externas de video.

## Rutas

| Ruta | Página | Notas |
|---|---|---|
| `/` | Landing | Hero, features, cómo funciona, métricas, CTA |
| `/acceso` | Login/registro | `?modo=registro` abre directo en modo registro |
| `/panel` | Dashboard (protegida) | Requiere sesión; redirige a `/acceso` si no hay JWT |

## Cómo correr

```bash
cd frontend
npm install
cp .env.example .env     # ajustar VITE_API_URL si el backend no corre en :8000
npm run dev
```

Necesita el backend (`../backend`) corriendo para que el login, el registro
y el panel de escaneo funcionen — ver `../backend/README.md`.

## Identidad visual

SELENE (diosa griega de la luna) inspira la idea central: luz cálida
(naranja→amarillo) irrumpiendo sobre un fondo casi negro, como un haz de luz
detectando presencia en la oscuridad. Esa metáfora se lleva a lo literal:

- Grilla técnica de fondo + halo que sigue el cursor (`SceneBackground`).
- Marcos con esquinas tipo "visor de cámara" (`HudFrame`) alrededor del
  mock del hero, la tarjeta de acceso y el panel de cámara real.
- Ticker de telemetría en vivo en la landing (`StatusTicker`).
- Panel de acceso con radar animado en vez de una imagen de stock
  (`RadarPanel`) y un formulario único que alterna login/registro con un
  toggle deslizante, no dos páginas separadas.
- El dashboard dibuja los bounding boxes reales devueltos por
  `/api/deteccion/frame` sobre un `<canvas>` superpuesto al video: naranja
  para personas, amarillo para ventanas/luminarias detectadas.
