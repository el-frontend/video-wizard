# Video Wizard · editor integral con asistentes y motores seleccionables

Estado: aprobado por Carlos en esta conversación el 18 de noviembre de 2026; listo para planificación.

Revisión independiente: sin decisiones importantes pendientes para planificar tras explicitar los anclajes temporales y el comportamiento al reemplazar voz. La aprobación incluye las propuestas técnicas identificadas en este documento.

## 1. Intención y decisiones del usuario

La base del producto será `el-frontend/video-wizard`. El objetivo es un estudio de video integral que conecte extracción de shorts, diseño visual, componentes, plantillas y generación asistida hasta obtener un video final. El boletín de noticias de IA es un caso de uso dentro del producto, no su única función.

Decisiones expresadas por Carlos:

- Una sección para generar shorts a partir de videos y llevarlos a un diseñador.
- Diseñar sobre clips: añadir subtítulos, componentes y otros recursos para producir la salida final.
- Componentes predeterminados y componentes generados con IA; plantillas que contienen componentes para crear videos.
- Estilos en una sección propia, configurables y seleccionables.
- Marcas configuradas por separado y seleccionables.
- Elección explícita de Remotion o HyperFrames; un único motor activo por proyecto/generación, sin mezclar motores en la misma composición.
- Integración con Codex o Claude para generar y modificar.
- Conservar el funcionamiento como complemento del chat y las conexiones existentes, sin exigir otra clave de ElevenLabs para ese modo.
- El uso inicial es local en el Mac, decisión previa que se conserva hasta que el usuario pida otro despliegue.

Los detalles señalados como «propuesta técnica» son decisiones del redactor, no elecciones ya confirmadas del usuario. Aprobar este documento valida también esas propuestas o permite corregirlas antes del plan.

## 2. Estructura del producto

| Área | Contenido y función |
|---|---|
| Proyectos | Crear, abrir, duplicar y continuar documentos editables; revisar historial y exportaciones |
| Shorts | Importar video/YouTube, transcribir, proponer o seleccionar fragmentos y abrirlos en el diseñador |
| Diseñador | Preview del motor elegido, secuencia de escenas, capas, audio, captions, inspector y asistente contextual |
| Componentes | Catálogo de componentes predeterminados y generados, con previews, versiones, propiedades y compatibilidad |
| Plantillas | Estructuras editables de video formadas por componentes y escenas |
| Estilos | Biblioteca independiente de tratamiento visual y movimiento |
| Marcas | Biblioteca independiente de identidad: logos, fuentes y colores |
| Recursos | Videos, audio, imágenes, fuentes, transcripciones y resultados generados reutilizables |
| Trabajos y exportaciones | Procesamiento, solicitudes, renders, estados reales, registros y archivos finales |

La navegación no obliga a recorrer las áreas en orden. Las rutas actuales útiles de Video Wizard se conservan o redirigen durante la migración para evitar perder sus flujos existentes. Los nombres de rutas y el diseño exacto de navegación quedan al constructor; la interfaz nueva se redacta en español.

## 3. Qué representa cada biblioteca

**Componente:** pieza reutilizable con código para un motor, propiedades editables declaradas, recursos, versión, tamaño/duración inicial y preview. Ejemplos propuestos: título animado, rótulo inferior, logo, tarjeta de dato, marco de video, llamada a la acción y capa de captions. Puede funcionar como overlay o contenido principal de una escena.

**Plantilla:** estructura de escenas, componentes, posiciones y tiempos iniciales para un motor. Al usarla se crean instancias editables; el resultado no es un MP4 inmutable. Una plantilla puede sugerir un estilo, pero la marca del proyecto se elige aparte.

**Estilo:** tokens visuales semánticos, espaciado, formas, tratamiento tipográfico y reglas de movimiento. Cada pack declara los motores para los que dispone de implementación. Liquid Glass, ElFrontend Web y Moderno Editorial son los primeros packs que se importan de este repositorio.

**Marca:** identidad independiente, con logos, variantes, colores semánticos y fuentes locales. Propuesta técnica inicial: campos de identidad y una nota breve de tono; no incluir publicación en redes ni cuentas OAuth dentro de la marca. La voz sigue un perfil separado para que cambiar el logo no regenere narración.

**Recurso:** archivo o dato reutilizable con identidad estable y metadatos medidos. Los recursos no contienen el estado completo del editor.

Propuesta técnica de precedencia: valores iniciales del componente → estilo → campos de identidad declarados por la marca → modificaciones explícitas de la instancia. La marca solo sustituye roles que el estilo y componente exponen. La comprobación de contraste y límites se aplica al resultado combinado. Los proyectos fijan versiones de packs/componentes y una instantánea de marca; actualizar una biblioteca no cambia silenciosamente videos existentes.

## 4. Motor único por proyecto

El usuario elige Remotion o HyperFrames al crear/generar el proyecto. El motor queda guardado con el documento y determina preview, componentes compatibles y exportación. La IA recibe esa selección y genera para ese motor; no lo cambia silenciosamente.

Se pueden importar clips provenientes de cualquier herramienta, incluidos videos ya renderizados con el otro motor, porque se tratan como multimedia normal. No se ejecutan componentes de dos motores dentro del mismo proyecto.

Propuesta técnica inicial para cambiar de motor: crear otro proyecto/copia de adaptación que conserve guion y recursos neutrales. Los componentes incompatibles se identifican y necesitan reemplazo o regeneración antes de exportar. No ofrecer un selector que aparente convertir código arbitrario automáticamente. Una migración automática completa entre motores queda fuera del alcance inicial.

Remotion conserva el servicio y paquete compartido del monorepo. HyperFrames se incorpora como adaptador de worker y preview. Ambos consumen el documento común, pero producen su propia composición. No se introduce una composición HTML animada dentro de un iframe de Remotion como mecanismo de exportación.

## 5. Recorridos completos

### Video largo a short terminado

Importar un archivo o URL admitida → transcribir → proponer/seleccionar uno o varios fragmentos → ajustar inicio/fin y encuadre → enviar un fragmento al diseñador → añadir captions, componentes, marca y estilo → revisar → exportar.

La relación con el video fuente se conserva. Enviar al diseñador crea un documento con referencias al original y sus rangos; no exige exportar y volver a importar manualmente. Si un recorte requiere procesar un archivo intermedio, el sistema lo crea como recurso interno.

### Plantilla a video

Elegir motor y plantilla compatible → escoger marca/estilo → introducir textos y recursos → abrir las instancias en el diseñador → ajustar tiempos y audio → exportar. Una plantilla con varias escenas conserva su estructura editable.

### Idea o guion a video

Crear un proyecto y elegir motor → entregar idea, guion o resumen al asistente seleccionado → revisar la propuesta de escenas → aplicar → generar o cargar recursos/voz necesarios → editar visualmente → exportar. El contenido factual se limita al material suministrado o a fuentes que el usuario autorice consultar; el motor no determina los hechos.

### Componente nuevo sobre un proyecto

Seleccionar escena/capa y segundo → pedir un componente, por ejemplo un contador animado → Codex/Claude genera una propuesta para el motor activo → compilar/validar y previsualizar → incorporar la instancia → permitir guardarla en la biblioteca. Actualizar el componente de biblioteca no sustituye automáticamente las versiones ya usadas por otros proyectos.

## 6. Diseñador e interacción visual

Propuesta de alcance inicial del diseñador:

- Preview con reproducción, pausa, seek y selección de escena.
- Secuencia de escenas con reordenación y duración.
- Capas por escena: clip/imagen, componentes, texto/captions y audio.
- Inspector de posición, tamaño, orden, visibilidad y tiempos de entrada/salida, más las propiedades declaradas por cada componente.
- Recorte temporal de clips y ajuste básico de encuadre. Los recortes inteligentes existentes siguen disponibles desde el procesamiento.
- Captions: texto, inicio/fin, selección con seek, añadir, dividir, unir, eliminar e importar/exportar SRT/VTT.
- Audio: escuchar, cargar/reemplazar, volumen y posición temporal; narración separada del texto visual, con indicador de toma obsoleta cuando cambia el texto hablado.
- Guardado automático de cambios válidos, deshacer/rehacer, historial de revisiones y manejo visible de conflictos.
- Acceso al motor activo, marca y estilo sin confundirlos con la plantilla de captions.

No se incluye inicialmente un editor general de efectos comparable a un NLE profesional: edición multicámara, corrección de color avanzada, keyframes de cada propiedad arbitraria y plugins de terceros quedan fuera. Las animaciones más elaboradas se encapsulan en componentes y se ajustan mediante sus propiedades o el asistente.

## 7. Asistentes: Codex y Claude

El asistente opera sobre el mismo proyecto y sus revisiones. Cada petición conserva ID, proveedor, sesión vinculada, motor, revisión base, selección, tiempo y estado real. La IA puede proponer escenas, generar componentes, cambiar propiedades, revisar captions y solicitar/generar recursos según las herramientas disponibles.

Propuesta técnica para la primera implementación: **Codex CLI y Claude Code en el Mac**, aprovechando las sesiones locales del usuario. El puente de Codex a esta conversación ya se probó en Motion Studio; la sesión, envío y recepción de Claude Code requieren una prueba técnica propia. La presencia de un ejecutable no basta para declarar la integración operativa.

Se selecciona un asistente para cada solicitud. Un componente generado por Claude puede editarse después con Codex si ambos tienen acceso al documento y al motor correspondiente. Los conectores disponibles dependen de cada sesión: ElevenLabs conectado en Codex no se considera automáticamente conectado en Claude.

La interfaz conserva el modo de enviar feedback al chat externo. Las respuestas/aprobaciones se atienden en la conversación vinculada; el editor muestra recibos y el resultado aplicado. No se obliga a una conversación independiente embebida ni a una clave de OpenAI/ElevenLabs adicional. Si el proveedor no está disponible o una petición espera que continúe una sesión pausada, se muestra ese estado.

Las escrituras del asistente pasan por la misma API del editor con revisión base. El código generado se guarda como propuesta/versionado de componente; errores de compilación, recursos faltantes o incompatibilidad no reemplazan un componente válido. Las dependencias y APIs admitidas por cada motor se validan; el render permanece determinista.

## 8. Voz, transcripción y recursos generados

Se reutilizan el procesamiento de Whisper/FFmpeg y las herramientas conectadas en el chat elegido. Solicitar voz no equivale a disponer de un archivo terminado. La solicitud permanece pendiente hasta que existe una toma real importada y medida.

Para el perfil de Carlos se conservan la dirección cubana/latina aprobada y las reglas de pronunciación, incluido desarrollar «Inteligencia artificial al día». Las preferencias de su voz clonada son datos de perfil y no un ID global obligatorio para todos los usuarios del proyecto abierto.

Una toma nueva conserva su duración medida, texto hablado, proveedor y relación con captions. Audio y captions asociados se incorporan en una revisión coherente. Los tiempos de palabras se mantienen cuando existen y no se inventan alineaciones como si fueran medidas. Las operaciones que consumen cuota requieren identidad/idempotencia para no cobrarse dos veces por un retry de transporte.

**Propuesta de edición temporal del redactor:** reemplazar voz no cambia automáticamente las duraciones de escenas ni desplaza ediciones manuales. Los captions ligados a la toma se sincronizan con el audio nuevo; un desbordamiento se señala y bloquea la exportación hasta resolverlo. El usuario puede ajustar la toma o ampliar explícitamente la escena. Ampliar la escena desplaza el inicio de las siguientes en la secuencia; sus capas conservan posiciones temporales locales. Las capas de la escena ampliada conservan sus tiempos locales y no se estiran, salvo que declaren seguir el final de la escena. Música y otras pistas globales conservan sus tiempos absolutos; si quedan desajustadas se muestra el resultado para corregirlo. No se recortan, aceleran ni alargan clips o música de manera implícita. Este comportamiento evita que regenerar una frase altere silenciosamente el montaje.

## 9. Datos y contratos comunes

Propuesta técnica: paquete compartido `video-project` con esquema validado y versionado. Contiene identidad, propietario, revisión, motor, formato/fps, duración declarada, escenas/capas, rangos de recursos fuente, audio, captions, contenido, referencias versionadas a componentes/estilos/plantillas y marca resuelta.

Propuesta de tiempo canónico: milisegundos enteros explícitos en el documento; conversión a frames de Remotion o segundos de HyperFrames únicamente en adaptadores. Las escenas forman una secuencia ordenada; sus capas usan tiempos locales y las pistas globales usan tiempos absolutos. Las capas pueden declarar fin fijo o seguimiento explícito del final de escena. Los timestamps de transcripción se normalizan al importar. Los intervalos deben ser válidos y su cuantización a frames no puede producir capas de duración cero. La duración total viene del documento/pistas, no del último caption.

Persistencia propuesta: PostgreSQL/Drizzle de Video Wizard para proyectos, revisiones, metadatos, bibliotecas y solicitudes; archivos locales/volúmenes del despliegue para multimedia y código versionado de componentes. No guardar todos los binarios en JSON de jobs. Las exportaciones identifican revisión, motor y versiones de dependencias utilizadas.

Migrar lo existente mediante importadores: proyecto/episodio/captions de Motion Studio y resultados de los flujos actuales de Video Wizard. La API de proyecto es la única vía de escritura para editor y asistentes; el historial no se delega a dos instancias locales independientes.

## 10. Jobs, render y comprobación

Reutilizar la cola persistente de Video Wizard. Separar tipos de operación: procesamiento/transcripción, solicitud al asistente, generación de recursos y render. Un estado «enviado al chat» no es «audio generado» ni «render completado».

Cada render recibe una revisión inmutable. El adaptador valida, prepara, genera snapshots y ejecuta el motor, con progreso, logs, cancelación y artefactos consistentes. El resultado de una revisión anterior se conserva identificado; no reemplaza silenciosamente la exportación actual de un draft posterior. El sistema debe recuperarse de un worker interrumpido y evitar doble ejecución de efectos pagados.

QA común: recursos existentes, duración/fps coherentes, fuentes disponibles, captions dentro de límites y avisos de texto fuera de área. El adaptador HyperFrames conserva check estricto/snapshots/render; Remotion incorpora comprobaciones y snapshots equivalentes apropiados a sus composiciones. La exportación válida produce un MP4 con pistas y dimensiones comprobadas.

## 11. Integración en Video Wizard

Se conservan Next.js, `packages/ui`, identidad, PostgreSQL, cola, servicio Remotion y procesamiento Python. Se aprovechan conceptos, estilos y contratos del editor actual; no se copia su archivo React monolítico como arquitectura definitiva.

Separación propuesta: proyecto/contratos compartidos, bibliotecas, editor, adaptadores de render y companion local. Cada proveedor y motor declara sus capacidades. La UI filtra incompatibilidades y evita ocultar una función rota detrás de una respuesta simulada.

Antes de ampliar: resolver contratos de tiempos actuales, consolidar composiciones duplicadas y retirar fallbacks a datos de ejemplo del recorrido de producción. Mantener los flujos actuales durante la transición mediante pruebas de regresión.

El companion permanece en el Mac para acceder a CLI y sesiones; los workers pueden ejecutarse en el host o Docker. No se presume que un contenedor tenga acceso al chat ni a las credenciales del usuario. Un despliegue público/multiusuario con emparejamiento remoto, publicación en redes y estadísticas queda fuera de esta primera construcción local.

## 12. Comprobaciones de aceptación

1. Importar un video, obtener dos shorts y abrir cualquiera en el diseñador con referencia y tiempos correctos, sin exportación/reimportación manual.
2. Crear desde plantilla un proyecto editable con escenas y componentes; guardar, cerrar y reabrir sin perder cambios.
3. Seleccionar marca y estilo de bibliotecas distintas y verificar que actúan sobre roles diferentes; conservar cambios explícitos de una instancia.
4. Ejecutar el flujo por separado con Remotion y HyperFrames, con sus catálogos compatibles, sin mezclar motores en una composición.
5. Generar un componente mediante Codex y otro mediante Claude Code, ver sus previews y reutilizar una versión guardada. No declarar una conexión lista sin un recorrido real completado.
6. Solicitar un cambio desde una selección visual, recibirlo en la conversación correspondiente y reflejar una revisión guardada en el editor. Un conflicto debe conservar el trabajo manual.
7. Incorporar audio real, conservar tiempos de palabras disponibles y demostrar captions sincronizados en preview y MP4. Cambiar solo el titular no regenera voz. Reemplazar una toma por otra más larga conserva tiempos manuales y señala el desbordamiento; ampliar explícitamente la escena desplaza las siguientes conservando sus capas locales y sin mover pistas globales.
8. Exportar un video con clip, componente superpuesto, captions y audio usando cada motor en proyectos separados; comprobar duración, seek, dimensiones y snapshots.
9. Cancelar un render y recuperar un trabajo interrumpido sin promover un resultado obsoleto ni duplicar una generación pagada.
10. Reabrir un proyecto después de actualizar una biblioteca y conservar sus versiones hasta solicitar una actualización explícita.

## 13. Orden propuesto para el plan

Primero validar contratos y el puente de Claude Code, después construir persistencia/bibliotecas y el diseñador común. Incorporar los flujos de shorts y plantillas, añadir generación/versionado de componentes y completar ambos adaptadores. Cerrar con recorridos de extremo a extremo que incluyan ambos asistentes y ambos motores.

Este orden no reduce el producto a un editor de noticias: organiza la construcción del conjunto solicitado. El detalle de tareas y hitos se redacta después de aprobar este diseño.

## Referencias

- Brief de producto: `docs/product/2026-11-18-video-wizard-estudio-integral.md`.
- Análisis estático y fuentes del monorepo: `docs/analysis/2026-11-18-integracion-video-wizard.md`.
- Companion actual: `studio/README.md` y `studio/server/companion.mjs`.
- Versiones analizadas del repositorio base: `main`, commit `cab50b873ca60f18e3a72106855822d31d0c3558`; revisar cambios posteriores antes de implementar.
