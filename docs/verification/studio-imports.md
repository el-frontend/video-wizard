# Importar y recuperar proyectos del estudio

La sección **Proyectos** muestra las fuentes de Motion Studio registradas para la cuenta. En el editor de un trabajo antiguo, **Abrir este trabajo en el diseñador** importa sus medios acreditados. Ambas acciones capturan la fuente al pulsarlas. Volver a importar el mismo contenido abre la revisión actual, incluidas las ediciones manuales. Si cambian los archivos se crea otro proyecto. Los anteriores siguen disponibles en Proyectos.

## Registrar una fuente local

El operador necesita el UUID del propietario, un identificador público, la raíz física de Motion Studio, el slug y los fps del original. Ejemplo con valores de prueba:

```sh
pnpm --filter web studio:register-source \
  --config /ruta/privada/video-wizard/fuentes.json \
  --owner 00000000-0000-4000-8000-000000000001 \
  --source-id episodio-local --root /ruta/fisica/motion-frontend \
  --slug studio-demo-noticias --fps 30
```

Configura `STUDIO_IMPORT_SOURCES` en el servidor web con la ruta absoluta del registro. El comando usa Python 3 y reemplaza el registro de forma atómica bajo bloqueo, con permisos 0600. La raíz debe ser física, sin enlaces simbólicos. En un contenedor, monta la fuente y el registro para lectura con rutas que coincidan con las registradas dentro del contenedor. El almacenamiento de recursos administrados se configura con `STUDIO_DATA_DIR`.

El navegador envía solo `{kind, sourceId}` a `POST /api/studio/imports`. El proceso de captura verifica los archivos desde descriptores de directorio, registra ausencias, comprueba dos lecturas completas y reintenta hasta tres pares de lecturas. Para una revisión publicada con todos sus archivos disponibles, ambas lecturas deben reproducir su hash a partir del episodio, título, estilo y subtítulos. Si falta el archivo de subtítulos, el estudio conserva las escenas estables, señala el recurso pendiente e indica que la verificación de la revisión quedó incompleta. La importación rechaza capturas inestables, hojas no regulares, enlaces simbólicos y tipos de medios inesperados. Los límites por captura son 16 MiB por modelo y 2 GiB en total. Los archivos adquiridos pasan por la medición y deduplicación de recursos por propietario.

## Qué queda editable

- Los episodios de Motion Studio conservan su motor HyperFrames, duraciones de escena, titulares multilínea, narración, campos editoriales conocidos, subtítulos y recursos de voz. Los cues globales se intersectan con cada escena. La serie y la fecha se conservan en los metadatos editoriales de la importación. El estilo se fija a una edición comprobada del catálogo después de verificar las fuentes tipográficas, también cuando el estilo proviene de `frame.md`. Las fases, diagramas y el tratamiento tipográfico del original necesitan revisión visual en el diseñador.
- Una maestra vigente suena como única pista global. Los subtítulos importados se vinculan a ella. Las tomas individuales comprobadas permanecen como recursos y conservan su asociación con cada escena y el texto de la toma cuando la fuente lo acredita. Al reponer una maestra ausente, el estudio conserva el final de la secuencia y la música manual. Si se editaron las tomas, la narración o los tiempos de las escenas, la maestra queda disponible como recurso y siguen sonando las tomas. Con tomas por escena, los cues conservan su reloj editorial. El archivo de captions de Motion Studio carece de identificación individual de toma y de un contrato de reloj por palabra.
- Los trabajos legacy acreditados usan Remotion. El importador comprueba el origen y los recibos antes de abrir archivos, y conserva la relación original/variante de un recorte. Si faltan los bytes de un video acreditado, se conservan el fragmento y los subtítulos. En **Recursos**, vuelve a subir el mismo archivo. En el proyecto importado, **Comprobar archivo repuesto** verifica el contenido y guarda la reparación sobre la revisión actual. Un trabajo antiguo con rutas sin acreditar muestra la acción para volver a importar el video.
- Si existe un MP4 sin modelo de escenas, el diseñador muestra **Archivo original · Solo lectura**. Una referencia de recurso ausente permanece visible al reabrir. Se puede sustituir una toma por audio medido del propietario, seleccionar un estilo compatible u omitir expresamente ese recurso. Al sustituir una toma, el texto acreditado de la grabación original se conserva en su registro de origen. El texto hablado del archivo sustituto queda sin acreditar. Cada reparación crea otra revisión. La exportación permanece bloqueada mientras falte un recurso requerido.

## Borradores e historial

El navegador identifica cada versión de los cambios pendientes por propietario, proyecto, revisión base, escritor de la pestaña y sello de edición. Un borrador ofrecido tras recargar sigue disponible mientras se trabaja desde la revisión del servidor. En navegadores con Web Locks, una pestaña duplicada adquiere su propio identificador. Tras una recarga, una salida o una sesión caducada, iniciar sesión con la misma cuenta permite elegir **Recuperar borrador**. Una cuota agotada o un almacenamiento inaccesible se indica en pantalla. En ese caso conviene mantener la pestaña abierta hasta guardar en el servidor.

Ante un conflicto, el panel compara los títulos y cuenta diferencias en escenas, capas y subtítulos. **Guardar borrador como copia** asigna un UUID nuevo y deja intacta la revisión remota. **Descartar mi borrador y recargar** consulta el estado vigente. El historial muestra revisiones por páginas y restaura mediante una nueva revisión con control de concurrencia. Los borradores locales pueden contener texto editorial y nombres de recursos. Son accesibles desde las herramientas del navegador del perfil local.

## Verificación reproducible

`pnpm test:e2e` prepara un build, puertos, renderer y esquema temporal en una base cuyo nombre termina en `_test`. Usa una imagen local mediante `STUDIO_TEST_RENDER_IMAGE` y Chrome mediante `STUDIO_TEST_CHROME`. El directorio mostrado por el runner contiene las capturas. Para incluir la demo de seis escenas del operador, define `STUDIO_DEMO_ROOT` en el proceso de prueba. La prueba dedicada de importación y comparación de hashes se ejecuta con `pnpm --filter web test --mode import-demo server/services/studio/motion-demo.acceptance.test.ts`. La prueba de captura mientras cambia el origen se ejecuta con `python3 -B apps/web/scripts/test-capture-motion.py`.

La cobertura de D6 demuestra importación, preview, edición, historial y recuperación. La activación explícita de tomas individuales a partir de una maestra pertenece al flujo posterior de edición de voz.
