# Video Wizard · base compartida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a Video Wizard contratos temporales coherentes, proyectos/revisiones persistentes, recursos y bibliotecas versionadas, y un diagnóstico real de los transportes locales.

**Architecture:** Esquemas puros compartidos; servicios de negocio detrás de rutas delgadas; PostgreSQL como escritor único y disco local para archivos. El companion solo adapta transportes de agentes y consume la API, sin un segundo store.

**Tech Stack:** Stack existente, Zod 4 para el paquete nuevo, Vitest y PostgreSQL aislado de pruebas; TypeScript/tsx para companion.

**Spec:** [Diseño aprobado](../specs/2026-11-18-video-wizard-integral-design.md). Leer también [plan general y contratos](2026-11-18-video-wizard-integral.md).

## Global Constraints

Aplican todas las restricciones del plan general: un motor, milisegundos explícitos, revisión base, bibliotecas fijadas, sesiones existentes y uso local. `AGENTS.md` de Video Wizard exige servicios con lógica, rutas HTTP delgadas, módulos por feature, TypeScript estricto sin `any` y nombres de archivo kebab-case. No actualizar Remotion ni añadir `@remotion/gsap` para resolver los tiempos: este plan no requiere esa integración.

## Review Focus

- Segundos y milisegundos o palabras descartadas en el flujo viejo: F1 conserva unidad explícita en cada frontera.
- Intervalos subframe o fin exacto de escena: F2 valida y cuantiza sin duración cero.
- Dos escrituras simultáneas o un propietario distinto: F3 evita pérdida de revisión y acceso cruzado.
- Archivos movidos, nombres con espacios, traversal o enlaces fuera de raíz: F4 conserva IDs y rechaza rutas ajenas.
- Una CLI instalada sin sesión utilizable o entrega sin confirmación: F6 distingue capacidad, autenticación y entrega real.

## Mapa de archivos

- `packages/video-project/src/{schema,time,commands,library,requests,index}.ts`: contrato y operaciones puras; tests vecinos.
- `apps/web/server/services/studio/`: `project-service.ts`, `asset-service.ts`, `library-service.ts` y sus tests; cada uno dueño de una entidad.
- `apps/web/server/db/schema/{studio-projects,studio-assets,studio-libraries}.ts`: persistencia; migraciones generadas por Drizzle en su directorio existente.
- `apps/web/app/api/studio/`: rutas de proyectos, recursos y bibliotecas del plan general.
- `apps/companion/src/{index,protocol,codex-provider,claude-provider,binding-store}.ts`: transporte local; no lógica de documentos.
- F1 añade runners al paquete web y los nuevos paquetes; F3 añade fixtures DB aisladas en `apps/web/test/studio-db.ts`. Paquetes nuevos usan exports TypeScript como los paquetes compartidos existentes y scripts `test`, `typecheck`.

### Task 1: F1 · Reparar contratos del flujo actual de subtítulos

**Files:** Modify `apps/web/package.json`, `apps/web/server/services/subtitle-generation-service.ts`, `apps/web/server/worker/handlers.ts`, `apps/web/app/api/{render-video-subtitles,render-with-subtitles}/route.ts`, `apps/web/features/video/hooks/use-subtitle-generation.ts`, `apps/web/features/video/components/remotion-preview.tsx`, `apps/web/features/video/containers/subtitle-generator-container.tsx`; Create `apps/web/vitest.config.ts`, `apps/web/features/video/lib/legacy-timing.ts`, `apps/web/features/video/lib/legacy-timing.test.ts`, `docs/verification/studio-baseline.md`. Modificar consumidores encontrados con `rg`, sin cambiar unidades a ciegas en otras rutas.

**Interfaces:** Produce `fromWhisperSeconds(input: WhisperSegment[]): LegacySubtitleMs[]`, `legacyMsToSeconds(input: LegacySubtitleMs[]): SubtitleSegment[]`, `durationFrames(durationMs:number,fps:number):number`. Los tipos del helper nombran unidad; palabras siguen la unidad de su segmento. `RemotionPreview` recibe `sourceDurationMs` medido y conserva duración del medio, incluyendo silencio final.

- [ ] **1. Escribir pruebas:** fixture de 8000 ms, caption 500–2300 ms y palabra 600–900 ms. La salida Whisper→ms conserva palabra; ms→preview y ms→render producen 0.5–2.3 s, palabra 0.6–0.9; duración a 30 fps es 240 frames, también sin captions. Añadir runner Vitest real, alias `@/` y script `typecheck: tsc --noEmit`; el comando de tests anterior era un stub.
- [ ] **2. Ejecutar en rojo:** `pnpm --filter web test -- features/video/lib/legacy-timing.test.ts`; debe fallar por helper ausente, no por una configuración rota. Registrar el estado inicial de build/lint en baseline.
- [ ] **3. Implementar helper y conectar fronteras:** mantener servicio legado en ms, convertir al entrar en componentes que esperan segundos y al enviar a Remotion. Añadir `sourceDurationMs` a RenderSubtitlesInput, rutas/worker y estado del hook; calcular `durationInFrames` desde metadata medida del procesamiento/probe, incluso sin captions. Para clientes viejos sin ese campo, medir el archivo fuente autorizado en servidor; no usar último caption ni inferir unidad por magnitud. Conservar rutas actuales y marca.
- [ ] **4. Verificar:** mismo test en verde, `pnpm --filter web typecheck`; reproducir fixture en `/subtitle-generator` y comprobar caption a 0.8 s y cola sin voz hasta 8 s. Baseline documenta límites/fallos previos sin atribuirlos a esta tarea.
- [ ] **5. Commit acotado:** archivos anteriores y lockfile si cambió; mensaje `fix: normalize legacy subtitle boundaries and preserve source duration`.

### Task 2: F2 · Esquema y operaciones de proyecto

**Files:** Create `packages/video-project/package.json`, `tsconfig.json`, `src/{schema,time,commands,library,requests,index}.ts`, `src/{schema,time,commands}.test.ts`, `src/fixtures/projects.ts`. Dependencias y scripts forman parte de este entregable; nombre del paquete `@workspace/video-project`.

**Interfaces:** Produce todos los tipos del contrato general mediante Zod e inferencia, `parseProject(value:unknown):ProjectDraft`, `sceneStartMs(project,sceneId):number`, `quantizeRange(startMs,endMs,fps):{fromFrame:number,durationInFrames:number}`, `applyCommand(project:ProjectDraft,command:ProjectCommand):ProjectDraft`, `validateForExport(project):Diagnostic[]`. `ProjectCommand` es unión para añadir/quitar/reordenar escena o capa, actualizar props/tiempos, captions, narración, marca/estilo, reemplazar toma y ampliar escena. Cada comando guarda IDs estables; selección es externa al documento. F2 define `Diagnostic` y `JsonValue`; render-contract reexporta Diagnostic sin dependencia inversa.

- [ ] **1. Escribir tests:** rechazar motor desconocido, fps no positivo y tiempos no enteros/negativos; aceptar capa desbordada como draft pero devolver `layer-overflow` al exportar. Con escenas de 4200 y 3000 ms, ampliar la primera a 5000 cambia inicio de segunda a 5000, conserva sus tiempos locales y música global en 1000–7000. Sustituir voz por 4800 ms no amplía por sí solo la escena de 4200. Rango 1–2 ms a 30 fps ocupa al menos un frame; cue no está activo en su instante `endMs`.
- [ ] **2. Rojo:** `pnpm --filter @workspace/video-project test`; esperar fallos por exports sin implementar.
- [ ] **3. Implementar operaciones puras y esquema:** definir rangos semiabiertos, `floor(start)`/`ceil(end)` en adaptador de frames, máximo del final de secuencia/pistas como duración; referencias faltantes generan diagnóstico editable. Las acciones no disparan TTS ni render. Narración cambiada marca toma obsoleta; editar titular no la marca. Fijar `schemaVersion:1` y rechazar versiones futuras con error recuperable.
- [ ] **4. Verde:** tests y `pnpm --filter @workspace/video-project typecheck`; test adicional serialize/parse conserva IDs, palabras, overrides y referencias versionadas exactamente.
- [ ] **5. Commit:** solo paquete y lockfile; `feat: add versioned video project schema and timeline commands`.

### Task 3: F3 · Proyectos, revisiones y API de escritura única

**Files:** Create `apps/web/server/db/schema/studio-projects.ts`, `apps/web/server/services/studio/project-service.ts`, `project-service.integration.test.ts`, `apps/web/test/studio-db.ts`, rutas `apps/web/app/api/studio/projects/route.ts`, `[id]/route.ts`, `[id]/revisions/route.ts`, `[id]/restore/route.ts`, `[id]/duplicate/route.ts`; Modify `apps/web/server/db/schema/index.ts`, `apps/web/package.json` y migraciones Drizzle generadas. Añadir dependencia del paquete F2.

**Interfaces:** `ProjectService.create(ownerId,input):Promise<ProjectRecord>`, `get(ownerId,id):Promise<ProjectRecord>`, `save(ownerId,id,{baseRevision,document}):Promise<ProjectRecord>`, `history(ownerId,id,cursor?):Promise<RevisionPage>`, `restore(ownerId,id,{baseRevision,targetRevision}):Promise<ProjectRecord>`, `duplicate(ownerId,id,{baseRevision,engine?}):Promise<ProjectRecord>`. `RevisionPage={items:RevisionSummary[],nextCursor:string|null}` y resumen contiene revisión, autor, fecha y operación. `ConflictError.current` es `ProjectRecord`; HTTP 409, sin overwrite automático.

- [ ] **1. Escribir integración:** dos guardados concurrentes con misma revisión producen exactamente un éxito y un conflicto; historial tiene una revisión nueva. Otro propietario no puede leer/escribir/restaurar. Restore crea revisión nueva y conserva la original; título vacío/documento inválido no escribe. Cambiar `engine` en PUT es rechazado; duplicate con otro motor mantiene recursos neutrales y marca incompatibilidades.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/project-service.integration.test.ts`, con DB de prueba aislada; debe fallar por servicio/tablas ausentes. No usar la DB del usuario para las pruebas.
- [ ] **3. Implementar transacción:** tablas proyecto/revisiones con propietario y restricciones, compare-and-swap de revisión en DB, historial inmutable, migración de solo adición. Rutas Auth.js sin lógica de negocio. Duplicar no referencia rutas mutables de otro proyecto y no convierte código de motor.
- [ ] **4. Verde:** integración y `pnpm --filter web typecheck`; crear/leer/modificar proyecto con una sesión real local y comprobar error 409. Reiniciar API y volver a leerlo. Mantener fixtures y limpieza limitadas al namespace de pruebas.
- [ ] **5. Commit:** servicio, esquema, rutas, tests y migración; `feat: persist studio projects with revision conflicts and history`.

### Task 4: F4 · Recursos medidos y estables

**Files:** Create `apps/web/server/db/schema/studio-assets.ts`, `apps/web/server/services/studio/{asset-service,media-probe,asset-paths}.ts`, `asset-service.test.ts`, `asset-service.integration.test.ts`, rutas `apps/web/app/api/studio/assets/route.ts`, `[id]/route.ts`; Modify barrel DB y migración correspondiente.

**Interfaces:** `AssetService.ingest(ownerId,{stream,filename,mediaType}):Promise<AssetRecord>`, `get(ownerId,id):Promise<AssetRecord>`, `resolveFile(ownerId,id):Promise<string>`, `verify(ownerId,ids:string[]):Promise<Diagnostic[]>`. `mediaProbe(path):Promise<{durationMs?:number,width?:number,height?:number,hasAudio:boolean}>`; la API jamás recibe un path arbitrario del navegador. Root `STUDIO_DATA_DIR`, configuración server-only.

- [ ] **1. Escribir tests:** archivo `voz cubana.mp3` produce duración del probe, ID y hash estables; video sin captions conserva duración; imagen/fuente no reciben duración inventada. Otro propietario, `../`, symlink fuera de root y Range inválido se rechazan. Borrar el archivo conserva metadatos y reporta `asset-missing`, sin sustituirlo.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/asset-service.test.ts server/services/studio/asset-service.integration.test.ts`.
- [ ] **3. Implementar:** upload temporal y promoción después de validación; `ffprobe` por exec de argumentos sin shell y timeout; metadata DB, bytes en disco, resolución por ID y Range para preview. Si falla el guardado, limpiar solo temporal propio. Importadores de confianza usarán el mismo método de ingestión.
- [ ] **4. Verde:** pruebas y reproducción parcial real en navegador desde la ruta autorizada; medir fixture con ffprobe y contrastar con AssetRecord. Probar nombre con tildes y espacios.
- [ ] **5. Commit:** `feat: add measured studio assets with authorized file access`.

### Task 5: F5 · Bibliotecas versionadas y primeros packs

**Files:** Create `apps/web/server/db/schema/studio-libraries.ts`, `apps/web/server/services/studio/{library-service,appearance-service}.ts`, `library-service.integration.test.ts`, `appearance-service.test.ts`, rutas `apps/web/app/api/studio/libraries/[kind]/route.ts`, `[kind]/[id]/[version]/route.ts`, `apps/web/scripts/seed-studio-libraries.ts`, `packages/style-packs/{package.json,src/index.ts,packs/}`. Modify DB barrel/migración.

**Interfaces:** `LibraryService.publish(ownerId,entry:LibraryEntry):Promise<LibraryEntry>`, `list(ownerId,{kind,engine?}):Promise<LibraryEntry[]>`, `get(ownerId,ref:LibraryRef):Promise<LibraryEntry>`, `resolveAppearance({defaults,style,brand,overrides}):ResolvedAppearance`. `ResolvedAppearance` contiene tokens finales y diagnósticos. Packs guardan `frame.md`, tokens y capacidades por motor. Solo anunciar una implementación después de R1/R2.

- [ ] **1. Escribir tests:** publicar v2 no modifica v1 ni proyectos fijados; filtro excluye componente HyperFrames de Remotion. Marca solo modifica roles expuestos; override explícito gana. No confundir plantilla de captions con pack visual. Publicar dos veces mismo hash es idempotente; misma versión con bytes distintos se rechaza.
- [ ] **2. Rojo:** `pnpm --filter web test -- server/services/studio/library-service.integration.test.ts server/services/studio/appearance-service.test.ts`.
- [ ] **3. Implementar y sembrar:** importar `styles/noticias-liquid-glass`, `noticias-elfrontend-web`, `noticias-modern-editorial` desde Motion Studio, preservando fuentes como recursos F4. Añadir entradas para los nueve presets de captions Remotion como componentes existentes. Brand independiente; no incluir el ID privado de voz en el seed público. Código versionado en disco por hash, metadatos DB, no sobrescribir versiones. R1/R2 añaden implementaciones, no afirman compatibilidad por similitud de tokens.
- [ ] **4. Verde:** tests y seed ejecutado dos veces sin duplicados; crear proyecto fijado, actualizar una biblioteca y reabrir el proyecto conservando las versiones anteriores.
- [ ] **5. Commit:** `feat: add versioned style component and brand libraries`.

### Task 6: F6 · Probar y encapsular transportes locales de Codex/Claude

**Files:** Create `apps/companion/package.json`, `tsconfig.json`, `src/{index,protocol,codex-provider,claude-provider,binding-store}.ts`, `src/{codex-provider,claude-provider,binding-store}.test.ts`, `scripts/companion-probe.ts`, `docs/verification/studio-companion-transports.md`. Modify root scripts para poder arrancar companion local separadamente de Docker. Reutilizar comportamiento, no copiar el store de `studio/server/companion.mjs`.

**Interfaces:** `AssistantTransport.probe(binding):Promise<TransportCapabilities>`, `dispatch(binding,envelope):Promise<DeliveryReceipt>`. `TransportCapabilities={available,authenticated,canResume,canSendToBoundSession,reason?}`. `DeliveryReceipt={status:'sent'|'delivery-unknown'|'failed',deliveryId?,notice?}`. `Binding={id,provider,sessionId,workspace,createdAt}` se establece desde CLI local; un mensaje del navegador no elige otro sessionId. `RequestEnvelope` contiene requestId, callback/API autorizada, proyecto, motor, revisión y selección del contrato general, sin secretos en logs.

- [ ] **1. Escribir tests:** Codex usa instalación compatible con `queue`, argumentos separados, destino fijado en binding y confirmación que corresponde al thread; timeout deja entrega incierta sin reenvío automático. Claude no se marca disponible con solo `command -v`; binding de otro workspace y cambios de destino desde browser se rechazan. La carrera callback/ack de recibos persistentes pertenece a R4.
- [ ] **2. Rojo:** `pnpm --filter @workspace/companion test`; crear paquete con ese nombre y runner, comprobar que falla por implementación ausente.
- [ ] **3. Verificar protocolo antes de implementarlo:** leer `codex --help`, `codex queue --help`, `claude --help` y documentación oficial actual de Claude Code/sesiones. Mantener `codex queue --thread … --message … --resume` solo si sigue soportado. Para Claude usar transporte oficial que continúe una sesión local vinculada y observable; no inventar un comando de inyección a una ventana activa. Si necesita sesión gestionada por companion, vincular explícitamente esa conversación de Claude Code, conservar ID y documentar propiedad/exclusión del proceso. Si no se consigue enviar y continuar una conversación real, entregar diagnóstico bloqueado y resolverlo antes de R4; no declarar Claude terminado ni pedir una clave sustituta por defecto.
- [ ] **4. Implementar y comprobar transporte:** `pnpm --filter @workspace/companion test`; `pnpm --filter @workspace/companion exec tsx scripts/companion-probe.ts --provider codex` y equivalente `--provider claude` envían solo una comprobación identificada, sin cambiar videos ni generar voz. Registrar recepción y respuesta reales, versiones/protocolo y necesidad de continuar una sesión pausada. Las pruebas reales se ejecutan una vez por proveedor, sin bucles de retry.
- [ ] **5. Commit:** `feat: add verified local assistant transports and capability reporting`; evidencia redactada sin IDs privados ni transcript completo. Si Claude está bloqueado, el commit debe decirlo y el plan no queda completo.

## Salida del bloque

F1–F6 verdes, persistencia tras reinicio, bibliotecas versionadas y transporte verificado o bloqueo explícito que impida anunciar soporte. No declarar listas la UI, generación ni exportación de proyectos multicapa: corresponden a D y R. Ejecutar `pnpm --filter web typecheck`, tests de este bloque y los de paquetes nuevos; no repetir renders de videos existentes para cambios solo de persistencia.
