---
version: 1
name: Noticias · Liquid Glass
description: Vidrio translúcido sobre formas suaves, reflejos y capas flotantes.
unit: the frame — 1080×1920, 30 fps
principle: una noticia · un hecho protagonista · tiempo para entenderlo
colors:
  background: "#E9EFF7"
  foreground: "#102237"
  accent: "#2454A0"
  surface: "#FFFFFF"
  muted: "#46556B"
typography:
  display: { fontFamily: "Geist", cqw: 10.0, weight: 700, lineHeight: 1.0 }
  body: { fontFamily: "Geist", cqw: 4.0, weight: 500, lineHeight: 1.3 }
  label: { fontFamily: "Geist Mono", cqw: 2.5, weight: 400, tracking: "0.08em" }
spacing:
  pad-frame: "72px"
  safe-top: "270px"
  safe-bottom: "384px"
components:
  headline: "Titular de 3–7 palabras; anclado a la composición."
  evidence: "1M tokens de contexto; visión nativa; segundo golpe sobre pesos abiertos de modelos pequeños."
  source: "Alibaba Cloud · 16 NOV; fuente y fecha en zona segura."
  captions: "Subtítulos completos, máximo dos líneas, sincronizados con el audio original."
motion:
  energy: "suave y precisa"
  eases: { enter: "power3.out", exit: "power2.in", move: "power2.inOut", accent: "back.out(1.2)" }
  durations: { fast: 0.3, base: 0.6, slow: 1.2 }
  stagger: "0.08 por capa de vidrio"
  entrances: "escala 0.94 a 1 y giro leve de 2° a 0; títulos se revelan con el panel"
  exits: "la capa se aleja 36px y pierde opacidad"
  transitions: "blur crossfade; paneles de vidrio que flotan y se asientan"
  ambient: "formas suaves derivan detrás del vidrio; reflejo especular limitado al borde"
  pacing: "12.4s de muestra; dos momentos visuales a 0 y 7.323s; VO de 10.48s a +0.22s, sin cambiar velocidad."
---

# Noticias · Liquid Glass

## Overview
Vidrio translúcido sobre formas suaves, reflejos y capas flotantes. Propuesta comparativa para que el usuario escoja antes de rehacer el boletín completo.

## The Frame
Tres capas: fondo, noticia y acentos. Todo el texto importante entre y=270 e y=1536. La geometría cambia con el estilo; se conserva el contenido y la narración.

## Motion
Suave y precisa. Blur crossfade; paneles de vidrio que flotan y se asientan. El texto que ya está en lectura permanece quieto.

## Do / Don't
- Usar la paleta y las fuentes declaradas; assets locales y timeline determinista.
- Mantener visibles los matices: API disponible; pesos abiertos solo anunciados para variantes pequeñas.
- No convertir estas muestras en selección final del formato: el usuario debe escoger.
- No reutilizar los paneles diagonales morados del piloto anterior.

Vidrio real con backdrop-filter, borde iluminado y sombra de elevación suave. Paleta adicional de ambiente: #A5C4FF, #B9E8D1 y #C8BAF4. Superficie de lectura translúcida blanca con contraste estable; el relieve va en el borde, no encima de las letras.
