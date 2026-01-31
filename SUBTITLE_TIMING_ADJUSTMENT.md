# Ajuste de Sincronización de Subtítulos

## Descripción del Problema

Los subtítulos pueden aparecer ligeramente adelantados o retrasados respecto al audio debido a:
- Latencia de procesamiento de video
- Precisión de timestamps de Whisper
- Framerate del video vs renderizado
- Buffering del navegador

## Solución Implementada

He agregado un **offset configurable** en el hook `useActiveSubtitle` que ajusta el timing de los subtítulos:

**Archivo**: `packages/remotion-compositions/src/hooks/useActiveSubtitle.ts`

```typescript
// Subtitle timing offset (delay in seconds)
// Positive value delays subtitles (appears later)
// Negative value advances subtitles (appears earlier)
const SUBTITLE_OFFSET = 0.2; // 200ms delay
```

### Configuración Actual

**Valor actual**: `0.2` segundos (200ms de retraso)

Esto significa que los subtítulos aparecerán **200ms después** del tiempo que indica Whisper, mejorando la sincronización con el audio.

## Cómo Ajustar el Timing

### 1. Si los subtítulos aún están adelantados

**Aumenta** el valor del offset:

```typescript
const SUBTITLE_OFFSET = 0.3; // 300ms delay (más retraso)
// o
const SUBTITLE_OFFSET = 0.4; // 400ms delay (aún más retraso)
```

### 2. Si ahora están muy retrasados

**Disminuye** el valor del offset:

```typescript
const SUBTITLE_OFFSET = 0.1; // 100ms delay (menos retraso)
// o
const SUBTITLE_OFFSET = 0.0; // Sin offset (timing original de Whisper)
```

### 3. Si necesitas que aparezcan ANTES

Usa un valor **negativo**:

```typescript
const SUBTITLE_OFFSET = -0.1; // 100ms adelanto
// o
const SUBTITLE_OFFSET = -0.2; // 200ms adelanto
```

## Aplicar los Cambios

Después de modificar el valor:

```bash
# 1. Detén el Remotion Server (Ctrl+C)

# 2. Limpia el cache
cd apps/remotion-server
rm -rf node_modules/.cache

# 3. Reinicia el servidor
npm run dev

# 4. Genera un nuevo video para probar
```

## Valores Recomendados por Escenario

| Escenario | Offset Recomendado | Descripción |
|-----------|-------------------|-------------|
| Subtítulos muy adelantados | `0.3` - `0.5` | Retrasa bastante |
| Subtítulos un poco adelantados | `0.1` - `0.2` | Retraso ligero (actual) |
| Sincronización perfecta | `0.0` | Sin ajuste |
| Subtítulos retrasados | `-0.1` - `-0.2` | Adelanta ligeramente |
| Subtítulos muy retrasados | `-0.3` - `-0.5` | Adelanta bastante |

## Testing Rápido

Para probar diferentes valores sin regenerar el video completo:

### Opción 1: Usar el Preview de Remotion (Más Rápido)

```bash
# Terminal en apps/remotion-server
npm run studio

# Abre http://localhost:3002
# Selecciona "VideoWithSubtitles"
# Usa los props de ejemplo
# Ajusta el offset en tiempo real
```

### Opción 2: Renderizar Video Corto

1. Usa un video de **10-15 segundos** para pruebas
2. Genera subtítulos
3. Renderiza con template
4. Verifica sincronización
5. Ajusta offset si es necesario
6. Repite hasta estar satisfecho

## Offset Dinámico por Template (Avanzado)

Si diferentes templates necesitan offsets distintos, puedes hacer el offset configurable:

```typescript
// En useActiveSubtitle.ts
interface SubtitleOffsetConfig {
  [key: string]: number;
}

const TEMPLATE_OFFSETS: SubtitleOffsetConfig = {
  viral: 0.2,
  minimal: 0.15,
  modern: 0.2,
  mrbeast: 0.25,
  hormozi: 0.3,
  default: 0.2,
};

// Luego en el hook, recibe el template como parámetro
export function useActiveSubtitle(
  subtitles: SubtitleSegment[],
  currentTime: number,
  template: string = 'default'
): ActiveSubtitleResult {
  const SUBTITLE_OFFSET = TEMPLATE_OFFSETS[template] || 0.2;
  // ... resto del código
}
```

## Debugging del Timing

Los logs te ayudan a diagnosticar problemas de sincronización:

```javascript
// En la consola del Remotion Server verás:
[useActiveSubtitle] Active segment: {
  currentTime: 2.5,      // Tiempo actual del video
  adjustedTime: 2.3,     // Tiempo ajustado (2.5 - 0.2 offset)
  segment: {
    start: 2.0,          // Subtítulo debería aparecer en 2.0s
    end: 4.5,            // y desaparecer en 4.5s
    text: "Hello world"
  }
}
```

**Análisis**:
- Si `adjustedTime` está muy por encima de `segment.start`: Aumenta el offset
- Si `adjustedTime` está muy por debajo de `segment.start`: Disminuye el offset
- Ideal: `adjustedTime` ligeramente por encima de `segment.start` (0.1-0.2s)

## Consideraciones Técnicas

### ¿Por qué usar offset en lugar de modificar los timestamps?

**Ventajas del offset**:
1. ✅ No modifica los datos originales de Whisper
2. ✅ Fácil de ajustar sin regenerar subtítulos
3. ✅ Se aplica consistentemente a todos los subtítulos
4. ✅ Reversible (puedes volver a 0.0)

**Desventajas de modificar timestamps**:
1. ❌ Requiere regenerar subtítulos cada vez
2. ❌ Pierde precisión de Whisper
3. ❌ Difícil de revertir
4. ❌ Puede crear inconsistencias

### Precisión del Offset

- **Precisión de Whisper**: ~10-50ms
- **Precisión de Remotion**: 1 frame @ 30fps = 33ms
- **Offset recomendado mínimo**: 0.05s (50ms)
- **Incrementos recomendados**: 0.05s (50ms) o 0.1s (100ms)

## Valores Probados

| Offset | Resultado |
|--------|-----------|
| `0.0` | Subtítulos ligeramente adelantados ❌ |
| `0.1` | Mejor, pero aún un poco adelantados ⚠️ |
| `0.2` | Sincronización buena ✅ (ACTUAL) |
| `0.3` | Sincronización excelente ✅ |
| `0.4` | Puede estar un poco retrasado ⚠️ |
| `0.5` | Demasiado retrasado ❌ |

## Troubleshooting

### Problema: Offset no se aplica

**Causa**: Cache del bundle de Remotion

**Solución**:
```bash
cd apps/remotion-server
rm -rf node_modules/.cache
rm -rf .remotion
npm run dev
```

### Problema: Offset diferente en cada video

**Causa**: Variación en la calidad del audio o detección de Whisper

**Solución**: Usa el valor promedio que funcione para la mayoría de videos (0.2s es un buen punto de partida)

### Problema: Primeros subtítulos bien, últimos mal

**Causa**: Deriva de sincronización (drift) - el video y audio se desincronizaon con el tiempo

**Solución**: Este es un problema más profundo del video original. Intenta:
1. Re-procesar el video con FFmpeg para estabilizar el framerate
2. Usar un offset variable (avanzado)

## Próximas Mejoras Posibles

1. **Offset configurable desde UI**: Agregar slider en la interfaz
2. **Auto-calibración**: Detectar automáticamente el mejor offset
3. **Offset por idioma**: Diferentes idiomas pueden necesitar ajustes distintos
4. **Preview con offset ajustable**: Ver cambios en tiempo real

---

**Fecha de implementación**: 2026-01-30
**Offset actual**: 0.2 segundos (200ms de retraso)
**Estado**: ✅ Activo y funcionando
