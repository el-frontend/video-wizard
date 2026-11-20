import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { loadStylePack, stylePackFonts, stylePackIds } from '@workspace/style-packs';
import { RemotionCaptionPresetSchema } from '@workspace/video-project';
import type { CaptionTemplate } from '@workspace/remotion-compositions';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

import * as schema from '@/server/db/schema';
import { AssetService } from '@/server/services/studio/asset-service';
import { LibraryService } from '@/server/services/studio/library-service';

const captionPresets = {
  default: { name: 'Predeterminado', source: 'DefaultTemplate' },
  viral: { name: 'Viral', source: 'ViralTemplate' },
  minimal: { name: 'Minimalista', source: 'MinimalTemplate' },
  modern: { name: 'Moderno', source: 'ModernTemplate' },
  highlight: { name: 'Resaltado', source: 'HighlightTemplate' },
  colorshift: { name: 'Cambio de color', source: 'ColorShiftTemplate' },
  hormozi: { name: 'Hormozi', source: 'HormoziTemplate' },
  mrbeast: { name: 'MrBeast', source: 'MrBeastTemplate' },
  mrbeastemoji: { name: 'MrBeast con emojis', source: 'MrBeastEmojiTemplate' },
} satisfies Record<CaptionTemplate, { name: string; source: string }>;

async function main() {
  const ownerId = z.uuid().safeParse(process.argv[2]);
  const connectionString = process.env.DATABASE_URL;
  if (!ownerId.success || process.argv.length !== 3 || !connectionString) {
    throw new Error('Configura DATABASE_URL y pasa el UUID de un usuario de Studio.');
  }

  const pool = new Pool({ connectionString });
  const db = drizzle({ client: pool, schema });
  try {
    const [owner] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, ownerId.data));
    if (!owner) throw new Error('El usuario de Studio no existe.');

    const assets = new AssetService(db);
    const library = new LibraryService(db);
    const fonts = await Promise.all(
      stylePackFonts.map(async ({ family, filename, source, weight }) => {
        const asset = await assets.ingest(owner.id, {
          filename,
          mediaType: 'font/woff2',
          stream: createReadStream(source),
        });
        return { assetId: asset.id, family, weight };
      })
    );
    const assetIds = fonts.map(({ assetId }) => assetId);

    for (const id of stylePackIds) {
      await library.publish(owner.id, { ...(await loadStylePack(id)), assetIds, fonts });
    }

    for (const preset of RemotionCaptionPresetSchema.options) {
      const { name, source } = captionPresets[preset];
      const code = await readFile(
        new URL(
          `../../../packages/remotion-compositions/studio-presets/v1/${source}.tsx.txt`,
          import.meta.url
        )
      );
      await library.publish(
        owner.id,
        {
          kind: 'component',
          id: preset,
          version: 1,
          name,
          assetIds: [],
          engine: 'remotion',
          manifest: { version: 1, props: {}, builtin: { kind: 'remotion-caption', preset } },
        },
        code
      );
    }

    const identityFonts = fonts.filter(({ family }) => family === 'Bricolage Grotesque');
    await library.publish(owner.id, {
      kind: 'brand',
      id: 'elfrontend',
      version: 1,
      name: 'ElFrontend',
      assetIds: identityFonts.map(({ assetId }) => assetId),
      fonts: identityFonts,
      values: {
        colors: { accent: '#FF6A3D' },
        typography: { display: { fontFamily: 'Bricolage Grotesque' } },
      },
    });

    console.log(
      `${stylePackIds.length} estilos, ${RemotionCaptionPresetSchema.options.length} componentes de subtítulos, 1 marca.`
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error && !('cause' in error) ? error.message : '';
  console.error('No se pudo sembrar la biblioteca de Studio.', detail);
  process.exitCode = 1;
});
