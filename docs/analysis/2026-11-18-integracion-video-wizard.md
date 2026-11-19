# Integración de Motion Studio con Video Wizard

Fecha: 18 de noviembre de 2026. Análisis de `el-frontend/video-wizard`, rama `main`, commit `cab50b873ca60f18e3a72106855822d31d0c3558`, contrastado con este repositorio. Revisión estática: no se instaló ni ejecutó el stack de Video Wizard y no se modificó el repositorio remoto.

Actualización de alcance: Carlos definió después un estudio integral con shorts, diseñador, componentes, plantillas, estilos y marcas independientes, selección explícita del motor y soporte de Codex/Claude. Véase `../product/2026-11-18-video-wizard-estudio-integral.md`; esas decisiones prevalecen sobre las recomendaciones iniciales de este análisis.

## Recomendación

Usar **Video Wizard como producto principal**, incorporar la experiencia de edición de Motion Studio y separar el documento del proyecto de su motor de render.

Recomiendo empezar con **dos adaptadores de render y un único modelo de proyecto**. Esto permite reutilizar las composiciones HyperFrames existentes sin rehacerlas para el primer hito. En paralelo, una prueba acotada de **Remotion + GSAP** determinará si conviene converger después hacia un solo motor. Mantener dos motores de forma permanente solo se justifica si cada uno aporta ventajas comprobadas.

El híbrido puede existir a tres niveles distintos: interfaz y servicios compartidos; dos motores que consumen un mismo documento; o una composición mixta con escenas prerenderizadas. Empezaría por los dos primeros. Mezclar motores dentro de una misma línea de tiempo añade caché, composición de audio y validación de duraciones que no hacen falta para importar el boletín inicial.

## Qué existe y qué falta

| Área | Video Wizard | Motion Studio | Integración propuesta |
|---|---|---|---|
| Producto y navegación | Next.js 16, UI compartida y rutas de subtítulos, clips, análisis y trabajos | Editor especializado de boletines | Video Wizard conserva la aplicación principal; añadir un flujo de guion/noticias |
| Identidad | Auth.js con credenciales y usuarios en PostgreSQL | Uso local en el Mac | Reutilizar la identidad de Video Wizard para proyectos y permisos |
| Procesamiento | FastAPI, Whisper, FFmpeg y recorte inteligente | Voz por escena y timings medidos | Compartir la biblioteca de assets y los resultados de transcripción |
| Render | Servicio Remotion separado y composiciones compartidas | HTML + GSAP con HyperFrames | Adaptadores con contrato de entrada, progreso, cancelación y resultado común |
| Edición | Edición de subtítulos y plantillas; estado del flujo en React | Escenas, textos, captions, historial, conflictos y feedback contextual | Documento editable persistente y revisiones en la base de Video Wizard |
| Estilos | Nueve plantillas de captions y Brand Kit | Tres estilos completos de escena, fuentes y movimiento | Separar estilo de escena, plantilla de captions y marca |
| Trabajos | Cola PostgreSQL, retries y progreso por usuario | Procesos locales y recibos de solicitudes al chat | Reutilizar la cola durable; mantener distinta una solicitud al agente de un render ejecutable |

La composición compartida actual `VideoComposition` exige un `videoUrl` y coloca captions encima. Su contrato no representa todavía un boletín construido desde escenas. Añadir una composición `ScriptedVideo` y un documento de proyecto es más sólido que intentar representar todos los boletines como un video fuente ficticio.

La ampliación afecta también a las entradas de render: la ruta Next de subtítulos exige `videoPath`, el worker espera video más subtítulos y el servidor Remotion valida `inputProps.videoUrl`. Un nuevo flujo de escenas necesita contratos discriminados y validación por tipo de proyecto/composición en esos tres límites, además de registrar la nueva composición. El motor puede seleccionarse internamente según las capacidades del proyecto, sin añadir una decisión técnica obligatoria al usuario.

## Vías de integración

### A. Puente entre las aplicaciones existentes

Video Wizard añade una sección para abrir o consumir Motion Studio como servicio local. Los assets y el MP4 final pasan a Video Wizard.

- Esfuerzo inicial relativo: bajo.
- Reutilización inmediata: alta.
- Ventajas: valida pronto el uso combinado y conserva las composiciones actuales.
- Costes: dos aplicaciones, persistencia duplicada y coordinación de sesiones y revisiones.
- Uso recomendado: prototipo de integración o transición breve.

Un iframe puede alojar un editor en la interfaz; esto no convierte automáticamente su animación en una composición determinista de Remotion.

### B. Video Wizard con modelo común y dos motores

La interfaz, los proyectos, los assets, el historial y los trabajos pertenecen a Video Wizard. `RemotionRenderAdapter` y `HyperFramesRenderAdapter` consumen una revisión inmutable del mismo documento.

- Esfuerzo inicial relativo: medio.
- Reutilización: alta, incluida la salida HTML de este repositorio.
- Ventajas: incorporación gradual, un editor y compatibilidad con los flujos existentes.
- Costes: mantener contratos, previews, dependencias y controles de calidad para ambos motores.
- Uso recomendado: primera integración funcional.

Elegiría inicialmente un motor por proyecto o exportación. Si después se mezclan escenas, HyperFrames puede producir un asset intermedio y Remotion componerlo. Debe definirse quién añade captions y quién mezcla la voz para evitar duplicarlos.

### C. Remotion como motor y GSAP para movimiento

Portar el layout de las escenas a React y reutilizar los principios de movimiento con la integración oficial `@remotion/gsap` y `useGsapTimeline()`.

- Esfuerzo inicial relativo: medio/alto.
- Reutilización: alta en contenido, fuentes, tokens y dirección de movimiento; parcial en el HTML ejecutable.
- Ventajas: preview y exportación con el mismo motor y encaje natural en el monorepo.
- Costes: adaptar escenas, validar fidelidad y actualizar de forma coordinada las dependencias de Remotion.
- Uso recomendado: posible destino de simplificación tras una prueba de paridad.

La documentación marca `@remotion/gsap` desde **4.0.517**. El lockfile revisado de Video Wizard resuelve Remotion **4.0.405**. Esta vía requiere actualizar y alinear `remotion` y sus paquetes; no basta con añadir un import. GSAP debe quedar subordinado al frame de Remotion, con timeline pausada y búsqueda determinista. HyperFrames, sus hosts de subcomposiciones y sus atributos de render no se convierten automáticamente mediante ese paquete.

## Arquitectura propuesta

```text
Video o YouTube ── Whisper / recorte ─┐
                                    ├─ Documento del proyecto ─ Editor Video Wizard
Resumen de Dottie ─ guion / escenas ─┘          │                    │
                                              │                    └─ Companion local ↔ este chat
                                              │                                      ↔ ElevenLabs
                                     PostgreSQL: revisiones,
                                     assets, fuentes y solicitudes
                                              │
                                        Cola de trabajos
                                              │
                                      Adaptador de render
                                        /           \
                                    Remotion     HyperFrames
                                        \           /
                                         MP4 + QA + revisión
```

Paquetes sugeridos dentro del monorepo, como propuesta:

- `packages/video-project`: esquema validado, versión de formato, escenas, captions, fuentes, voz y referencias a assets.
- `packages/style-packs`: los tres estilos, fuentes locales, tokens y parámetros de movimiento. `frame.md` se conserva como especificación, acompañado de una representación estructurada consumible por ambos motores.
- `packages/render-contract`: interfaces, capacidades y resultados de los motores.
- `apps/web/features/studio`: edición visual de proyectos, reutilizando `packages/ui`.
- `apps/companion`: puente local con el chat de Codex y callbacks de solicitudes. Puede ser un proceso local, sin ejecutarse dentro del navegador.
- El servicio de render existente se amplía o se acompaña de un worker HyperFrames, fuera del proceso Next.js.

Entidades propuestas: proyectos, revisiones, assets, packs de estilo, fuentes editoriales y solicitudes al agente. Los jobs ya existentes referencian una revisión concreta y sus resultados. Un job no debe convertirse en el único documento editable del proyecto.

## Mejoras prioritarias antes de ampliar

1. **Unificar los tiempos.** El hook de generación y el servicio usan milisegundos; otros tipos, el editor de subtítulos y el Player esperan segundos. El servicio de render vuelve a dividir por 1000. Es una incompatibilidad real de contratos observada en el código; su efecto exacto requiere pruebas de los recorridos en ejecución. Definir una unidad interna explícita, adaptadores de frontera y pruebas de preview/exportación antes de sumar escenas o voces.
2. **Persistir proyectos y revisiones.** El esquema revisado contiene usuarios, autenticación y trabajos; no un documento editable de escenas. Guardar drafts, captions y estilos con revisión base y conflictos. Exportar siempre una revisión inmutable; un render antiguo no debe aparecer como actualización de un draft posterior.
3. **Una fuente de verdad para las composiciones.** Existen componentes y tipos tanto en `apps/web/remotion` como en `packages/remotion-compositions`. La preview principal ya importa el paquete compartido, pero otras rutas siguen referenciando módulos locales. Consolidar antes de añadir nuevos motores.
4. **Conservar los tiempos de palabras.** El tipo compartido admite `words`, pero las transformaciones revisadas de transcripción y preview los descartan. Las voces nuevas deben incorporar timestamps reales y mantener las reglas de pronunciación y la preferencia cubana/latina como perfil del usuario.
5. **Duración independiente de los captions.** Varios puntos calculan el video a partir del último subtítulo. Un cierre, silencio, música o una escena sin voz puede quedar fuera. El documento debe declarar la duración total y sus pistas; los captions describen palabras, no toda la duración del video.
6. **Separar proveedor de IA y motor de video.** Para este uso, el proveedor principal es el chat conectado. Una instalación autónoma puede tener un proveedor propio opcional, sin exigir al usuario local otra clave por defecto. El conector de ElevenLabs del chat no se hereda automáticamente por un backend de Next.js o un contenedor.
7. **Un solo escritor.** Chat y navegador deben modificar proyectos por la misma API autenticada y con revisión base. En un despliegue remoto, el companion necesita emparejamiento y permisos acotados; copiar las rutas locales y el ID de conversación a un servidor público no constituye una integración segura.
8. **Fortalecer trabajos y pruebas.** El worker tiene handlers reales de render, transcripción y clips; el handler de `analysis` sigue como stub, aunque existen rutas de análisis. El script de tests de `apps/web` actualmente solo informa que aún no hay pruebas. Priorizar contratos de tiempos, revisiones, cancelación, recuperación tras reinicios e idempotencia de generaciones pagadas.

También conviene retirar rutas de desarrollo con datos de ejemplo antes de convertirlas en el editor principal: `/editor/[id]` tiene fallback a mock data y `video-render-service.ts` devuelve que su render no está configurado. El camino operativo principal está en `subtitleGenerationService` y el servicio Remotion separado; la integración debe apoyarse en ese camino real.

## Primer hito recomendado

Importar el boletín existente de 55 segundos como un proyecto editable de Video Wizard, conservando los archivos de audio y captions. Debe permitir elegir los tres estilos, cambiar un titular y un caption, enviar feedback a esta conversación, recibir un cambio guardado y exportar una revisión identificable con historial.

Antes de decidir mantener dos motores, portar **una escena de 12,4 segundos** con Liquid Glass a Remotion + GSAP. Comparar fuentes, blur, tarjetas, movimiento, seek hacia delante/atrás, sincronía de voz y frames exportados. Medir render en el Mac y en Docker con la misma entrada y calidad. El coste de integración, la fidelidad y las mediciones decidirán si completar el port de las seis escenas o mantener HyperFrames para composiciones específicas.

Este hito no necesita publicar en redes, añadir estadísticas ni volver a generar la voz aprobada. Esos trabajos encajan después con las issues abiertas del proyecto, especialmente CLI/file watcher y rendimiento del renderer.

## Fuentes revisadas

- [Repositorio y README](https://github.com/el-frontend/video-wizard/tree/cab50b873ca60f18e3a72106855822d31d0c3558).
- [Cola persistente](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/server/services/queue-service.ts) y [handlers](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/server/worker/handlers.ts).
- [Esquema de trabajos](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/server/db/schema/jobs.ts).
- [Composición compartida](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/packages/remotion-compositions/src/compositions/VideoComposition.tsx).
- [Servicio de subtítulos y conversiones](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/server/services/subtitle-generation-service.ts), [hook](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/features/video/hooks/use-subtitle-generation.ts) y [preview](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/apps/web/features/video/components/remotion-preview.tsx).
- [Lockfile](https://github.com/el-frontend/video-wizard/blob/cab50b873ca60f18e3a72106855822d31d0c3558/pnpm-lock.yaml).
- [Remotion + GSAP: documentación oficial](https://www.remotion.dev/docs/gsap) y [useGsapTimeline](https://www.remotion.dev/docs/gsap/use-gsap-timeline).
- [Limitaciones del iframe animado en Remotion](https://www.remotion.dev/docs/iframe).
- [Issue13: CLI/file watcher](https://github.com/el-frontend/video-wizard/issues/13) y [issue7: rendimiento](https://github.com/el-frontend/video-wizard/issues/7).
