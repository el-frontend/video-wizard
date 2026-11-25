---
version: 1
name: Noticias · ElFrontend Web
description: Identidad actual de elfrontend.com: marfil, coral, bento y Bricolage Grotesque.
unit: the frame — 1080×1920, 30 fps
principle: una noticia · un hecho protagonista · tiempo para entenderlo
colors:
  background: "#F3F3EF"
  foreground: "#121316"
  accent: "#A8350E"
  surface: "#FFFFFF"
  muted: "#575C66"
typography:
  display: { fontFamily: "Bricolage Grotesque", cqw: 10.0, weight: 800, lineHeight: 1.0 }
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
  energy: "cercana y editorial"
  eases: { enter: "expo.out", exit: "power2.in", move: "power2.inOut", accent: "expo.out" }
  durations: { fast: 0.2, base: 0.4, slow: 0.8 }
  stagger: "0.06 por tarjeta"
  entrances: "tarjetas suben 36px y encajan; sin inclinaciones ni perspectiva"
  exits: "el dato se retira dentro de su tarjeta; el contenedor persiste"
  transitions: "card morph anchor; paneles bento que se encajan"
  ambient: "sin deriva decorativa; barra de lectura continua"
  pacing: "12.4s de muestra; dos momentos visuales a 0 y 7.323s; VO de 10.48s a +0.22s, sin cambiar velocidad."
---

# Noticias · ElFrontend Web

## Overview
Identidad actual de elfrontend.com: marfil, coral, bento y Bricolage Grotesque. Propuesta comparativa para que el usuario escoja antes de rehacer el boletín completo.

## The Frame
Tres capas: fondo, noticia y acentos. Todo el texto importante entre y=270 e y=1536. La geometría cambia con el estilo; se conserva el contenido y la narración.

## Motion
Cercana y editorial. Card morph anchor; paneles bento que se encajan. El texto que ya está en lectura permanece quieto.

## Do / Don't
- Usar la paleta y las fuentes declaradas; assets locales y timeline determinista.
- Mantener visibles los matices: API disponible; pesos abiertos solo anunciados para variantes pequeñas.
- No convertir estas muestras en selección final del formato: el usuario debe escoger.
- No reutilizar los paneles diagonales morados del piloto anterior.

Fuente visual: https://www.elfrontend.com/, consultada el 16 de noviembre de 2026. Tokens extraídos de `.v4`: #F3F3EF, #FFFFFF, #ECECE6, #DCDCD4, #121316, #575C66, #FF6A3D, #140803, #A8350E. Tipos Bricolage Grotesque y Geist; tarjetas de radio amplio y marca elfrontend con punto coral.
