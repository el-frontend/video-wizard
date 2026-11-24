import { z } from 'zod';
import {
  EngineIdSchema,
  IdSchema,
  JsonObjectSchema,
  type EngineId,
  type JsonValue,
} from './primitives';

type Scalar = string | boolean | number | null;
export type PropsNode =
  | { type: 'string' | 'number' | 'boolean' | 'null'; enum?: Scalar[] }
  | { type: 'array'; items: PropsNode }
  | ObjectProps;
export interface ObjectProps {
  type: 'object';
  properties: Record<string, PropsNode>;
  required?: string[];
  additionalProperties: false;
}
const safeKey = (name: string) =>
  /^[A-Za-z_][A-Za-z0-9_-]{0,95}$/.test(name) &&
  !['constructor', 'prototype', '__proto__'].includes(name);
const plain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const scalarType = (v: unknown) => (v === null ? 'null' : typeof v);
function validSchema(root: unknown): root is ObjectProps {
  let nodes = 0;
  function visit(node: unknown, depth: number): boolean {
    if (++nodes > 256 || depth > 12 || !plain(node)) return false;
    const only = (...keys: string[]) => Object.keys(node).every((k) => keys.includes(k));
    if (node.type === 'object') {
      if (
        !only('type', 'properties', 'required', 'additionalProperties') ||
        node.additionalProperties !== false ||
        !plain(node.properties)
      )
        return false;
      const props = node.properties;
      return (
        Object.entries(props).every(([key, value]) => safeKey(key) && visit(value, depth + 1)) &&
        (node.required === undefined ||
          (Array.isArray(node.required) &&
            new Set(node.required).size === node.required.length &&
            node.required.every((k) => typeof k === 'string' && Object.hasOwn(props, k))))
      );
    }
    if (node.type === 'array') return only('type', 'items') && visit(node.items, depth + 1);
    return (
      ['number', 'boolean', 'string', 'null'].includes(String(node.type)) &&
      only('type', 'enum') &&
      (node.enum === undefined ||
        (Array.isArray(node.enum) &&
          node.enum.length > 0 &&
          node.enum.length <= 64 &&
          node.enum.every(
            (v) => scalarType(v) === node.type && (typeof v !== 'number' || Number.isFinite(v))
          )))
    );
  }
  return plain(root) && root.type === 'object' && visit(root, 0);
}
export function matchesProps(node: PropsNode, value: unknown): boolean {
  if (node.type === 'array')
    return (
      Array.isArray(value) &&
      value.length <= 1024 &&
      value.every((v) => matchesProps(node.items, v))
    );
  if (node.type === 'object')
    return (
      plain(value) &&
      (node.required ?? []).every((k) => Object.hasOwn(value, k)) &&
      Object.entries(value).every(
        ([k, v]) => Object.hasOwn(node.properties, k) && matchesProps(node.properties[k]!, v)
      )
    );
  return (
    scalarType(value) === node.type &&
    (typeof value !== 'number' || Number.isFinite(value)) &&
    (!node.enum || node.enum.includes(value as Scalar))
  );
}
export const componentPath = /^[A-Za-z][\w-]*(\/[A-Za-z][\w-]*)*\.tsx?$/;
export const ComponentManifestSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    engine: EngineIdSchema,
    entry: z.string().max(180).regex(componentPath),
    propsSchema: z.custom<ObjectProps>(
      validSchema,
      'El esquema de propiedades debe ser un objeto cerrado.'
    ),
    initialProps: JsonObjectSchema,
    dependencies: z.array(z.enum(['react', 'remotion', 'gsap', '@studio/visual'])).max(4),
    assetIds: z.array(IdSchema).max(64),
    exposedRoles: z.array(z.string().refine((s) => s.split('.').every(safeKey))).max(64),
    defaultDurationMs: z.int().min(1).max(3600000),
    defaultSize: z.strictObject({
      width: z.int().min(1).max(8192),
      height: z.int().min(1).max(8192),
    }),
    builtin: z.never().optional(),
  })
  .refine((m) => matchesProps(m.propsSchema, m.initialProps), {
    path: ['initialProps'],
    message: 'Las propiedades iniciales no coinciden con el esquema.',
  })
  .refine(
    (m) =>
      m.dependencies.every(
        (d) =>
          d === '@studio/visual' ||
          (m.engine === 'remotion' ? d === 'react' || d === 'remotion' : d === 'gsap')
      ),
    { path: ['dependencies'], message: 'Dependencia incompatible con el motor.' }
  );
export type ComponentManifest = z.infer<typeof ComponentManifestSchema>;
export type ComponentSource = { manifest: ComponentManifest; files: Record<string, string> };
export interface VisualContext {
  canvas: { width: number; height: number; fps: number };
  size: { width: number; height: number };
  durationMs: number;
  appearance: {
    background: string;
    foreground: string;
    accent: string;
    surface: string;
    family: string;
    size: number;
    weight: number;
    lineHeight: number;
  };
  assets: Record<
    string,
    { url: string; mediaType: string; width?: number; height?: number; fontFamily?: string }
  >;
}
export interface VisualInput<P = Record<string, JsonValue>> {
  props: P;
  context: VisualContext;
  timeMs: number;
}
export type VisualTag = 'div' | 'span' | 'strong' | 'p' | 'img';
export type VisualStyle = Record<string, string | number>;
export interface VisualElement {
  readonly id: number;
}
export interface NativeInput<P = Record<string, JsonValue>> {
  props: P;
  context: VisualContext;
  root: VisualElement;
  element(
    parent: VisualElement,
    tag: VisualTag,
    options?: { text?: string; style?: VisualStyle; assetId?: string }
  ): VisualElement;
  timeline: { fromTo(target: VisualElement, from: VisualStyle, to: VisualStyle, at: number): void };
}
export function componentExample(engine: EngineId): ComponentSource {
  const entry = engine === 'remotion' ? 'title.tsx' : 'title.ts';
  const source =
    engine === 'remotion'
      ? 'export default function Title({props,context,timeMs}) { return <div style={{color:context.appearance.foreground,fontSize:32}}>{props.title} {Math.floor(timeMs / 100)}</div>; }'
      : 'export default function Title({root,element,timeline,props,context}) { const title=element(root,"strong",{text:props.title,style:{display:"inline-block",fontSize:"32px",color:context.appearance.foreground}}); timeline.fromTo(title,{x:0},{x:80,duration:context.durationMs/1000,ease:"none"},0); }';
  return {
    manifest: {
      schemaVersion: 1,
      engine,
      entry,
      propsSchema: {
        type: 'object',
        properties: { title: { type: 'string' } },
        required: ['title'],
        additionalProperties: false,
      },
      initialProps: { title: 'Contador' },
      dependencies: engine === 'remotion' ? ['react'] : [],
      assetIds: [],
      exposedRoles: ['colors.foreground'],
      defaultDurationMs: 1000,
      defaultSize: { width: 320, height: 120 },
    },
    files: { [entry]: source },
  };
}
