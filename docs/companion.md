# Conversaciones vinculadas del diseñador

El panel **Asistente de la conversación** guarda una solicitud con la revisión, el motor y la selección del diseñador. El companion entrega la solicitud a la conversación local elegida. El identificador público del vínculo aparece en el panel. El identificador de sesión del proveedor reside en el registro privado del Mac.

## Emparejar un vínculo existente

En el diseñador, abre **Vincular una conversación** y descarga el permiso. Caduca en cinco minutos y se consume una vez. Guarda el archivo con permisos 0600. Ejecuta los comandos desde la raíz de Video Wizard. `$B` representa el ID público del vínculo existente, `$P` el proyecto y `$O` el origen canónico que se muestra en el navegador. Para el estudio local habitual el origen es `http://app.video-wizard.localhost:3000`.

```sh
node scripts/local-studio.mjs companion migrate --binding-id "$B" --legacy-dir "$OLD"
node scripts/local-studio.mjs companion pair --binding-id "$B" --origin "$O" --file "$PERMISO"
node scripts/local-studio.mjs companion dispatch --binding-id "$B" --project-id "$P"
```

El directorio anterior contiene `bindings/`. La migración copia y vuelve a leer el registro, comprueba el checkout y conserva el ID, el destino y la evidencia de Claude. Se puede repetir. La ubicación privada nueva es `.studio/companion`; puedes elegir otra con `--config-dir` o `STUDIO_COMPANION_DIR`. Usa la misma ubicación en los comandos posteriores. El montaje de medios del renderer y las credenciales de servicios quedan fuera de ese directorio.

Cada invocación de `dispatch` reclama una solicitud creada para ese proyecto y vínculo. Puedes especificar `--request-id "$R"` para una solicitud concreta. El recibo muestra si la conversación está en cola, en espera o si el transporte perdió la confirmación. Ante una entrega incierta, comprueba la conversación y el recibo. El companion mantiene el intento original para recibir su callback.

## Acciones en la conversación

La persona que tiene acceso al registro privado del usuario del Mac puede ejecutar el cliente. Esto acredita autorización local. La identidad criptográfica del runtime del modelo queda sin verificar. La web conserva hashes de capacidades separadas de pairing, despacho e intento. El secreto de intento se transmite exclusivamente al origen local configurado mediante la cabecera de autorización. La cuenta humana sigue usando Better Auth. Un vínculo dura treinta días, el intento veinticuatro horas. Emparejar de nuevo revoca los intentos anteriores del mismo vínculo. El propietario también puede revocarlo mediante `DELETE /api/studio/projects/:id/pairing?bindingId=…`.

```sh
node scripts/local-studio.mjs companion action "$R" read
node scripts/local-studio.mjs companion action "$R" proposal --file "$ENTREGA"
node scripts/local-studio.mjs companion action "$R" feedback --approved --file "$CAMBIO"
node scripts/local-studio.mjs companion action "$R" status --file "$ESTADO"
```

Los archivos JSON de entrada deben ser privados. `read` obtiene el head para compararlo con la revisión base del recibo. `feedback` recibe `{baseRevision,text}` y modifica el texto seleccionado. Si el editor cambió, la API devuelve 409. Una repetición idéntica recupera la revisión exacta de la acción, incluso cuando el head ya avanzó.

`proposal` admite el contrato R3 con el request, la revisión y el motor del recibo. El diseñador conserva los diagnósticos de una propuesta inválida. El propietario puede previsualizar la propuesta, aplicarla y guardar la versión en biblioteca desde **Revisar propuestas**. Cada decisión es explícita. El callback admite, por ejemplo, `{"status":"completed"}` después de entregar el resultado. Una nota breve puede acompañar `waiting`, `failed` o `delivery-unknown`. Evita incluir credenciales o enlaces privados en las notas.

En Shorts, selecciona el proyecto con la conversación vinculada. La acción `source` devuelve la fuente medida y los subtítulos disponibles para ese pedido. `ranges --file "$RANGOS"` recibe una lista de intervalos `{startMs,endMs}`. **Revisar fragmentos** lleva estos intervalos a la edición normal de Shorts. La creación de proyectos sigue requiriendo la acción de la persona.

## Una toma de voz

En una importación con narración maestra, usa **Activar tomas de escena** antes de seleccionar la capa de audio de la escena. La operación conserva el archivo maestro, las tomas importadas, el historial, la música y los tiempos de subtítulos. El inventario D6 describe el origen; la capa de audio de la revisión describe la toma que se reproduce.

Confirma en el chat el texto, perfil y dirección. Comprueba que el conector esté disponible en esa sesión. Registra el inicio antes de invocarlo. Si la generación pudiera haberse ejecutado y se pierde la respuesta, conserva la incertidumbre y recupera el archivo o la evidencia del proveedor.

```sh
node scripts/local-studio.mjs companion action "$R" begin-voice --approved
node scripts/local-studio.mjs companion action "$R" upload --file "$AUDIO"
node scripts/local-studio.mjs companion action "$R" audio --approved --file "$ALINEACION"
node scripts/local-studio.mjs companion action "$R" status --file "$ESTADO"
```

El archivo de alineación contiene `baseRevision`, `sceneId`, `audioLayerId`, el `assetId` medido, `provider` (ElevenLabs o upload), `spokenText`, `captionSource` (provider-alignment o transcription) y `captions`. Cada cue incluye `id,text,startMs,endMs` relativos a la toma. Las palabras opcionales tienen tiempos relativos al inicio del cue. Guarda el audio y la alineación en archivos privados. La sustitución usa D3 y conserva la duración manual de las escenas. Si aparece un conflicto después de importar el archivo, el asset medido permanece disponible. La carga humana de un audio arbitrario deja el texto hablado sin acreditar.

Claude comunica su propio diagnóstico de CLI, OAuth y MCP. La aceptación en vivo de esta instalación quedó pendiente por `oauth_org_not_allowed`. La sesión Codex y el conector de voz se verifican por separado.

## Aceptación técnica aislada en macOS

`node scripts/local-studio.mjs companion acceptance start` crea una copia de producción de Next en un directorio privado temporal, puertos de loopback independientes, una cuenta técnica, PostgreSQL con una base `_test`, un renderer local y un proyecto con una escena de ocho segundos. Requiere las imágenes locales `postgres:16-alpine` y `video-wizard-r2-review:local`, Chrome y ffmpeg. El comando imprime el directorio de evidencia. El proyecto, sus recursos y los recibos persisten después del retorno.

Usa `acceptance info "$S"` para conocer el origen y proyecto, `acceptance pair-intent "$S"` para escribir el permiso privado y `acceptance editor-request "$S" "$JSON"` para registrar una solicitud desde la selección del diseñador. El JSON contiene `kind,bindingId,message,selection.layerId`. La escena técnica contiene las capas `titular` y `voz`. `acceptance receipts "$S"`, `acceptance head "$S"` y `acceptance screen "$S" live` permiten verificar el resultado. `acceptance review "$S" "$PROPUESTA"` reproduce, aplica y lista la versión en la cuenta técnica. `acceptance reuse "$S" "$PROPUESTA"` inserta esa versión en otro proyecto técnico mediante el selector de biblioteca. El recorrido controlado usa una copia del proyecto y un transporte de prueba. Los archivos de la toma y la evidencia permanecen privados en `$S`.
