'use client';
import { useState } from 'react';
import { FileImage, Layers3, LayoutTemplate, Palette, Stamp, Upload } from 'lucide-react';
import {
  type EngineId,
  type LibraryKind,
  type LibraryEntry,
  type EntryOf,
  supportsStudioEngine,
} from '@workspace/video-project';
import { useLibrary, useAssetPage, sectionNames, post, pin, keyOf } from '../hooks/use-library';
import { uploadEditorAsset } from '@/features/studio-designer/hooks/use-editor-dependencies';
import { BrandEditor } from './brand-editor';
import { StyleEditor } from './style-editor';
import { TemplateEditor, InstantiateForm } from './template-editor';
import { useIdentity, type Publish, object } from './edition-fields';

const icons = { component: Layers3, template: LayoutTemplate, style: Palette, brand: Stamp };
const singular = {
  component: 'componente',
  template: 'plantilla',
  style: 'estilo',
  brand: 'marca',
};
function ComponentEditor({
  engine,
  entry,
  versions,
  publish,
}: {
  entry?: EntryOf<'component'>;
  engine: EngineId;
  versions: number;
  publish: Publish;
}) {
  const library = useLibrary('component', engine),
    identity = useIdentity(entry, versions);
  const [source, setSource] = useState(entry ? keyOf(entry) : '');
  return (
    <form
      className="library-fields"
      onSubmit={(e) => {
        e.preventDefault();
        const base = library.entries.find((s) => keyOf(s) === source);
        if (base)
          void publish('/api/studio/library-editions', {
            ...identity.data(),
            kind: 'component',
            sourceRef: pin(base),
          });
      }}
    >
      {identity.fields}
      <label>
        Implementación de subtítulos
        <select required value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Selecciona un preset</option>
          {library.entries.map((row) => (
            <option key={keyOf(row)} value={keyOf(row)}>
              {row.name} · v{row.version}
            </option>
          ))}
        </select>
      </label>
      <button className="studio-primary" disabled={!library.entries.length}>
        Publicar componente
      </button>
    </form>
  );
}
export function LibraryBrowser({ kind, initialId }: { kind: LibraryKind; initialId?: string }) {
  const [generation, setGeneration] = useState(0);
  const [engine, setEngine] = useState<EngineId | ''>(''),
    library = useLibrary(kind, engine || undefined, { generation }),
    unfiltered = useLibrary(kind, undefined, { enabled: !!engine, generation }),
    all = engine ? unfiltered : library;
  const [selection, setSelection] = useState(initialId ?? ''),
    [version, setVersion] = useState<number | null>(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(false);
  const first = [...new Set(library.entries.map((e) => e.id))].map(
    (id) => library.entries.find((e) => e.id === id)!
  );
  const currentId = first.some((e) => e.id === selection) ? selection : first[0]?.id;
  const versions = library.entries.filter((e) => e.id === currentId);
  const selected = creating
    ? undefined
    : (versions.find((e) => e.version === version) ?? versions[0]);
  const verifiedTemplates = useLibrary(
    'template',
    selected?.kind === 'template' ? selected.engine : 'remotion',
    {
      enabled: kind === 'template' && !engine,
      generation,
    }
  );
  const canInstantiate =
    selected?.kind === 'template' &&
    supportsStudioEngine(selected, selected.engine) &&
    (!!engine || verifiedTemplates.entries.some((t) => keyOf(t) === keyOf(selected)));
  const next = selected
    ? Math.max(
        ...all.entries.filter((e) => e.id === selected.id).map((e) => e.version),
        selected.version
      ) + 1
    : 1;
  async function provision() {
    setBusy(true);
    setError('');
    try {
      await post('/api/studio/catalog', {});
      setGeneration((n) => n + 1);
      setCreating(false);
      setNotice('Catálogo inicial instalado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo instalar el catálogo.');
    } finally {
      setBusy(false);
    }
  }
  const publish: Publish = async (url, data) => {
    setError('');
    setBusy(true);
    try {
      const row = await post<LibraryEntry>(url, data);
      setEngine('');
      setCreating(false);
      setSelection(row.id);
      setVersion(row.version);
      setNotice(row.name + ' · v' + row.version + ' publicada.');
      setGeneration((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo publicar la edición.');
    } finally {
      setBusy(false);
    }
  };
  const Icon = icons[kind],
    hasEntries = all.entries.length > 0;
  const showEditor = selected || creating;
  return (
    <section className="studio-workspace" lang="es">
      <header className="studio-heading library-heading">
        <h1>{sectionNames[kind]}</h1>
        <button
          className="studio-primary"
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(true);
            setError('');
            setNotice('');
          }}
        >
          Crear {singular[kind]}
        </button>
      </header>
      <div className="library-layout">
        <section aria-label="Catálogo">
          <div className="library-toolbar">
            <h2>Mi biblioteca</h2>
            {kind !== 'brand' && (
              <label>
                Motor
                <select
                  value={engine}
                  onChange={(e) => {
                    setEngine(e.target.value as typeof engine);
                    setCreating(false);
                    setVersion(null);
                  }}
                >
                  <option value="">Todos</option>
                  <option value="remotion">Remotion</option>
                  <option value="hyperframes">HyperFrames</option>
                </select>
              </label>
            )}
          </div>
          {library.loading ? (
            <p role="status">Cargando biblioteca…</p>
          ) : !first.length ? (
            <p className="studio-empty-library">
              {engine
                ? 'No hay versiones verificadas para este motor.'
                : 'Aún no hay entradas en esta biblioteca.'}
            </p>
          ) : (
            <ul className="project-list">
              {first.map((row) => {
                const palette = object(
                  row.kind === 'style'
                    ? row.tokens.colors
                    : row.kind === 'brand'
                      ? row.values.colors
                      : undefined
                );
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      className="project-row library-row"
                      aria-pressed={!creating && row.id === currentId}
                      onClick={() => {
                        setSelection(row.id);
                        setVersion(null);
                        setCreating(false);
                        setEditing(false);
                        setError('');
                        setNotice('');
                      }}
                    >
                      <span className="project-symbol">
                        <Icon size={20} />
                      </span>
                      <span className="project-row-title">
                        <strong>{row.name}</strong>
                        <small>
                          {row.kind === 'template' && row.structure
                            ? row.structure.scenes.length +
                              (row.structure.scenes.length === 1 ? ' escena' : ' escenas')
                            : row.kind === 'component' && row.manifest.builtin
                              ? 'Preset de subtítulos'
                              : sectionNames[kind]}{' '}
                          · v{row.version}
                        </small>
                      </span>
                      {typeof palette.accent === 'string' &&
                        /^#[0-9a-f]{6}$/i.test(palette.accent) && (
                          <span
                            className="library-swatch"
                            style={{ backgroundColor: palette.accent }}
                            title={palette.accent}
                          />
                        )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!all.loading && !all.error && !hasEntries && (
            <button
              type="button"
              className="studio-secondary"
              disabled={busy}
              onClick={() => void provision()}
            >
              Instalar catálogo inicial
            </button>
          )}
          {hasEntries && (
            <details className="library-install">
              <summary>Catálogo inicial</summary>
              <button
                type="button"
                className="studio-secondary"
                disabled={busy}
                onClick={() => void provision()}
              >
                Instalar catálogo inicial
              </button>
            </details>
          )}
          {(all.error || library.error) && (
            <p role="alert" className="studio-warning">
              {all.error || library.error}
            </p>
          )}
        </section>
        {showEditor && (
          <section
            className="library-detail"
            aria-label="Edición de biblioteca"
            key={selected ? keyOf(selected) : 'new'}
          >
            <h2>{selected?.name ?? 'Crear ' + singular[kind]}</h2>
            {selected && (
              <label>
                Versión
                <select
                  value={selected.version}
                  onChange={(e) => {
                    setVersion(Number(e.target.value));
                    setError('');
                  }}
                >
                  {versions.map((v) => (
                    <option value={v.version} key={v.version}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <fieldset disabled={busy} className="library-body">
              {selected?.kind === 'style' && (
                <p className="edit-note">
                  {selected.engines?.some((e) => supportsStudioEngine(selected, e))
                    ? 'Implementación disponible · ' +
                      selected.engines
                        .filter((e) => supportsStudioEngine(selected, e))
                        .map((e) => (e === 'hyperframes' ? 'HyperFrames' : 'Remotion'))
                        .join(' · ')
                    : 'Referencia archivada · sin implementación verificada'}
                </p>
              )}
              {kind === 'style' && (
                <StyleEditor
                  entry={selected?.kind === 'style' ? selected : undefined}
                  nextVersion={next}
                  publish={publish}
                />
              )}
              {kind === 'brand' && (
                <BrandEditor
                  entry={selected?.kind === 'brand' ? selected : undefined}
                  nextVersion={next}
                  publish={publish}
                />
              )}
              {kind === 'component' && (
                <ComponentEditor
                  engine={selected?.kind === 'component' ? selected.engine : engine || 'remotion'}
                  entry={selected?.kind === 'component' ? selected : undefined}
                  versions={next}
                  publish={publish}
                />
              )}
              {kind === 'template' && (
                <>
                  {selected?.kind === 'template' && (
                    <div className="library-mode">
                      <button
                        className="edit-button"
                        type="button"
                        aria-pressed={!editing}
                        onClick={() => setEditing(false)}
                      >
                        Usar plantilla
                      </button>
                      <button
                        className="edit-button"
                        type="button"
                        aria-pressed={editing}
                        onClick={() => setEditing(true)}
                      >
                        Editar plantilla
                      </button>
                    </div>
                  )}
                  {selected?.kind === 'template' && !editing ? (
                    !engine && verifiedTemplates.loading ? (
                      <p role="status">Comprobando la plantilla…</p>
                    ) : canInstantiate ? (
                      <InstantiateForm entry={selected} />
                    ) : (
                      <p>Esta versión carece de una implementación editable disponible.</p>
                    )
                  ) : (
                    <TemplateEditor
                      engine={
                        selected?.kind === 'template' ? selected.engine : engine || 'remotion'
                      }
                      entry={selected?.kind === 'template' ? selected : undefined}
                      nextVersion={next}
                      publish={publish}
                    />
                  )}
                </>
              )}
            </fieldset>
          </section>
        )}
      </div>
      {error && (
        <p role="alert" className="studio-warning">
          {error}
        </p>
      )}
      <p role="status" className="library-notice">
        {busy ? 'Guardando…' : notice}
      </p>
    </section>
  );
}
export function AssetBrowser() {
  const [media, setMedia] = useState(''),
    page = useAssetPage(media || undefined),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  return (
    <section className="studio-workspace" lang="es">
      <header className="studio-heading">
        <h1>Recursos</h1>
      </header>
      <div className="library-layout">
        <section>
          <div className="library-toolbar">
            <h2>Archivos del estudio</h2>
            <label>
              Tipo
              <select value={media} onChange={(e) => setMedia(e.target.value)}>
                <option value="">Todos</option>
                <option value="image">Imagen</option>
                <option value="video">Video</option>
                <option value="audio">Audio</option>
                <option value="font">Fuente</option>
              </select>
            </label>
          </div>
          <ul className="project-list">
            {page.items.map((a) => (
              <li className="project-row" key={a.id}>
                <span className="project-symbol">
                  <FileImage size={20} />
                </span>
                <span className="project-row-title">
                  <strong>{a.name}</strong>
                  <small>
                    {a.mediaType}
                    {a.width && a.height ? ' · ' + a.width + ' × ' + a.height : ''}
                    {a.durationMs ? ' · ' + a.durationMs + ' ms' : ''}
                  </small>
                </span>
                <a className="edit-button" href={'/api/studio/assets/' + a.id} download={a.name}>
                  Descargar
                </a>
              </li>
            ))}
          </ul>
          {!page.items.length && !page.busy && (
            <p className="studio-empty-library">No hay archivos de este tipo.</p>
          )}
          {page.cursor && (
            <button
              type="button"
              className="studio-secondary"
              disabled={page.busy}
              onClick={page.more}
            >
              Cargar más recursos
            </button>
          )}
        </section>
        <section className="library-detail">
          <h2>Subir recurso</h2>
          <label className="edit-button edit-upload">
            <Upload aria-hidden="true" size={16} />
            Seleccionar archivo
            <input
              disabled={uploading}
              type="file"
              accept="image/*,audio/*,video/*,.woff2,.woff,.ttf,.otf,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setUploading(true);
                setError('');
                try {
                  const a = await uploadEditorAsset(file, new AbortController().signal);
                  page.reload();
                  setNotice('Archivo guardado · ' + a.name);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : 'No se pudo subir el archivo.');
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </section>
      </div>
      <p role="status">{uploading ? 'Subiendo archivo…' : notice}</p>
      {(error || page.error) && <p role="alert">{error || page.error}</p>}
    </section>
  );
}
