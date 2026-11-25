# Aceptación del adaptador HyperFrames

R2 quedó aprobado en `5c79bbc`, después de revisar su implementación original y tres rondas de correcciones. La autenticación tiene su [aceptación independiente](../authentication-verification.md). Este documento registra el motor; la recuperación/importación D6 y la generación/exportación durable R3–R6 conservan sus propios criterios de cierre.

## Contrato y capacidades

- El documento, dependencias y tiempos canónicos son los mismos del editor. Cada proyecto usa un motor. HyperFrames compila su propia composición e iframe; no ejecuta una composición Remotion.
- El pin es HyperFrames **0.8.173**, con GSAP **3.14.2**. La instancia de CLI de Studio desactiva telemetría y comprobaciones de actualización; no cambia la configuración global del usuario.
- Preview, check, capturas y exportación comparten HTML y recursos preparados. El manifiesto fija hashes de recursos, fuentes, código y derivados.
- Las tres familias verificadas son Liquid Glass, ElFrontend Web y Moderno Editorial. Una edición propia del catálogo conserva su versión: el aprovisionamiento busca una versión libre para la semilla y reutiliza el contenido idéntico al repetirse.
- Fuentes, pesos reales, recortes, ganancias y medios se verifican. Los GIF animados y videos con alfa sin una operación nativa acreditada producen un diagnóstico; no se convierten silenciosamente en imágenes inmóviles o video opaco. Los GIF fijos y el video opaco están cubiertos.

Los componentes nativos incluidos tienen fábricas y versiones verificadas. La generación y validación de módulos nuevos corresponde a R3 y no queda implícita en esta aceptación.

## Imagen y reproducción

Cada familia pasó check estricto y tiene captura y MP4 técnicos medidos. Las exportaciones de referencia tienen H.264 a 25 fps, 50 cuadros, 480 × 380 y AAC de 2 segundos. El fotograma a 1000 ms conserva el recorte verde seleccionado y el caption «Segundo». El error medio absoluto RGB entre captura y MP4 fue 1,24–1,89 sobre 255.

Chrome verificó el reloj efectivo a 25 y 30 fps, los saltos en ambos sentidos y el ACK del objetivo original de un cue. El corte de escena de 1017 ms a 30 fps dio verde, azul y amarillo en los cuadros anterior, de corte y posterior, tanto en iframe como en capturas y MP4. Un proyecto de un cuadro a 1 fps reprodujo el último intervalo audible y pudo comenzar de nuevo.

La reproducción privada conserva ticket de un uso, cookie de instancia, origen, ventana, nonce y versión de protocolo. Web y preview usan hosts hermanos según la [guía de autenticación](../authentication.md).

## Audio y sus relojes

El recorte de fuente, la variante procesada, el volumen y los offsets se aplican una sola vez. Una cola global no se trunca al terminar las escenas. Un video con audio no suena por duplicado al separar su imagen del reloj preciso del sonido.

Una capa audible puede ocupar un intervalo sin cuadro visual, por ejemplo 1001–1017 ms en la escena saliente. Para ese caso excepcional se prepara una única pista FLAC estéreo de 24 bits y 48 kHz, compartida por preview y render. Los demás proyectos conservan el streaming por capa. La operación no modifica el documento, referencias, narración ni captions; su coste es rematerializar el audio audible de ese proyecto.

La mezcla también conserva el silencio inicial propio de un stream. Un MP4 con video desde cero y un tono a 500–700 ms, recortado a partir de 100 ms, mantuvo el tono a 400–600 ms. Con la capa situada a 300 ms se midió a 700–900 ms en MP4 y Chrome. Se comprobaron cinco recortes antes, dentro y después del stream, además de seis tonos con ganancia incorporada y cola global a 2100 ms en un proyecto de 2200 ms. El error relativo al marcador quedó dentro de 3 ms. Los bytes FLAC servidos al iframe y los del render, así como las preparaciones en dos directorios, dieron el mismo SHA-256.

## Cancelación y entorno

La promoción y entrega comprueban cancelación antes de resolver el trabajo. Cancelar desde el callback final retira el MP4 y no puede convertir una operación cancelada en completada.

Las pruebas de procesos usan una barrera posterior a las comprobaciones de versión: un frame realmente capturado y datos de video escritos por FFmpeg. En macOS observaron 255385 bytes de captura y 262192 de codificación. La comprobación Linux del mismo código observó 253720 y 262192 bytes, y pasó en 33,731 segundos. Verificó el motivo exacto del aborto, la desaparición de PID/grupos y la ausencia de MP4 y directorio temporal.

El contenedor Linux de prueba usó init, red desactivada, 2 GiB de memoria compartida y espacio temporal de 4 GiB. Init también está declarado en Compose y en el lanzador local para recoger procesos huérfanos. La imagen de prueba partió de la base oficial ya verificada, copió el código actual y enlazó las dependencias con lockfile congelado sin descargas; no leyó datos del usuario. La instancia de uso diario se actualiza en el despliegue coordinado, no durante cada prueba.

## Comprobaciones reproducibles

`pnpm run test:hyperframes` ejecuta primero el productor de fixtures nativos y después el consumidor de Chrome. Su orden es obligatorio. Los casos focalizados están en `apps/hyperframes-worker/src/{native-acceptance,native-cancellation,interframe-audio}.test.ts` y `apps/remotion-server/server/native-preview-acceptance.test.mjs`.

Después del último cambio, la regresión general `pnpm test` aprobó **10 de 10 paquetes**, sin caché, en **24,418 segundos**; web registró **217 pruebas aprobadas y tres omitidas**. Los recorridos nativos son verificaciones explícitas adicionales, y las comprobaciones de tipos y los hooks de los commits también pasaron. Las capturas, PCM, videos y registros técnicos se conservan localmente fuera de Git.
