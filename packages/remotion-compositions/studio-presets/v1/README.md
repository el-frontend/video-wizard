# Presets de subtítulos de Studio, versión 1

La siembra guarda los bytes UTF-8 de cada archivo `.tsx.txt` como bundle opaco
de la versión 1 del componente. `manifest.builtin` identifica el preset. El
adaptador Remotion puede restaurar el código almacenado en
`templates/<nombre>.tsx` y colocar `types.ts.txt` como `types.ts` para
resolver el import de tipos. Cada archivo exporta por nombre la función cuyo
nombre coincide con el archivo. La única importación en tiempo de ejecución
es `remotion`. El lockfile de la siembra resolvía Remotion 4.0.405 y React
19.2.3.

| Preset         | Export                 |
| -------------- | ---------------------- |
| `default`      | `DefaultTemplate`      |
| `viral`        | `ViralTemplate`        |
| `minimal`      | `MinimalTemplate`      |
| `modern`       | `ModernTemplate`       |
| `highlight`    | `HighlightTemplate`    |
| `colorshift`   | `ColorShiftTemplate`   |
| `hormozi`      | `HormoziTemplate`      |
| `mrbeast`      | `MrBeastTemplate`      |
| `mrbeastemoji` | `MrBeastEmojiTemplate` |
