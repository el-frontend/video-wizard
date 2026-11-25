---
version: 1
name: Noticias · Moderno Editorial
description: Negro tinta y lima, tipografía monumental y composición editorial asimétrica.
unit: the frame — 1080×1920, 30 fps
principle: una noticia · un hecho protagonista · tiempo para entenderlo
colors:
  background: "#111411"
  foreground: "#F2F5EC"
  accent: "#D6FF62"
  surface: "#1C221C"
  muted: "#C2CCB8"
typography:
  display: { fontFamily: "Archivo Black", cqw: 10.0, weight: 400, lineHeight: 1.0 }
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
  energy: "rápida, gráfica y segura"
  eases: { enter: "expo.out", exit: "power3.in", move: "power4.inOut", accent: "expo.out" }
  durations: { fast: 0.15, base: 0.3, slow: 0.6 }
  stagger: "0.04 por línea"
  entrances: "titulares por máscara y barridos de 90px; dato con corte de escala, sin rebote"
  exits: "salida de máscara, corte limpio al segundo golpe"
  transitions: "hard cut; máscaras tipográficas y barrido de línea"
  ambient: "anillo técnico gira lentamente; regla de lectura continua"
  pacing: "12.4s de muestra; dos momentos visuales a 0 y 7.323s; VO de 10.48s a +0.22s, sin cambiar velocidad."
---

# Noticias · Moderno Editorial

## Overview
Negro tinta y lima, tipografía monumental y composición editorial asimétrica. Propuesta comparativa para que el usuario escoja antes de rehacer el boletín completo.

## The Frame
Tres capas: fondo, noticia y acentos. Todo el texto importante entre y=270 e y=1536. La geometría cambia con el estilo; se conserva el contenido y la narración.

## Motion
Rápida, gráfica y segura. Hard cut; máscaras tipográficas y barrido de línea. El texto que ya está en lectura permanece quieto.

## Do / Don't
- Usar la paleta y las fuentes declaradas; assets locales y timeline determinista.
- Mantener visibles los matices: API disponible; pesos abiertos solo anunciados para variantes pequeñas.
- No convertir estas muestras en selección final del formato: el usuario debe escoger.
- No reutilizar los paneles diagonales morados del piloto anterior.

Lima como superficie y señal, no neón con glow. El contraste tipográfico y la escala crean la energía; nada de interfaces inventadas o métricas no aportadas.
