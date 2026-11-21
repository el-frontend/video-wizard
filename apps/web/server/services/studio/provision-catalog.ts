import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { captionSource, packagesDirectory } from './catalog-source';
import { initialTemplates } from './initial-templates';
import type { db as database } from '@/server/db';
import { loadStylePack, stylePackFonts, stylePackIds } from '@workspace/style-packs';
import { RemotionCaptionPresetSchema } from '@workspace/video-project';
import type { CaptionTemplate } from '@workspace/remotion-compositions';
import { AssetService } from '@/server/services/studio/asset-service';
import { LibraryService } from '@/server/services/studio/library-service';

const captionPresets = {
  default: { name: 'Predeterminado' },
  viral: { name: 'Viral' },
  minimal: { name: 'Minimalista' },
  modern: { name: 'Moderno' },
  highlight: { name: 'Resaltado' },
  colorshift: { name: 'Cambio de color' },
  hormozi: { name: 'Hormozi' },
  mrbeast: { name: 'MrBeast' },
  mrbeastemoji: { name: 'MrBeast con emojis' },
} satisfies Record<CaptionTemplate, { name: string }>;

export async function provisionCatalog(db: typeof database, ownerId: string) {
  const assets = new AssetService(db);
  const library = new LibraryService(db);
  const fonts = await Promise.all(
    stylePackFonts.map(async ({ family, filename, weight }) => {
      const asset = await assets.ingest(ownerId, {
        filename,
        mediaType: 'font/woff2',
        stream: createReadStream(join(packagesDirectory(), 'style-packs/packs/fonts', filename)),
      });
      return { assetId: asset.id, family, weight };
    })
  );
  const assetIds = fonts.map(({ assetId }) => assetId);

  for (const id of stylePackIds) {
    const archived = {
      ...(await loadStylePack(id, join(packagesDirectory(), 'style-packs/packs', id, 'frame.md'))),
      assetIds,
      fonts,
    };
    await library.publish(ownerId, archived);
    await library.publish(ownerId, { ...archived, version: 2, engines: ['remotion'] });
  }

  for (const preset of RemotionCaptionPresetSchema.options) {
    const { name } = captionPresets[preset];
    const code = await captionSource(preset);
    await library.publish(
      ownerId,
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
  await library.publish(ownerId, {
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

  const templates = initialTemplates();
  for (const template of templates) await library.publish(ownerId, template);
  return {
    styles: stylePackIds.length,
    components: RemotionCaptionPresetSchema.options.length,
    brands: 1,
    templates: templates.length,
  };
}
