# Video Wizard · editor y recorridos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editar visualmente proyectos persistentes, usar bibliotecas independientes y continuar shorts, plantillas o proyectos importados en el mismo diseñador.

**Architecture:** Features pequeñas de proyectos, diseñador, bibliotecas y shorts; hooks coordinan la API y componentes presentan estado. Operaciones puras vienen de video-project; los previews usan el motor guardado en el documento.

**Tech Stack:** Next/React/TypeScript, `packages/ui`, contratos y servicios F, Testing Library/Vitest y Playwright para recorridos visibles.

**Spec:** [Diseño aprobado](../specs/2026-11-18-video-wizard-integral-design.md). Leer [contratos/orden](2026-11-18-video-wizard-integral.md) y [base](2026-11-18-video-wizard-01-base.md).

## Global Constraints

Conservar todas las restricciones del plan general. Marca, estilo, motor y asistente son selecciones distintas. Autosave solo envía documentos válidos; un conflicto no borra el draft. La narración no se deriva automáticamente del titular. El editor no requiere una clave API de ElevenLabs. R1 se adelanta para cerrar D1 con preview Remotion real y R2 antes de cerrar D6 con preview HyperFrames real.

## Review Focus

- Una respuesta de autosave llega después de otra edición local: D1 conserva cambios aún no enviados.
- Reordenar escenas mientras hay selección o undo: D2 conserva IDs, rangos fuente y coherencia de selección.
- Editar texto de captions con palabras ya alineadas: D3 no presenta una alineación antigua como medida del texto nuevo.
- Cambiar marca/estilo o duplicar a otro motor: D4 conserva overrides y señala incompatibilidades.
- Importación fallida o cierre/reapertura tras conflicto: D6 conserva el original, historial y draft recuperable.

## Mapa de archivos

En las listas de tareas, `features/`, `components/`, `app/` y `server/` sin prefijo están bajo `apps/web/`; tests vecinos abreviados comparten el directorio del archivo que verifican.

- `apps/web/features/studio-projects/{components,hooks}/`: biblioteca y creación de proyectos.
- `apps/web/features/studio-designer/{components,hooks,lib}/`: diseñador; archivos separados para secuencia, capas, captions, audio, inspector y preview.
- `apps/web/features/studio-libraries/{components,hooks}/`: CRUD de catálogos sin estados de proyecto duplicados.
- `apps/web/features/studio-shorts/{components,hooks}/`: fuente/transcripción/rangos y envío al diseñador.
- `apps/web/server/services/studio/{template-service,short-service,import-service,audio-service}.ts`: operaciones transaccionales propias.
- `apps/web/app/{projects,designer,components,templates,styles,brands,assets,shorts}/`: páginas delgadas; `components/layout/app-sidebar.tsx` incorpora navegación.
- `apps/web/e2e/studio-*.spec.ts` y `playwright.config.ts`: evidencia de interacción; evitar snapshots de DOM que solo reproduzcan implementación.

### Task 1: D1 · Proyectos y sesión de edición guardada

**Files:** Create `apps/web/app/projects/page.tsx`, `apps/web/app/designer/[id]/page.tsx`, `features/studio-projects/components/project-library.tsx`, `features/studio-projects/hooks/use-projects.ts`, `features/studio-designer/components/{designer,preview-panel}.tsx`, `features/studio-designer/hooks/use-project-session.ts`, `use-project-session.test.tsx`; Modify `components/layout/app-sidebar.tsx`, `apps/web/package.json`. Añadir `@testing-library/react` y entorno DOM compatible al runner existente, sin crear otro runner paralelo.

**Interfaces:** `useProjectSession(id):{saved:ProjectRecord|null,draft:ProjectDraft|null,selection:EditorSelection,status:'loading'|'saved'|'dirty'|'saving'|'conflict'|'error',dispatch(command:ProjectCommand):void,select(selection):void,save():Promise<void>,undo():void,redo():void,conflict:ProjectRecord|null}`. `PreviewPanel({document,resolvedDependencies,onTimeChange,onReady})` usa `PreviewHandle` de R1/R2. `ResolvedDependencies` será el mapa inmutable de recursos/entradas resuelto por R1.

- [ ] **1. Escribir tests:** abrir documento, editar título y guardar contra revisión leída; mientras save A está pendiente, editar B y recibir A no elimina B. 409 conserva draft B y muestra revisión remota; no reintenta overwrite. Cambiar selección no guarda una revisión ni envía mensaje. Crear proyecto exige elegir un motor y lo conserva al reabrir.
- [ ] **2. Rojo:** `pnpm --filter web test -- features/studio-designer/hooks/use-project-session.test.tsx`.
- [ ] **3. Implementar:** biblioteca/creación, estado de sesión y autosave con comandos serializados. Debounce 500 ms para cambios válidos y save explícito antes de enviar solicitudes/exportar; bloquear esas acciones si no queda revisión confirmada. Undo/redo afecta cambios propios, también se guarda como revisión nueva; una actualización externa nunca entra en la pila como acción local. Preview por motor; heavy player con carga diferida. El polling de revisión es transporte del editor, no parte de la composición determinista.
- [ ] **4. Verde:** test y `pnpm --filter web typecheck`; crear/reabrir proyecto y hacer seek real con R1. Si falta motor, mostrar indisponible y conservar draft, sin reproducir un video de ejemplo.
- [ ] **5. Commit:** `feat: add persistent project library and designer session`.

### Task 2: D2 · Escenas, capas e inspector

**Files:** Create `features/studio-designer/components/{scene-sequence,layer-list,layer-inspector,media-inspector}.tsx`, `features/studio-designer/lib/editor-commands.test.ts`, `components/layer-inspector.test.tsx`; Modify `designer.tsx`, operaciones `packages/video-project/src/commands.ts` y sus tests cuando se añada una acción. No meter lógica de persistencia en los componentes.

**Interfaces:** `SceneSequence({scenes,selectedId,onSelect,onCommand})`, `LayerInspector({layer,manifest,onCommand})`, `MediaInspector({layer,asset,onCommand})`; todos reciben `onCommand(command:ProjectCommand):void`. Actualizar propiedades solo mediante IDs y el esquema de props del manifiesto; `endAnchor` visible en duración de capa. El orden y posición no se infieren del índice del DOM.

- [ ] **1. Escribir tests:** reordenar dos escenas conserva IDs/rangos fuente y actualiza inicio derivado; selección permanece en la misma escena. Editar capa cambia x/y/tamaño/z/visible/in/out y es reversible; duración negativa se rechaza sin borrar draft. Video sourceIn 5000 más tramo 7000 nunca solicita más de la duración fuente. Cambiar encuadre no modifica rango ni audio.
- [ ] **2. Rojo:** `pnpm --filter web test -- features/studio-designer/lib/editor-commands.test.ts features/studio-designer/components/layer-inspector.test.tsx`.
- [ ] **3. Implementar:** añadir/quitar/reordenar escenas y capas, orden z, inspector numérico y controles de trim/cover/contain/punto de encuadre. Componente generado expone solo props declaradas. Modificar canvas/formatos recalcula preview sin escalar destructivamente los valores guardados; ofrecer encaje explícito para elementos fuera del área. Controles con teclado y foco accesible; arrastrar es opcional sobre comandos equivalentes.
- [ ] **4. Verde:** tests y recorrido visible: añadir título encima de clip, ocultarlo, moverlo, deshacer y rehacer; seek antes/dentro/después de su intervalo confirma visibilidad correcta en preview real.
- [ ] **5. Commit:** `feat: add scene layer and media editing controls`.

### Task 3: D3 · Captions, narración y audio sin desplazamientos implícitos

**Files:** Create `features/studio-designer/components/{caption-editor,audio-inspector,narration-editor}.tsx`, `features/studio-designer/lib/{caption-files,caption-editing}.ts`, `lib/{caption-files,caption-editing}.test.ts`, `apps/web/server/services/studio/audio-service.ts`, `audio-service.integration.test.ts`, ruta `app/api/studio/projects/[id]/audio/route.ts`; Modify `designer.tsx` y comandos puros asociados.

**Interfaces:** `parseCaptionFile(text:string,format:'srt'|'vtt'):CaptionCue[]`, `serializeCaptionFile(cues,format):string`; funciones editan tiempo local a capa. `AudioService.replace(ownerId,projectId,{baseRevision,sceneId,audioLayerId,assetId,captions?}):Promise<ProjectRecord>` mide mediante F4, guarda en una transacción y no cambia duración de escena. Captions de la entrada audio son locales a la toma; el servicio los traslada una vez al offset de la capa. `CaptionEdit` define add/split/merge/delete/update con IDs estables.

- [ ] **1. Escribir tests:** SRT/VTT con tildes, varias líneas y palabra vacía inválida; ida/vuelta mantiene ms. Dividir/unir conserva palabras que siguen alineadas; cambiar texto invalida palabras afectadas y muestra alineación pendiente, sin timestamps inventados. Voz 4800 ms dentro de escena 4200 produce aviso/export bloqueado; clips/overlays/música mantienen posiciones. Ampliar escena explícitamente aplica exactamente F2. Cambiar titular no invalida audio; cambiar narración sí.
- [ ] **2. Rojo:** `pnpm --filter web test -- features/studio-designer/lib/caption-files.test.ts features/studio-designer/lib/caption-editing.test.ts server/services/studio/audio-service.integration.test.ts`.
- [ ] **3. Implementar:** captions add/split/merge/delete y seek; import/export con errores recuperables. Audio escuchar/subir/reemplazar, volumen y offset; referencia a recurso inmutable, duración real, voz obsoleta pendiente. Ingestión del archivo no confirma revisión si hubo conflicto: el recurso puede quedar sin usar, el proyecto permanece intacto. Botón de solicitar voz usará R4, no una llamada directa desde el browser a ElevenLabs.
- [ ] **4. Verde:** tests y prueba con audio real existente sin generar otra toma: importar, mover offset y comprobar caption sincronizado en preview. Ampliar escena muestra cambios antes de guardarlos; no estira video, música ni capas de fin fijo.
- [ ] **5. Commit:** `feat: add caption and narration editing with measured audio replacement`.

### Task 4: D4 · Secciones de estilos/marcas y plantillas editables

**Files:** Create páginas `app/{components,templates,styles,brands,assets}/page.tsx`, `features/studio-libraries/components/{library-browser,style-editor,brand-editor,template-editor}.tsx`, `features/studio-libraries/components/appearance-picker.test.tsx`, `features/studio-libraries/hooks/use-library.ts`, `apps/web/server/services/studio/template-service.ts`, `template-service.test.ts`, `features/studio-designer/components/appearance-picker.tsx`, `app/api/studio/templates/[id]/instantiate/route.ts`, `app/api/studio/projects/[id]/template/route.ts`; Modify sidebar y diseñador.

**Interfaces:** `TemplateService.instantiate(ownerId,{templateRef,engine,brandRef?,styleRef?,content}):Promise<ProjectRecord>`, `fromProject(ownerId,id,{baseRevision,name}):Promise<LibraryEntry>`. La primera crea nuevos IDs de instancias y fija versiones; `content:Record<string,JsonValue>` se valida contra los slots declarados por el manifiesto. La segunda publica estructura del motor activo y recursos permitidos, sin recibos ni identidad de sesión. `AppearancePicker` emite comandos con referencia/instantánea, no solo clases CSS.

- [ ] **1. Escribir tests:** instanciar dos veces crea escenas/capas editables con IDs distintos y versiones iguales; editar instancia no cambia plantilla. Marca A + estilo B respeta precedencia y override; cambiar marca no cambia narración. Filtro excluye motor incompatible. Copia a otro motor preserva texto/assets y señala componentes por adaptar; export permanece bloqueado hasta resolverlos.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/template-service.test.ts features/studio-libraries/components/appearance-picker.test.tsx`.
- [ ] **3. Implementar:** listar/crear/versionar estilos, marcas, componentes y plantillas mediante F5; biblioteca de recursos mediante F4. Marca acepta logo, variantes, fuentes, colores y nota de tono. Exponer motor al crear/duplicar y mostrarlo en proyecto, sin conversión silenciosa. Guardar plantilla desde proyecto; editar slots/estructura crea versión nueva. Primeras plantillas: short con captions y boletín de escenas, implementaciones limitadas a los motores realmente disponibles.
- [ ] **4. Verde:** tests; crear desde plantilla, seleccionar marca/estilo separados, editar un caption, guardar/reabrir y comprobar independencia del original. Ver previews de los tres estilos con las implementaciones R1/R2, sin anunciar un motor que aún no se verificó.
- [ ] **5. Commit:** `feat: add independent libraries and editable template workflows`.

### Task 5: D5 · Shorts enlazados al diseñador

**Files:** Create `app/shorts/page.tsx`, `features/studio-shorts/components/{shorts-workspace,range-editor}.tsx`, `hooks/use-shorts.ts`, `apps/web/server/services/studio/short-service.ts`, `short-service.test.ts`, `app/api/studio/shorts/route.ts`; Modify `features/video/components/clip-card.tsx` y `containers/video-container.tsx` para añadir «Abrir en diseñador», `server/services/clip-integration-service.ts` solo en sus fronteras necesarias.

**Interfaces:** `ShortService.create(ownerId,{assetId,ranges:Array<{startMs,endMs,crop?}>,engine,canvas}):Promise<ProjectRecord[]>`; `crop` reutiliza encuadre básico o referencia a resultado smart-crop medido. `sliceCaptions(cues:CaptionCue[],range:{startMs,endMs}):CaptionCue[]` conserva intersecciones/palabras y convierte a tiempos locales. La capa de video guarda asset original/sourceIn y la duración del tramo. Un intermedio smart-crop añade metadata de origen, no elimina el enlace al original.

- [ ] **1. Escribir tests:** fuente de 24000 ms; rangos 5000–12000 y 17000–23000 producen proyectos de 7000 y 6000 ms, sourceIn exacto y captions locales. Cue que cruza inicio se recorta una vez; palabras fuera del rango no aparecen. Rango invertido/fuera del medio se rechaza sin crear proyectos parciales. Un clip sin voz conserva duración y puede diseñarse.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/short-service.test.ts`.
- [ ] **3. Implementar:** upload/URL por servicios actuales, ingestión F4 del resultado confiable, transcripción Whisper y selección/sugerencias del flujo existente. Sugerencias por asistente conectado se incorporan en R4; la selección manual funciona sin clave de un LLM. Recorte inteligente puede crear derivado interno por Python; no exige exportar/reimportar manualmente. Crear varios proyectos en operación coherente, cada uno con motor explícito y plantilla compatible si se selecciona.
- [ ] **4. Verde:** tests y recorrido real de archivo→transcripción→dos rangos→abrir diseñador; comprobar referencia fuente, captions y trim. Probar URL admitida si red/descarga está disponible; un fallo de descarga informa el error y no crea un proyecto vacío presentado como listo.
- [ ] **5. Commit:** `feat: connect shorts extraction to editable studio projects`.

### Task 6: D6 · Migración, historial y recuperación del trabajo visual

**Files:** Create `apps/web/server/services/studio/import-service.ts`, `import-service.integration.test.ts`, `app/api/studio/imports/route.ts`, `features/studio-designer/components/{revision-history,conflict-panel}.tsx`, `features/studio-designer/lib/draft-recovery.ts`, `apps/web/e2e/{studio-projects,studio-libraries,studio-imports}.spec.ts`, `apps/web/playwright.config.ts`; Modify `app/editor/[id]/page.tsx`, `designer.tsx`, hook D1 y scripts `test:e2e`.

**Interfaces:** `ImportService.import(ownerId,{kind:'motion-studio'|'legacy-job',sourceId}):Promise<{project:ProjectRecord,diagnostics:Diagnostic[]}>`; fuentes Motion Studio se registran por CLI/config server-only, no paths del request. `recoverDraft(projectId,baseRevision):ProjectDraft|null` y guardado local asociado a propietario/revisión; nunca un token de companion. Resolve conflicto ofrece conservar draft/copia o recargar explícitamente, no merge de documento completo a ciegas.

- [ ] **1. Escribir tests:** importar demo `episode.json`/`captions.json` conserva seis escenas, tiempos acumulados, voz y estilo, sin modificar origen; original sin modelo estructurado queda recurso/archivo original, sin fingir editor. Importar job válido conserva duración/assets. Archivo faltante da diagnóstico y proyecto recuperable; no fallback mock. Restore crea revisión nueva; reabrir tras conflicto recupera draft y permite comparación con revisión actual.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/import-service.integration.test.ts`; `pnpm --filter web test:e2e -- studio-projects.spec.ts studio-libraries.spec.ts studio-imports.spec.ts` debe fallar inicialmente por funciones ausentes.
- [ ] **3. Implementar:** importadores versionados por servicios F, importación idempotente por origen/hash, historial restaurable, conflicto visible y draft recuperable. Sustituir mock fallback de `/editor/[id]` por datos reales/error o redirección al proyecto importado; mantener enlaces de flujos existentes y presets. No duplicar las composiciones locales antiguas para el nuevo diseñador: wrappers de import compatibles usan el paquete compartido.
- [ ] **4. Verde y revisión visual:** comandos anteriores, `pnpm --filter web typecheck`, `pnpm --filter web build`. Abrir diseñador Remotion e HyperFrames reales, revisar reproducción/seek, inspector, captions, selección y estados guardado/conflicto. Registrar capturas de cada área nueva en los tamaños de Mac usados; corregir texto ilegible, foco perdido y controles ocultos antes de cerrar.
- [ ] **5. Commit:** `feat: migrate existing work and add revision recovery to studio`.

## Salida del bloque

Los recorridos de shorts y plantillas terminan en documentos editables persistentes. Componentes, estilos y marcas se configuran aparte y se seleccionan en el diseñador. Todavía no declarar listas la generación de código ni la exportación fiable del conjunto: R3–R6 comprueban esas capacidades y los fallos de workers.
