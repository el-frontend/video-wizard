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

   Edita el archivo en privado. En instalaciones existentes conserva las credenciales de PostgreSQL, `DATABASE_URL` y los secretos en uso. Compara los **nombres** con `.env.docker.example` y añade solo los campos que falten. Configura `BETTER_AUTH_URL`, `STUDIO_EDITOR_ORIGIN` y `STUDIO_PREVIEW_ORIGIN` con los orígenes que verá el navegador. Conserva el mismo nombre de host público en los tres. Comprueba las direcciones internas de Compose y el montaje de `STUDIO_DATA_DIR` contra el ejemplo.

   En instalaciones nuevas configura la contraseña de PostgreSQL tanto en su campo como en la URL, con codificación de URL cuando corresponda. Para cada secreto ausente, genera un valor independiente de al menos 32 bytes con un gestor de contraseñas. `BETTER_AUTH_SECRET` es exclusivo de la autenticación web. En `STUDIO_RENDER_SECRET` usa el secreto compartido actual de los servicios si ya está configurado en la instalación.

2. Construye las imágenes y arranca PostgreSQL. El servicio de migración comprueba los conteos y las colisiones de correo y después aplica las migraciones.

   ```sh
   docker compose --env-file .env.docker build
   docker compose --env-file .env.docker up -d --wait postgres
   docker compose --env-file .env.docker run --rm migrate
   ```

3. Crea explícitamente el usuario base y su catálogo. El contenedor de seed usa el volumen de recursos que comparte con web y guarda la credencial generada en el directorio privado del host.

   ```sh
   mkdir -p -m 700 .studio
   docker compose --env-file .env.docker run --rm --no-deps -v "$PWD/.studio:/app/.studio" web pnpm auth:seed
   docker compose --env-file .env.docker up -d
   ```

Abre <http://localhost:3000/signin>. El usuario inicial es `demo@video-wizard.local`; el archivo privado `.studio/bootstrap-user.json` contiene la contraseña si el seed la generó. Las cuentas existentes conservan su credencial. El procesador usa Whisper local con `USE_OPENAI_API=false` y necesita disponer del modelo base.

Next y el worker acceden a Python y al renderer mediante los nombres internos de Compose. El iframe del navegador carga `http://localhost:3001`. El contenedor del renderer tiene Chromium y FFmpeg y monta el almacén compartido de solo lectura. Los puertos publicados se enlazan a loopback. Para consultar el estado usa `docker compose --env-file .env.docker ps`. Para detener los servicios usa `docker compose --env-file .env.docker stop`.
