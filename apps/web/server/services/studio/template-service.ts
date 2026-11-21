import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  libraryKey,
  projectPins,
  projectAppearance,
  validateSnapshot,
  type ResolvedDependencies,
} from '@workspace/render-contract';
import {
  EngineIdSchema,
  IdSchema,
  LibraryRefSchema,
  JsonObjectSchema,
  ProjectDraftSchema,
  projectDurationMs,
  supportsStudioEngine,
  validComponentProps,
  type EntryOf,
  type JsonValue,
  type LibraryEntry,
  type ProjectDraft,
  type TemplateSlot,
} from '@workspace/video-project';
import { ValidationError } from '@/server/lib/utils';
import { AssetNotFoundError, type AssetService } from './asset-service';
import { LibraryNotFoundError, type LibraryService } from './library-service';
import { cropDiagnostics } from './short-provenance';
import { ConflictError, type ProjectService } from './project-service';

const instanceInput = z.strictObject({
  templateRef: LibraryRefSchema,
  engine: EngineIdSchema,
  styleRef: LibraryRefSchema.nullable().optional(),
  brandRef: LibraryRefSchema.nullable().optional(),
  content: JsonObjectSchema.default({}),
});
const publishInput = z.strictObject({ name: IdSchema, baseRevision: IdSchema });
function invalid(message: string): never {
  throw new ValidationError(message);
}
function structureDocument(template: EntryOf<'template'>): ProjectDraft {
  const s = template.structure;
  if (!s) invalid('Esta versión de la plantilla no contiene una estructura editable.');
  if (s.scenes.some((scene) => scene.templateRef))
    invalid('La estructura debe contener escenas independientes.');
  const doc = ProjectDraftSchema.safeParse({
    schemaVersion: 1,
    id: randomUUID(),
    title: template.name,
    engine: template.engine,
    canvas: s.canvas,
    scenes: s.scenes,
    globalAudio: s.globalAudio,
    styleRef: s.styleRef,
    assetIds: template.assetIds,
    brandSnapshot: null,
    durationMs: projectDurationMs(s),
  });
  if (!doc.success) invalid('La estructura de escenas o sus identificadores no son válidos.');
  return doc.data;
}
function assignSlot(
  document: ProjectDraft,
  target: TemplateSlot,
  type: string,
  value: JsonValue | undefined,
  libraries: LibraryEntry[]
) {
  const scene = document.scenes.find((s) => s.id === target.sceneId);
  if (target.field === 'headline' || target.field === 'narration') {
    if (!scene || type !== 'string') invalid('El campo editorial requiere una escena y texto.');
    if (typeof value === 'string') {
      scene.editorial ??= {};
      scene.editorial[target.field] = value;
      if (target.field === 'narration')
        for (const layer of scene.layers)
          if (layer.type === 'audio' && layer.take)
            layer.take.stale = layer.take.spokenText !== value;
    }
    return;
  }
  if (!('layerId' in target)) invalid('Destino desconocido.');
  const layer = (target.sceneId === null ? document.globalAudio : scene?.layers)?.find(
    (l) => l.id === target.layerId
  );
  if (!layer) invalid('La capa del campo de contenido no existe.');
  if (target.field === 'prop') {
    if (layer.type !== 'component') invalid('Se necesita una capa de componente.');
    const pin = layer.componentRef;
    const entry = libraries.find((e) => e.id === pin.id && e.version === pin.version);
    if (
      entry?.kind !== 'component' ||
      !Object.hasOwn(entry.manifest.props, target.key) ||
      entry.manifest.props[target.key]?.type !== type
    )
      invalid('La propiedad no coincide con el manifiesto del componente.');
    if (value !== undefined)
      layer.props = Object.fromEntries([...Object.entries(layer.props), [target.key, value]]);
    return;
  }
  if (type !== 'string') invalid('Este destino requiere un valor de texto.');
  if (target.field === 'asset' && 'assetId' in layer) {
    if (typeof value === 'string' && value !== layer.assetId) {
      if (layer.type === 'audio') delete layer.take;
      layer.assetId = value;
      if (!document.assetIds.includes(value)) document.assetIds.push(value);
    }
  } else if (target.field === 'text' && layer.type === 'text') {
    if (typeof value === 'string') layer.text = value;
  } else if (target.field === 'caption' && layer.type === 'captions') {
    const cue = layer.cues.find((c) => c.id === target.cueId);
    if (!cue) invalid('El subtítulo del campo no existe.');
    if (typeof value === 'string' && cue.text !== value) {
      cue.text = value;
      delete cue.words;
    }
  } else invalid('El destino del campo no corresponde a la capa.');
}
function renewIds(doc: ProjectDraft) {
  const ids = new Map<string, string>();
  const layers = [...doc.scenes.flatMap((s) => s.layers), ...doc.globalAudio];
  for (const l of layers) {
    const id = randomUUID();
    ids.set(l.id, id);
    l.id = id;
  }
  for (const scene of doc.scenes) {
    scene.id = randomUUID();
    for (const l of scene.layers)
      if (l.type === 'captions') {
        if (l.sourceAudioLayerId)
          l.sourceAudioLayerId =
            ids.get(l.sourceAudioLayerId) ?? invalid('Falta la pista de audio vinculada.');
        for (const cue of l.cues) cue.id = randomUUID();
      }
  }
}
export class TemplateService {
  constructor(
    private library: Pick<LibraryService, 'get' | 'publish' | 'verifiedComponent'>,
    private projects: Pick<ProjectService, 'get' | 'createFromDocument'>,
    private assets: Pick<AssetService, 'get'>
  ) {}
  private async materialize(
    owner: string,
    template: EntryOf<'template'>,
    input?: z.infer<typeof instanceInput>
  ) {
    const doc = structureDocument(template);
    if (doc.engine !== 'remotion' || (input && doc.engine !== input.engine))
      invalid('La plantilla no tiene implementación para este motor.');
    if (input?.styleRef !== undefined) doc.styleRef = input.styleRef;
    if (input?.brandRef) {
      const brand = await this.library.get(owner, input.brandRef);
      if (brand.kind !== 'brand') invalid('La referencia de marca no es válida.');
      doc.brandSnapshot = { ref: input.brandRef, values: brand.values };
    }
    const libs = await Promise.all(projectPins(doc).map((ref) => this.library.get(owner, ref)));
    if (libs.some((entry) => !supportsStudioEngine(entry, doc.engine)))
      invalid('Una dependencia no dispone de implementación para este motor.');
    for (const entry of libs)
      if (entry.kind === 'component' && !(await this.library.verifiedComponent(owner, entry)))
        invalid('El código del componente no corresponde a una implementación verificada.');
    const slots = template.structure!.slots,
      props = template.manifest.props,
      content = input?.content ?? {};
    if (
      Object.keys(slots).length !== Object.keys(props).length ||
      Object.keys(slots).some((k) => !Object.hasOwn(props, k))
    )
      invalid('Cada campo del manifiesto necesita un destino.');
    if (input && !validComponentProps(content, template.manifest))
      invalid(
        'El contenido incluye campos desconocidos, obligatorios sin completar o de tipo incorrecto.'
      );
    const used = new Set<string>();
    for (const [key, target] of Object.entries(slots)) {
      const identity = JSON.stringify(target);
      if (used.has(identity)) invalid('Hay varios campos para el mismo destino.');
      used.add(identity);
      assignSlot(
        doc,
        target,
        props[key]!.type,
        Object.hasOwn(content, key) ? content[key] : undefined,
        libs
      );
    }
    const dependencies: ResolvedDependencies = {
      libraries: Object.fromEntries(libs.map((e) => [libraryKey(e), e])),
      assets: Object.create(null),
    };
    for (const id of new Set([...doc.assetIds, ...libs.flatMap((e) => e.assetIds)])) {
      const asset = await this.assets.get(owner, id);
      dependencies.assets[id] = {
        id,
        hash: asset.hash,
        name: asset.name,
        mediaType: asset.mediaType,
        width: asset.width,
        height: asset.height,
        durationMs: asset.durationMs,
        hasAudio: asset.hasAudio,
        url: 'media/' + asset.hash,
      };
    }
    const diagnostics = validateSnapshot({
      ownerId: owner,
      revision: 'template',
      document: doc,
      dependencies,
      bundles: {},
      diagnostics: await cropDiagnostics(owner, doc),
    });
    diagnostics.push(...projectAppearance(doc, dependencies).diagnostics);
    for (const scene of doc.scenes)
      for (const layer of scene.layers) {
        if (
          layer.type === 'captions' &&
          layer.templateRef &&
          dependencies.libraries[libraryKey(layer.templateRef)]?.kind !== 'component'
        )
          invalid('Los subtítulos requieren un preset de componente verificado.');
        if (layer.overrides)
          diagnostics.push(...projectAppearance(doc, dependencies, layer).diagnostics);
      }
    const issue = diagnostics.find((d) => d.severity === 'error');
    if (issue) invalid(issue.message);
    return doc;
  }
  async compatible(owner: string, template: EntryOf<'template'>) {
    try {
      await this.materialize(owner, template);
      return true;
    } catch (error) {
      if (
        error instanceof ValidationError ||
        error instanceof AssetNotFoundError ||
        error instanceof LibraryNotFoundError
      )
        return false;
      throw error;
    }
  }
  async publish(owner: string, template: EntryOf<'template'>) {
    await this.materialize(owner, template);
    return this.library.publish(owner, template);
  }
  async prepare(owner: string, data: unknown) {
    const parsed = instanceInput.safeParse(data);
    if (!parsed.success) invalid('La solicitud de instancia no es válida.');
    const input = parsed.data,
      template = await this.library.get(owner, input.templateRef);
    if (template.kind !== 'template') invalid('Se requiere una plantilla.');
    const doc = await this.materialize(owner, template, input);
    renewIds(doc);
    for (const scene of doc.scenes) scene.templateRef = input.templateRef;
    return doc;
  }
  async instantiate(owner: string, data: unknown) {
    return this.projects.createFromDocument(owner, await this.prepare(owner, data));
  }
  async fromProject(owner: string, id: string, data: unknown) {
    const parsed = publishInput.safeParse(data);
    if (!parsed.success) invalid('Indica un nombre y una revisión válida.');
    const record = await this.projects.get(owner, id);
    if (record.revision !== parsed.data.baseRevision) throw new ConflictError(record);
    const d = record.document;
    const scenes = structuredClone(d.scenes);
    for (const scene of scenes) delete scene.templateRef;
    return this.publish(owner, {
      kind: 'template',
      id: randomUUID(),
      version: 1,
      name: parsed.data.name,
      engine: d.engine,
      assetIds: d.assetIds,
      manifest: { version: 1, props: {} },
      structure: {
        version: 1,
        canvas: d.canvas,
        scenes,
        globalAudio: d.globalAudio,
        styleRef: d.styleRef,
        slots: {},
      },
    });
  }
}
