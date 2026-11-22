# Renderer de Video Wizard

Este servicio ejecuta Remotion y HyperFrames. Desde la raíz del monorepo se construye con el contexto completo para incluir las composiciones, el worker HyperFrames, FFmpeg y Chromium de Linux.

```sh
docker build -f apps/remotion-server/Dockerfile -t video-wizard-renderer:local .
```

El arranque con Compose monta Studio Data en modo lectura y publica 3001 en loopback. Remotion abre además un proxy efímero durante la codificación. El aislamiento de red del contenedor mantiene ese puerto fuera del host. Consulta los [pasos de instalación](../../docs/DOCKER_SETUP.md).

## Operaciones

- `GET /health` informa de disponibilidad.
- Next y el worker firman JWT de servicio para crear trabajos, leer su estado y leer el archivo exacto. Cada trabajo legacy recibe identificadores de propietario y trabajo, descriptores de recursos medidos y propiedades de composición. El renderer verifica los hashes de video y logo al prepararlos. Web registra el MP4 terminado en el almacén del propietario.
- Next construye un snapshot del proyecto para los renders y previews de Studio. El iframe intercambia un ticket por una cookie HttpOnly limitada a la instancia.
- Los trabajos legacy en curso dependen de asociaciones en memoria. Un reinicio puede requerir reconciliación desde el identificador durable de web.

El [contrato de autenticación](../../docs/authentication.md) describe los orígenes, ámbitos, tiempos de vida y acceso a medios.
