# Remotion Render Server

Express.js server for rendering Remotion video compositions with a job queue system.

## Features

- 📹 Render videos with customizable templates
- 📝 Dynamic subtitle generation
- 🎨 Multiple caption templates (default, viral, minimal, modern)
- 🔄 Job queue with progress tracking
- ❌ Cancel running render jobs
- 🐳 Docker support

## API Endpoints

### Create Render Job

```bash
POST /renders
Content-Type: application/json

{
  "compositionId": "VideoWithSubtitles",
  "inputProps": {
    "videoUrl": "https://example.com/video.mp4",
    "subtitles": [
      {
        "id": 1,
        "start": 0,
        "end": 2,
        "text": "Hello World"
      }
    ],
    "template": "viral",
    "backgroundColor": "#000000"
  }
}
```

### Get Render Status

```bash
GET /renders/:jobId
```

### Cancel Render Job

```bash
DELETE /renders/:jobId
```

## Getting Started

### Development

```bash
# Install dependencies
pnpm install

# Start the server in watch mode
pnpm dev
```

### Production

```bash
# Build the server
pnpm build

# Start the server
pnpm start
```

### Run Remotion Studio

```bash
pnpm remotion:studio
```

## Docker Support

```bash
# Build the Docker image
docker build -t remotion-render-server .

# Run the container
docker run -d -p 3001:3001 remotion-render-server
```

## Environment Variables

See `.env.example` for available configuration options.

## Project Structure

```
apps/remotion-server/
├── server/
│   ├── index.ts          # Express server setup
│   └── render-queue.ts   # Job queue management
├── renders/              # Output directory for rendered videos
├── package.json
├── tsconfig.json
└── README.md
```

## Compositions

Remotion compositions are stored in `packages/remotion-compositions` and include:

- VideoWithSubtitles: Main composition with video + subtitle templates
- Multiple caption templates: default, viral, minimal, modern

## License

See LICENSE in the root of the monorepo.

## Ejecución local con medios privados

Desde este directorio, `pnpm start` construye y arranca el renderer en Docker. Compose publica únicamente el puerto 3001 en loopback. Configura en el entorno (o en el archivo local `.env`) `STUDIO_RENDER_SECRET`, `STUDIO_EDITOR_ORIGIN` y `STUDIO_PREVIEW_ORIGIN`. El primero es el secreto privado compartido con web y Python, de al menos 32 bytes y distinto de `BETTER_AUTH_SECRET`. El directorio indicado por `STUDIO_DATA_DIR` debe ser el mismo que usa web. Compose lo monta como solo lectura.

Remotion 4.0.405 abre un proxy temporal en una interfaz comodín durante las exportaciones. El contenedor mantiene esos puertos sin publicar. Un arranque nativo directo expone ese proxy según la configuración de red del equipo. Las admisiones y descargas privadas del renderer requieren JWT de servicio. El iframe mantiene su protocolo de ticket y cookie de instancia.
