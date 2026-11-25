# Instalación con Docker Compose

Ejecuta los comandos desde la raíz del monorepo con Docker Compose v2. En una instalación existente detén web y worker y respalda PostgreSQL y los volúmenes privados antes de aplicar las migraciones. Consulta la [guía de migración](./authentication.md).

1. Prepara el archivo privado. Este bloque crea `.env.docker` a partir del ejemplo cuando falta. Si ya existe como archivo regular, conserva todo su contenido y ajusta sus permisos a 0600.

   ```sh
   (
     set -eu
     umask 077
     test ! -L .env.docker
     if [ ! -e .env.docker ]; then
       set -C
       cat .env.docker.example > .env.docker
     fi
     test -f .env.docker
     chmod 600 .env.docker
   )
   ```

   Edita el archivo en privado. En instalaciones existentes conserva las credenciales de PostgreSQL, `DATABASE_URL` y los secretos en uso. Compara los **nombres** con `.env.docker.example` y añade solo los campos que falten. Configura `BETTER_AUTH_URL`, `STUDIO_EDITOR_ORIGIN` y `STUDIO_PREVIEW_ORIGIN` con los orígenes que verá el navegador. El editor y Better Auth comparten el host canónico `app.video-wizard.localhost`. Usa `preview.video-wizard.localhost` para el renderer. En una actualización cambia también los orígenes antiguos de un solo host. Comprueba las direcciones internas de Compose y el montaje de `STUDIO_DATA_DIR` contra el ejemplo.

   En instalaciones nuevas configura la contraseña de PostgreSQL tanto en su campo como en la URL, con codificación de URL cuando corresponda. Para cada secreto ausente, genera un valor independiente de al menos 32 bytes con un gestor de contraseñas. `BETTER_AUTH_SECRET` es exclusivo de la autenticación web. En `STUDIO_RENDER_SECRET` usa el secreto compartido actual de los servicios si ya está configurado en la instalación.

Web y worker leen código y dependencias de la imagen. Después de cambiar código reconstruye las imágenes. Los antiguos volúmenes de dependencias quedan sin montar; PostgreSQL y los recursos conservan sus volúmenes.

2. Construye las imágenes y arranca PostgreSQL. El servicio de migración comprueba los conteos y las colisiones de correo y después aplica las migraciones.

   ```sh
   docker compose --env-file .env.docker build
   docker compose --env-file .env.docker up -d --wait postgres
   docker compose --env-file .env.docker run --rm migrate
   ```

3. Crea explícitamente el usuario base y su catálogo. El script ejecuta el seed con acceso al catálogo existente y entrega el archivo privado 0600 al UID/GID del operador. Ejecútalo con tu cuenta habitual desde la raíz del repositorio. Puedes repetirlo sin rotar la credencial.

   ```sh
   sh scripts/compose-seed.sh
   docker compose --env-file .env.docker up -d
   ```

Abre <http://localhost:3000/signin>. El usuario inicial es `demo@video-wizard.local`; el archivo privado `.studio/bootstrap-user.json` contiene la contraseña si el seed la generó. Las cuentas existentes conservan su credencial. El procesador usa Whisper local con `USE_OPENAI_API=false` y necesita disponer del modelo base.

Next y el worker acceden a Python y al renderer mediante los nombres internos de Compose. El iframe del navegador carga `http://preview.video-wizard.localhost:3001`. La entrada por localhost redirige al editor canónico. El contenedor del renderer tiene Chromium y FFmpeg y monta el almacén compartido de solo lectura. Los puertos publicados se enlazan a loopback. Para consultar el estado usa `docker compose --env-file .env.docker ps`. Para detener los servicios usa `docker compose --env-file .env.docker stop`.

## Verificación aislada

Desde la raíz, estas pruebas usan proyectos de Compose temporales y puertos internos. La prueba web crea una base terminada en `_test`, reabre el catálogo después de recrear web y worker con volúmenes de dependencias antiguos presentes, solicita la página de ingreso en ambas instalaciones y comprueba los permisos del operador en un volumen Linux. Conserva sus volúmenes de prueba con prefijo `studio-install-`. La prueba Python espera la salud efectiva declarada por la imagen.

```sh
docker build -f apps/web/Dockerfile -t video-wizard-web:local .
docker build -t video-wizard-processing:local apps/processing-engine
pnpm --filter web test --mode compose test/compose-install.test.mjs
pnpm --filter web test --mode compose-python test/compose-install.test.mjs
```
