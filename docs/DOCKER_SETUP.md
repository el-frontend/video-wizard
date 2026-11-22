# Instalación con Docker Compose

Ejecuta los comandos desde la raíz del monorepo con Docker Compose v2. En una instalación existente detén web y worker y respalda PostgreSQL y los volúmenes privados antes de aplicar las migraciones. Consulta la [guía de migración](./authentication.md).

1. Copia el ejemplo con permisos privados. En el archivo configura la contraseña de PostgreSQL y su URL. Genera por separado `BETTER_AUTH_SECRET` y `STUDIO_RENDER_SECRET` con `openssl rand -base64 48` y guárdalos en los campos correspondientes. Conserva el mismo nombre de host público en el origen web y el origen de editor.

   ```sh
   (umask 077 && cp .env.docker.example .env.docker)
   ```

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
