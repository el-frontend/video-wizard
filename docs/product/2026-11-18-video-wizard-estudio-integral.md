# Video Wizard · estudio integral de video

Estado: brief de producto incorporado al diseño completo aprobado por Carlos el 18 de noviembre de 2026. El plan de implementación se revisa por separado antes de ejecutar.

## Dirección confirmada

Video Wizard será la aplicación base de un editor integral. Se podrán combinar las herramientas para obtener un video final: extraer shorts desde videos, diseñar sobre esos shorts, añadir subtítulos y componentes, crear componentes con ayuda de IA, utilizar componentes predeterminados o construir un video desde una plantilla.

La aplicación se integrará con Codex o Claude para generación y edición usando Remotion o HyperFrames. Los estilos tendrán una sección propia. Las marcas se configurarán en otra sección y se podrán escoger. El motor de generación será una elección del usuario.

Esta dirección amplía la propuesta inicial centrada en boletines. El boletín de IA y sus tres estilos pasan a ser un caso de uso y contenido reutilizable dentro del estudio.

## Piezas del producto

| Pieza | Responsabilidad | Estado de la definición |
|---|---|---|
| Shorts | Extraer fragmentos de un video y enviarlos al diseñador | Confirmada |
| Diseñador | Trabajar con clips, subtítulos, componentes y plantillas para producir el video final | Confirmada; controles propuestos en el diseño completo |
| Componentes | Elementos predeterminados o generados para colocar en el video | Confirmada; catálogo editable propuesto |
| Plantillas | Estructuras predeterminadas de video que contienen componentes | Confirmada |
| Estilos | Biblioteca independiente de estilos seleccionables | Confirmada |
| Marcas | Configurar y seleccionar identidades de marca separadamente | Confirmada |
| Motor | Seleccionar Remotion o HyperFrames, uno activo por proyecto | Confirmada |
| Asistente | Integración con Codex o Claude para crear y modificar | Confirmada; conexiones técnicas por validar |
| Proyectos y recursos | Guardar documentos editables, revisiones y assets compartidos entre herramientas | Propuesta para sostener el flujo integral |
| Exportaciones | Producir y registrar la salida final de una revisión del proyecto | Objetivo confirmado; organización propuesta |

## Distinciones necesarias

- Un componente es un elemento reutilizable: un título, un rótulo, un dato animado, un marco, una escena gráfica o una capa de subtítulos. Estos ejemplos son propuestas, no un catálogo aprobado.
- Una plantilla reúne componentes, estructura y tiempos iniciales para construir un video. Instanciarla debe producir contenido editable.
- Un estilo define el tratamiento visual y de movimiento. Los tres estilos de noticias existentes son los primeros elementos de esa biblioteca.
- Una marca define la identidad seleccionada para el proyecto: logos, fuentes y colores, con los campos finales por acordar.
- El motor ejecuta la composición. La compatibilidad de componentes y plantillas debe indicarse sin prometer conversión automática de código entre motores.
- El asistente genera o modifica contenido y componentes sobre el mismo proyecto que edita el usuario; no mantiene un documento separado y divergente.

## Recorridos que debe soportar

1. Video largo → selección de shorts → abrir un short en el diseñador → subtítulos y componentes → estilo y marca → exportación.
2. Plantilla → contenido y recursos propios → ajustes en el diseñador → exportación.
3. Idea o guion → generación con Codex/Claude → revisar composición o componentes → editar visualmente → exportación.
4. Proyecto existente → pedir un componente para colocar encima → revisar y guardar el componente en la biblioteca → reutilizarlo en otros proyectos.

El orden de escoger marca, estilo y motor puede variar; las secciones comparten recursos y el mismo documento. Exportar un resultado intermedio no debe ser obligatorio para pasar del módulo de shorts al diseñador.

## Propuestas de funcionamiento

- Diseñador con preview, línea de tiempo/capas e inspector del elemento seleccionado.
- Selección explícita de marca, estilo y motor en el proyecto, con presets opcionales. Un cambio no debe borrar contenido ni regenerar voz por sí solo.
- Asistente contextual con proyecto, revisión, escena/capa/componente y segundo seleccionados. La conversación puede crear un componente o editar propiedades del componente existente.
- Componentes con propiedades editables declaradas, recursos asociados, versión, motor compatible y preview. El resultado generado debe validarse antes de incorporarse al proyecto.
- Un documento de proyecto persistente y una API de guardado comunes para edición visual y asistentes; historial y conflictos de revisión.
- Diferenciar una petición al asistente, una generación de audio, un procesamiento de video y un render final; cada operación conserva su estado real.
- Estilos y marcas independientes, con una regla de aplicación de propiedades que deberá definirse para evitar que seleccionar una marca inutilice el estilo elegido.
- Conservar el modo de uso con el chat conectado sin exigir otra clave de ElevenLabs por defecto. El soporte efectivo de Codex y Claude debe validarse por separado; una integración disponible no implica la disponibilidad de la otra.

## Motor único confirmado

Carlos confirmó que se escoge un único motor cada vez. El diseño usa un motor activo por proyecto/generación; los componentes y plantillas indican su compatibilidad. No se mezclan motores ejecutando componentes dentro de una misma composición.

Los videos ya renderizados son recursos multimedia y pueden importarse como cualquier clip. Esto no implica ejecutar su motor de origen dentro del proyecto de destino. La conversión automática de componentes entre motores queda fuera del alcance inicial propuesto.

La descripción completa está en `../superpowers/specs/2026-11-18-video-wizard-integral-design.md` para revisión antes de construir.

## Base técnica que se conserva

Del análisis previo: Next.js, paquetes de UI, identidad, PostgreSQL, cola y procesamiento de Video Wizard; el editor de escenas, estilos, revisión y companion de Motion Studio. La organización final y el orden de construcción se definirán después de validar la descripción completa del producto.

Referencia: `docs/analysis/2026-11-18-integracion-video-wizard.md`. Esa recomendación técnica es previa a esta ampliación de alcance: la elección explícita del motor por el usuario y las secciones independientes de estilos y marcas prevalecen sobre las recomendaciones anteriores.
