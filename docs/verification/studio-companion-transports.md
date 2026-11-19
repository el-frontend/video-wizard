# Transportes locales de Video Wizard

## Resultado de las pruebas reales

Pruebas del 19 de noviembre de 2026 en el Mac local. Se ejecutó una prueba identificada por proveedor con contexto de muestra y sin operaciones sobre proyectos, video o voz.

| Proveedor   | CLI y autenticación                                                                 | Resultado                                                                                                                                                                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | 0.170.0, sesión local de ChatGPT                                                    | `f6-codex-connection` recibió un ACK de cola con el ID de entrega y el mismo ID de hilo que el vínculo confiable del chat raíz. `--resume` salió sin advertencias.                                                                                                                      |
| Claude Code | 2.1.314, `claude auth status --json` autenticado como `claude.ai` fuera del sandbox | **Bloqueado**. `f6-claude-binding` quedó registrado como entrada de la conversación de prueba y la API devolvió `oauth_org_not_allowed`. También se informó una incidencia de arranque de MCP o plugins. La prueba se detuvo sin persistir un vínculo ni enviar `f6-claude-connection`. |

El ACK de Codex certifica que la cola aceptó el mensaje. Al cerrar la prueba, la recepción por el asistente y su respuesta en el chat raíz seguían pendientes de observar. Si la cola acepta un mensaje y la CLI termina con un aviso explícito de reanudación fallida, el recibo conserva `sent` y pide continuar esa conversación. Si la CLI agota el plazo después de confirmar la cola, el recibo conserva el ID de entrega y devuelve `delivery-unknown` porque la reanudación quedó sin confirmar.

En el sandbox, Claude devolvió un falso negativo en el chequeo de autenticación por el acceso al llavero. La prueba real se ejecutó fuera del sandbox y el error API se verificó en el registro de esa prueba. Para habilitar el transporte de Claude hace falta un entorno cuyo acceso OAuth permita completar el inicio y la continuación por la CLI oficial. La disponibilidad de MCP y conectores se verifica por sesión. [Referencia de uso programático de Claude Code](https://code.claude.com/docs/en/headless), [Eventos del SDK](https://code.claude.com/docs/en/agent-sdk/typescript#sdkassistantmessage).

## Vínculos y comprobaciones locales

Ejecuta la CLI de companion desde el checkout de Video Wizard, con las CLI de los asistentes disponibles en el `PATH` del Mac.

```bash
pnpm companion --help
pnpm companion bind codex --session-file /ruta/privada/al/vinculo.json
pnpm companion status --binding-id ID
```

El archivo de Codex requiere permisos privados, el UUID del hilo seleccionado por el operador en `codexThreadId` y el checkout en `workspace`. La CLI devuelve un `bindingId` local. Los IDs de conversación se guardan en archivos con modo `0600` bajo `.studio-data/companion`, o el directorio configurado en `STUDIO_DATA_DIR`. Usa el mismo directorio para todos los procesos que accedan a esos vínculos.

Cuando se autorice una nueva verificación de Claude en un entorno habilitado, `pnpm companion bind claude` crea una conversación gestionada con `claude -p --verbose --output-format stream-json`. Companion conserva el `session_id` de la CLI cuando coinciden los eventos de inicio y resultado. Cada envío usa `--resume` con ese ID y verifica que el resultado corresponda a la misma sesión. Mantén esa conversación a cargo de companion. El bloqueo local excluye ejecuciones simultáneas de companion y se libera al terminar el proceso, incluido el timeout controlado. Si el proceso de companion se interrumpe abruptamente y queda un archivo de bloqueo, verifica que tanto su dueño como la CLI hija hayan terminado antes de eliminarlo. [Referencia de la CLI de Claude Code](https://code.claude.com/docs/en/cli-reference).

El estado de Claude requiere autenticación local y evidencia de ejecución guardada para el vínculo. Las consultas de estado solo leen esa evidencia, la ayuda de la CLI y su autenticación. Un rechazo `oauth_org_not_allowed` bloquea el vínculo aunque la sesión siga autenticada y se reinicie companion. Tras recuperar el acceso, ejecuta `pnpm companion bind claude` cuando autorices la nueva verificación. Solo una ejecución satisfactoria persistirá el nuevo vínculo. Los vínculos anteriores sin evidencia también requieren una nueva verificación.

La prueba real se ejecuta por separado y hace un solo envío a un vínculo. En Claude, al no indicar un vínculo, abre la conversación de prueba y pide en el segundo turno un marcador conocido solo por el primer turno.

```bash
pnpm --filter @workspace/companion exec tsx scripts/companion-probe.ts --provider codex --binding-id ID
pnpm --filter @workspace/companion exec tsx scripts/companion-probe.ts --provider claude
```

## Contrato para el dispatcher

El paquete de Node `@workspace/companion` exporta `BindingStore`, `CodexTransport`, `ClaudeTransport` y `RequestEnvelopeSchema`. El dispatcher debe resolver el `bindingId` desde el almacén del checkout y construir el sobre con el proveedor, proyecto, revisión base, motor y selección del contrato de F2, más `requestId` y el locator del callback autorizado por el servidor. El sobre rechaza propiedades desconocidas como `sessionId`. El callback usa una URL HTTP(S) sin credenciales, consulta ni fragmento. Usa `callback: null` únicamente en la prueba de conexión. La autorización de la API, el estado persistente de la solicitud y las transiciones por callback pertenecen al dispatcher.

`probe(binding)` comprueba compatibilidad de CLI, autenticación local y validez del vínculo. `dispatch(binding, envelope)` emite un `DeliveryReceipt` con `sent`, `failed` o `delivery-unknown`. El resultado puede incluir un ID de entrega y un aviso redactado. Conserva las entregas inciertas para revisión sin reenviarlas automáticamente. En Codex el mensaje viaja como argumento de la CLI local, así que el sobre debe llevar referencias y evitar credenciales.

## Verificación sin servicios

```bash
pnpm --filter @workspace/companion test
pnpm --filter @workspace/companion typecheck
pnpm --filter web typecheck
pnpm test --output-logs=errors-only
```

Las pruebas automatizadas simulan las respuestas de CLI y usan directorios temporales para los vínculos. Cubren argumentos, asociación del ACK al hilo, timeout sin reenvío, validación del destino, autenticación, persistencia del rechazo OAuth, revinculación explícita, respuesta de la sesión original, avisos de arranque y contención entre instancias del almacén.
