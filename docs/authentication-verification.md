# Verificación de autenticación

Registro de aceptación de la migración descrita en [authentication.md](authentication.md). Las pruebas usan cuentas y recursos técnicos en bases dedicadas terminadas en `_test`. No requieren credenciales de proveedores de voz ni modifican videos del usuario.

## Instalación existente

La instalación del Mac se migró el 22 de noviembre de 2026 mediante `node scripts/local-studio.mjs migrate`. El controlador comprobó el destino de PostgreSQL, ejecutó el preflight y creó un respaldo CUSTOM privado verificable antes de aplicar `0008_better_auth`.

La comparación antes y después conservó los UUID de los usuarios existentes, sus hashes heredados y las relaciones de propiedad de trabajos, proyectos, revisiones, recursos y bibliotecas. El seed explícito creó el propietario normal `demo@video-wizard.local`. Una segunda ejecución conservó su identidad, contraseña y catálogo. La contraseña y el respaldo están en archivos locales ignorados, con permisos 0600; su contenido no se publica aquí.

La prueba de la instalación real ingresó con esa cuenta, abrió Proyectos y cerró sesión. Sus únicas escrituras fueron las del protocolo de autenticación. Las capturas a 800 y 1280 píxeles confirmaron que los controles de cuenta permanecen dentro de la barra lateral.

## Aceptación con recursos técnicos

El recorrido `pnpm test --filter=web -- --mode journey test/auth-journey.test.mjs` comprobó:

- Redirección de las 14 páginas privadas y rechazo anónimo en 35 métodos de API.
- Ingreso con una cuenta bcrypt migrada y acceso separado con un segundo propietario.
- Carga, transcripción local, lectura privada con HEAD/Range y rechazo de medios ajenos.
- Edición manual de captions, preview de ambos motores y exportación H.264/AAC después de caducar la sesión humana.
- Salida y cambio directo de cuenta entre pestañas, con retirada del espacio del propietario anterior.

El recorrido del 23 de noviembre añadió los hosts locales separados. Chromium resolvió ambos sin cambios de DNS del sistema. La entrada antigua conservó ruta y query al redirigir. Remotion e HyperFrames llegaron a `ready` y aceptaron búsqueda en el video. La inspección de los nombres de cookies en las solicitudes HTTP confirmó que el bootstrap no recibió cookies y que los recursos protegidos del renderer recibieron únicamente `studio_preview`.

Las pruebas específicas del cliente demoran la resolución del POST antes de sus encabezados 202. Comprueban que una operación del mismo dueño conserva el recibo aceptado y continúa mediante lecturas al reautenticar, mientras que salir o cambiar de dueño cancela su seguimiento. No se repite el POST.

## Límites y cierre

La primera suite general de cierre tuvo un timeout de 594,620 segundos en `receipt-ack`. Su repetición aislada pasó en 2,459 segundos, con dos reclamaciones de la tarea y un solo POST al renderer. macOS registró una suspensión de 595 segundos; las marcas conservadas no permiten probar el solapamiento exacto.

La repetición general del 23 de noviembre, manteniendo temporalmente el equipo despierto durante la ejecución, pasó con `pnpm test`: **10 de 10 paquetes, sin caché, en 23,357 segundos**. Tras instalar el enlace de workspace de UI que faltaba en el manifiesto, la suite volvió a pasar en **24,312 segundos**, con **217 pruebas web aprobadas y tres omitidas**; `receipt-ack` pasó en 2,093 segundos. Los recorridos de navegador y Compose son pruebas explícitas que se ejecutan además de la suite predeterminada. Las pruebas específicas de Python registraron 12 casos aprobados.

La revisión final identificó además problemas de empaquetado en Compose, propiedad del archivo de credenciales en Linux y healthcheck de Python. Una sola ronda de correcciones resolvió los cinco hallazgos importantes y la revisión independiente de `4c899db..1c34a74` quedó aprobada, sin regresiones nuevas. Permanece una limitación menor: los recibos Python caducados dejan de ser legibles por API, pero su eliminación física automática queda pendiente.

El ensayo de Compose crea un entorno sin instalación pnpm del host, migra PostgreSQL de prueba, repite el seed y arranca web y worker. Después recrea los servicios con cinco volúmenes antiguos presentes. Comprueba HTTP 200 en `/signin` en ambos arranques, resolución de dependencias de workspace, conservación de UUID/hash/catálogo y credencial 0600 legible por el operador. Otro volumen Linux comprueba lectura con UID/GID 11441:11441.

Ese ensayo pasó en 20,10 segundos con una imagen construida desde Node oficial y lockfile congelado, usando una caché de paquetes y `--offline`. La compilación en línea final también terminó; el controlador repitió el ensayo con su imagen `ba0f8be9ed62` y pasó en **20,648 segundos**. No se copiaron los `node_modules` del Mac a ninguna de esas imágenes.

El Compose autónomo de Python alcanzó `healthy` en 7,23 segundos. Su imagen de verificación conservó las bibliotecas de sistema/ML de una imagen local previa y recibió la aplicación, requirements y sonda actuales. Un intento adicional de construir toda esa imagen desde la base slim falló durante descargas apt; el pase de salud no se presenta como una reconstrucción completa desde cero.

Finalmente se recompiló Next en la instalación real, se actualizaron web, worker, renderer contenido y procesador local, y se repitió el ingreso a Proyectos y la salida con la cuenta base. Las capturas de ambos tamaños volvieron a pasar revisión visual. Python y renderer respondieron correctamente a sus sondas mínimas. El arranque conserva los archivos y la base migrada y usa los nuevos hosts separados.

Esta aceptación corresponde a autenticación. No sustituye la revisión R2 ni completa las tareas restantes del plan de video integral. Las [decisiones y sus costes](authentication-decisions.md) se conservan por separado.
