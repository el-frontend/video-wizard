# Video Wizard integral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar en Video Wizard un estudio local de shorts, diseño, bibliotecas y generación con Codex/Claude, eligiendo un motor por proyecto.

**Architecture:** Un documento versionado y una API de escritura compartida unen editor, bibliotecas y asistentes. PostgreSQL conserva revisiones y trabajos; un companion en el Mac accede a las sesiones locales, y adaptadores separados realizan preview y exportación con Remotion o HyperFrames.

**Tech Stack:** Next.js 16.1.1, React 19, TypeScript estricto, Zod, Drizzle/PostgreSQL, pnpm 10.15.0/Turborepo, Python/FastAPI/Whisper/FFmpeg, Remotion y HyperFrames. Vitest, Testing Library y Playwright se incorporan donde las tareas necesitan verificar comportamiento.

**Spec:** [Diseño aprobado](../specs/2026-11-18-video-wizard-integral-design.md).

## Global Constraints

- «un único motor activo por proyecto/generación, sin mezclar motores en la misma composición».
- «Estilos en una sección propia, configurables y seleccionables» y «Marcas configuradas por separado y seleccionables».
- «Conservar el funcionamiento como complemento del chat y las conexiones existentes, sin exigir otra clave de ElevenLabs para ese modo».
- «El uso inicial es local en el Mac»; no construir emparejamiento público ni publicación social.
- «Las escrituras del asistente pasan por la misma API del editor con revisión base».
- «Los proyectos fijan versiones de packs/componentes y una instantánea de marca».
- «milisegundos enteros explícitos en el documento; conversión a frames de Remotion o segundos de HyperFrames únicamente en adaptadores».
- «reemplazar voz no cambia automáticamente las duraciones de escenas ni desplaza ediciones manuales».
- «Cada render recibe una revisión inmutable» y «el render permanece determinista».
- «la interfaz nueva se redacta en español»; código/comentarios en inglés según `AGENTS.md` de Video Wizard.

## Review Focus

1. Dos pestañas o un asistente guardando sobre otra revisión: devolver conflicto y conservar ambos trabajos. Prueba propietaria F3.
2. Video sin captions al final, palabras y límites entre escenas: conservar duración y rangos correctos. F2, D3 y D5.
3. Recursos movidos o fuentes ausentes al reabrir: explicar qué falta, conservar el documento y no exportar un sustituto silencioso. F4, R1 y R2.
4. Entrega incierta al asistente y reinicio durante generación: no reenviar ni consumir cuota automáticamente. F6, R3 y R4.
5. Worker cancelado o resultado atrasado: no publicar artefactos de otra revisión como actuales. R5 y R6.

## Lugar de ejecución y preparación

Los planes se redactan en Motion Studio para revisión. **Todos los paths de implementación de F/D/R son relativos a un checkout de `el-frontend/video-wizard`, no a este repositorio.** No añadir una segunda aplicación Next dentro de Motion Studio. Copiar el diseño y estos cuatro documentos a los mismos paths de Video Wizard al iniciar la ejecución.

La referencia inspeccionada es `main` en `cab50b873ca60f18e3a72106855822d31d0c3558`, comprobada otra vez al preparar el plan. Todavía no se ha instalado ni ejecutado Video Wizard. Antes de F1: localizar un checkout existente; si no existe, clonarlo en una ubicación autorizada. Leer su `AGENTS.md`, comprobar rama/estado y cambios posteriores. Usar una rama de trabajo que respete sus instrucciones y no sobrescribir cambios del usuario. La creación de worktree se decide en ejecución según permisos y estado real; no usar una raíz fuera del sandbox sin aprobación requerida por el entorno.

Durante F1 instalar las dependencias existentes con `pnpm install --frozen-lockfile`; las nuevas dependencias se añaden en su tarea, respetando permisos de red. Crear `docs/verification/studio-baseline.md` con commit de partida, versiones, comandos y fallos preexistentes. Registrar disponibilidad de PostgreSQL, FFmpeg/ffprobe, Chrome, Codex y Claude sin secretos. Las pruebas DB usan `STUDIO_TEST_DATABASE_URL` aislada: si falta, fallan con instrucción de configuración; no pasan mediante skip silencioso. Los nuevos comandos aún no existen.

## Tres planes, en orden

| Plan | Tareas | Entrega comprobable | Depende de |
|---|---|---|---|
| [01 · Base compartida](2026-11-18-video-wizard-01-base.md) | F1–F6 | Crear/guardar/reabrir proyectos, persistir bibliotecas/recursos y comprobar transportes locales | Checkout y servicios locales |
| [02 · Editor y recorridos](2026-11-18-video-wizard-02-editor.md) | D1–D6 | Diseñar, guardar y continuar shorts o plantillas con bibliotecas independientes | Contratos/API F2–F5 |
| [03 · Motores y generación](2026-11-18-video-wizard-03-generacion.md) | R1–R6 | Generar componentes y exportar con cada motor, con evidencias reales | F6 y editor D1–D6 |

La separación permite revisar y probar cada bloque sin reducir el alcance aprobado. F6 es temprana porque una limitación de Claude debe conocerse antes de prometer su integración. R1 puede adelantarse después de F5 para dar preview real a D1; la finalización de D1 exige ese preview. R2 añade el preview HyperFrames antes de cerrar D6. Las tareas de interfaz pueden desarrollar primero contra el contrato, pero no declararse listas con datos simulados.

## Contratos y nombres compartidos

F2 define en `@workspace/video-project` los tipos y esquemas públicos. El resto los importa; no mantiene copias en cada app.

- `EngineId = 'remotion' | 'hyperframes'`; `AssistantProvider = 'codex' | 'claude'`.
- `ProjectDraft`: `schemaVersion: 1`, `id`, `title`, `engine`, `canvas: {width,height,fps}`, `durationMs`, `scenes: Scene[]`, `globalAudio: AudioLayer[]`, `assetIds: string[]`, `styleRef: LibraryRef | null`, `brandSnapshot: BrandSnapshot | null`. `Scene` tiene `id`, `durationMs`, `layers: Layer[]`; el inicio se deriva del orden y duraciones. Las referencias a plantilla y contenido editorial son opcionales y estructuradas.
- `Layer`: unión discriminada `video | image | text | component | captions | audio`, con `id`, `startMs`, `endMs`, `endAnchor: 'fixed' | 'scene-end'`, `visible`, `zIndex`. Capas visuales añaden `box: {x,y,width,height}` en píxeles del canvas. Video/audio añaden `assetId`, `sourceInMs`, `volume`; video añade `fit: 'cover' | 'contain'` y punto de encuadre. Componentes añaden `componentRef: LibraryRef` y `props` JSON validado por su manifiesto. Audio de escena es local; `globalAudio` es absoluto y no admite `scene-end`.
- `CaptionCue`: `id,startMs,endMs,text,words?`; cue local a la capa, palabra local al cue. Capas de captions declaran `sourceAudioLayerId?` y `templateRef?`. El importador adapta Whisper y el audio nuevo sin perder palabras. Intervalos semiabiertos `[start,end)`; sin captions activos en el instante final.
- `ProjectRecord = {ownerId,revision,document: ProjectDraft,updatedAt}`. `revision` opaca emitida por servidor; `ownerId` proviene de autenticación. El cliente no puede cambiarlo. La duración declarada debe coincidir con el final máximo de la secuencia y pistas globales; capas que desbordan se conservan como problema editable, pero bloquean exportación.
- `LibraryRef = {id,version}`. `LibraryEntry` es unión `component | template | style | brand`, con `id,version,name,assetIds`; componentes/plantillas tienen motor y manifiesto versionado. `BrandSnapshot` contiene referencia y valores resueltos. `AssetRecord` contiene ID, propietario, hash, nombre, mediaType, dimensiones/duración medidos cuando proceden y locator interno; no rutas arbitrarias del navegador.
- `EditorSelection = {sceneId: string|null,layerId: string|null,captionId: string|null,timeMs:number}`.
- `CompanionRequest`: `id,projectId,baseRevision,provider,bindingId,engine,selection,kind,message,status,idempotencyKey`; `kind = feedback | voice | component | storyboard`. Estados `created | sending | sent | waiting | running | completed | failed | delivery-unknown | cancelled`. Una entrega no demuestra ejecución.
- `Diagnostic = {severity:'error'|'warning',code,message,sceneId?,layerId?}` y `JsonValue` (valor JSON sin funciones) se definen en F2. `EngineAdapter`: `validate(snapshot): Promise<Diagnostic[]>`, `prepare(snapshot,workspace): Promise<PreparedComposition>`, `snapshots(prepared,timesMs,signal): Promise<Artifact[]>`, `render(prepared,{signal,onProgress}): Promise<RenderResult>`. `snapshot` es `ExportSnapshot` con proyecto/revisión y manifiesto de dependencias/recursos fijados. `PreparedComposition = {engine,workspace,entry,manifestHash}`; `Artifact = {kind,relativePath,sha256}`; `RenderResult = {artifacts,durationMs,width,height,hasAudio}`. R1 define los tipos de motor en `@workspace/render-contract` y reexporta Diagnostic desde video-project, sin dependencia circular.
- `PreviewHandle`: `play():void`, `pause():void`, `seek(timeMs:number):void`, `getTimeMs():number`, `subscribe(listener:(timeMs:number)=>void):()=>void`. Ambos previews reciben el mismo documento y dependencias resueltas; nunca invocan render de un motor diferente.

Los campos adicionales que exija la validación se incorporan primero al esquema y sus fixtures. No introducir conversión de motores, tiempo implícito ni una segunda fuente de verdad para resolver un problema local.

## API común que los planes implementan

Autenticación de Video Wizard para navegador; companion enlazado mediante token local restringido a propietario/proyecto, fuera del bundle y URLs. Las rutas solo validan HTTP y delegan a servicios.

| Método/ruta | Entrada | Resultado |
|---|---|---|
| GET/POST `/api/studio/projects` | POST `{title,engine,canvas}` | Lista / `ProjectRecord` nuevo |
| GET/PUT `/api/studio/projects/:id` | PUT `{baseRevision,document}` | `ProjectRecord`; 409 con actual si diverge |
| GET `/api/studio/projects/:id/revisions` | — | Historial paginado |
| POST `/api/studio/projects/:id/restore` | `{baseRevision,targetRevision}` | Nueva revisión, no reescritura del historial |
| POST `/api/studio/projects/:id/duplicate` | `{baseRevision,engine?}` | Copia; incompatibilidades explícitas si cambia motor |
| GET/POST `/api/studio/libraries/:kind` | Entry/consulta | Versiones y compatibilidad |
| GET `/api/studio/libraries/:kind/:id/:version` | — | Entrada inmutable |
| POST `/api/studio/assets` | Multipart archivo | `AssetRecord` medido |
| GET `/api/studio/assets/:id` | Range admitido | Archivo autorizado |
| POST `/api/studio/imports` | `{kind:'motion-studio'|'legacy-job',sourceId}` | Proyecto nuevo y diagnóstico |
| POST `/api/studio/shorts` | `{assetId,ranges,engine,canvas}` | Proyectos de clips con rangos originales |
| POST `/api/studio/projects/:id/audio` | Multipart `{baseRevision,sceneId,audioLayerId,file,captions?}` | Nueva revisión atómica |
| GET `/api/studio/companion` | — | Capacidades reales/vínculos sin secretos |
| POST `/api/studio/projects/:id/requests` | Solicitud con revisión, selección y clave idempotente | Recibo persistido |
| GET `/api/studio/projects/:id/requests` | — | Recibos y resultados |
| POST `/api/studio/projects/:id/requests/:requestId/status` | `{status,note,resultRevision?}` | Transición validada |
| POST `/api/studio/projects/:id/proposals` | `{baseRevision,requestId,proposal}` | Propuesta validada, todavía sin aplicar |
| POST `/api/studio/projects/:id/proposals/:proposalId/apply` | `{baseRevision}` | Nueva revisión o 409 |
| POST `/api/studio/projects/:id/exports` | `{baseRevision,idempotencyKey}` | Trabajo sobre snapshot inmutable |
| POST `/api/studio/exports/:id/cancel` | — | Cancelación persistida |

D4 añade instanciación de plantilla al servicio de proyecto; R3 añade consulta de propuesta y sus diagnósticos al mismo namespace. Para aplicar cambios ordinarios desde el chat sigue disponible PUT con revisión base; el paso de propuesta es obligatorio para código nuevo y storyboards, no para cambiar un titular solicitado.

## Cierre y pruebas

Cada tarea termina con pruebas propias y un commit acotado en Video Wizard. No confundir un script que hace `echo 'No tests yet'` con una prueba. Efectos de pago y envío real a sesiones solo se ejecutan cuando la tarea los requiere; los tests automáticos usan dobles de transporte y nunca ElevenLabs real.

R6 conserva evidencias en `docs/verification/studio-integral.md` y artefactos locales ignorados en `artifacts/studio-qa/`. La aceptación exige dos MP4, uno por motor, y recorridos reales de ambos asistentes. Una integración bloqueada se documenta como bloqueada; no se sustituye por una respuesta ficticia ni se declara el estudio completo.

## Cobertura de la especificación

| Diseño | Tareas |
|---|---|
| Secciones 1–3: producto/bibliotecas | F2, F5, D1, D4 |
| 4: un motor y adaptación explícita | F2, D4, R1, R2 |
| 5: cuatro recorridos | D5, D4, R4, R3 |
| 6: diseñador | D1–D3, D6 |
| 7: asistentes | F6, R3, R4 |
| 8: voz y recursos | F4, D3, D5, R4 |
| 9: persistencia/contratos/migración | F1–F5, D6 |
| 10: jobs/render/QA | R1, R2, R5, R6 |
| 11: integración/conservación | F1, F2, D1, D5, R6 |
| Aceptación 1–10 | D5; D4; D4; R1–R2; R3–R4; R4; D3; R6; R5; F5 |

## Handoff

Revisión propia completada: cobertura de las secciones 1–13 y aceptación 1–10, dependencias entre bloques, nombres/unidades de contratos y casos del Review Focus. Comprobación documental ejecutada: enlaces locales válidos y 18 tareas, cada una con archivos, interfaces y cinco pasos verificables. Los comandos de producto son instrucciones para la ejecución futura; no se han ejecutado ni se afirman aprobados los tests del nuevo estudio.

Diseño y plan aprobados; Carlos eligió ejecución con subagentes por tarea y revisiones el 18 de noviembre de 2026. Se trabaja en un checkout independiente de Video Wizard dentro de `integrations/video-wizard`, ignorado por el repositorio Motion Studio. El repositorio remoto no se modifica sin una instrucción de publicación.
