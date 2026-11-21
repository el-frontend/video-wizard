'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Scissors, Upload } from 'lucide-react';
import { RangeEditor } from './range-editor';
import { useShorts } from '../hooks/use-shorts';
function clock(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return (
    Math.floor(seconds / 60) +
    ':' +
    String(seconds % 60).padStart(2, '0') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
}
export function ShortsWorkspace() {
  const studio = useShorts(),
    video = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState('');
  const asset = studio.asset;
  return (
    <section lang="es" className="studio-workspace shorts-workspace">
      <header className="studio-heading library-heading">
        <h1>Shorts</h1>
        {asset && (
          <button
            type="button"
            className="edit-button"
            disabled={!!studio.busy}
            onClick={studio.reset}
          >
            Cambiar video
          </button>
        )}
      </header>
      {studio.error && (
        <p className="shorts-error" role="alert">
          {studio.error}
        </p>
      )}
      <p role="status" aria-live="polite" className="shorts-status">
        {studio.busy}
      </p>
      {!asset ? (
        <div className="shorts-import">
          <section>
            <h2>Video de origen</h2>
            <p>Elige un video para marcar los fragmentos que quieras editar.</p>
            <label className="edit-upload studio-primary">
              <Upload size={18} aria-hidden="true" />
              Cargar video
              <input
                aria-label="Cargar video"
                type="file"
                disabled={!!studio.busy}
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void studio.load(file);
                  e.target.value = '';
                }}
              />
            </label>
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void studio.load(url);
            }}
          >
            <label>
              Enlace de YouTube
              <input
                type="text"
                inputMode="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
            </label>
            <button className="edit-button" disabled={!!studio.busy} type="submit">
              Importar enlace
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="shorts-layout">
            <section className="shorts-source">
              <h2>{asset.name}</h2>
              <video
                key={asset.id}
                ref={video}
                controls
                playsInline
                preload="metadata"
                aria-label="Video de origen"
                src={'/api/studio/assets/' + asset.id}
              />
              <p className="shorts-duration">
                {clock(asset.durationMs!)}{' '}
                <span>
                  · {asset.width} × {asset.height}
                </span>
              </p>
              <div className="shorts-transcript">
                <h2>Transcripción</h2>
                {asset.hasAudio ? (
                  <>
                    {!studio.transcribed && (
                      <p>Puedes añadir subtítulos antes de crear los proyectos.</p>
                    )}
                    <button
                      className="edit-button"
                      type="button"
                      disabled={!!studio.busy}
                      onClick={() => void studio.transcribe()}
                    >
                      {studio.transcribed ? 'Volver a transcribir' : 'Transcribir audio'}
                    </button>
                    {studio.transcribed &&
                      (studio.cues.length ? (
                        <ol>
                          {studio.cues.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (video.current) video.current.currentTime = c.startMs / 1000;
                                }}
                                aria-label={'Ir a ' + clock(c.startMs)}
                              >
                                {clock(c.startMs)}
                              </button>
                              <span>{c.text}</span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p>La transcripción no encontró voz.</p>
                      ))}
                  </>
                ) : (
                  <p>
                    El video no tiene pista de audio. Puedes crear los fragmentos sin subtítulos.
                  </p>
                )}
              </div>
            </section>
            <RangeEditor
              key={asset.id}
              duration={asset.durationMs!}
              position={() => Math.round((video.current?.currentTime ?? 0) * 1000)}
              busy={!!studio.busy}
              create={studio.create}
            />
          </div>
          {studio.projects.length > 0 && (
            <section className="shorts-results" aria-label="Proyectos creados">
              <h2>Proyectos creados</h2>
              <ul>
                {studio.projects.map((p) => (
                  <li className="project-row" key={p.document.id}>
                    <Scissors size={18} aria-hidden="true" />
                    <span className="project-row-title">
                      <strong>{p.document.title}</strong>
                      <small>{clock(p.document.durationMs)}</small>
                    </span>
                    <Link className="edit-button" href={'/designer/' + p.document.id}>
                      Abrir en diseñador
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </section>
  );
}
