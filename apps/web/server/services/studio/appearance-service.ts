import { AppearanceRoleSchema, type Diagnostic, type JsonValue } from '@workspace/video-project';

type Tokens = Record<string, JsonValue>;

interface AppearanceLayer {
  tokens: Tokens;
  exposedRoles?: readonly string[];
}

interface ContrastRule {
  foreground: string;
  background: string;
  min: number;
}

interface NumericLimit {
  role: string;
  min: number;
  max: number;
}

interface AppearanceInput {
  defaults: AppearanceLayer & {
    contrast?: readonly ContrastRule[];
    limits?: readonly NumericLimit[];
  };
  style?: AppearanceLayer;
  brand?: { values: Tokens };
  overrides?: Tokens;
}

export interface ResolvedAppearance {
  tokens: Tokens;
  diagnostics: Diagnostic[];
}

function isObject(value: JsonValue | undefined): value is Tokens {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ownValue(tokens: Tokens, key: string) {
  return Object.hasOwn(tokens, key) ? tokens[key] : undefined;
}

function mergeTokens(base: Tokens, changes: Tokens): Tokens {
  const result = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    const original = ownValue(base, key);
    Object.defineProperty(result, key, {
      value: isObject(value) && isObject(original) ? mergeTokens(original, value) : value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  return result;
}

function readRole(tokens: Tokens, role: string) {
  let value: JsonValue | undefined = tokens;
  for (const key of role.split('.')) {
    value = isObject(value) ? ownValue(value, key) : undefined;
  }
  return value;
}

function brandTokens(
  values: Tokens,
  base: JsonValue | undefined,
  roles: ReadonlySet<string>,
  diagnostics: Diagnostic[],
  prefix = ''
): Tokens {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]): [string, JsonValue][] => {
      const role = prefix + key;
      if (!key.includes('.') && AppearanceRoleSchema.safeParse(role).success) {
        const original = isObject(base) ? ownValue(base, key) : undefined;
        if (isObject(value) && (isObject(original) || original === undefined)) {
          const children = brandTokens(value, original, roles, diagnostics, role + '.');
          return Object.keys(children).length ? [[key, children]] : [];
        }
        if (!isObject(value) && !isObject(original) && roles.has(role)) return [[key, value]];
      }
      diagnostics.push({
        severity: 'warning',
        code: 'brand-role-ignored',
        message: `La marca no puede modificar el rol «${role}».`,
      });
      return [];
    })
  );
}

function luminance(color: JsonValue | undefined) {
  if (typeof color !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) {
    return undefined;
  }
  const hex =
    color.length === 4
      ? color
          .slice(1)
          .split('')
          .map((channel) => channel.repeat(2))
          .join('')
      : color.slice(1);
  const weights = [0.2126, 0.7152, 0.0722];
  return weights.reduce((sum, weight, index) => {
    const position = index * 2;
    const srgb = parseInt(hex.slice(position, position + 2), 16) / 255;
    const linear = srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
    return sum + weight * linear;
  }, 0);
}

export function resolveAppearance({
  defaults,
  style,
  brand,
  overrides = {},
}: AppearanceInput): ResolvedAppearance {
  const diagnostics: Diagnostic[] = [];
  let tokens = mergeTokens(defaults.tokens, style?.tokens ?? {});
  if (brand) {
    const styleRoles = new Set(style?.exposedRoles);
    const roles = new Set(defaults.exposedRoles?.filter((role) => !style || styleRoles.has(role)));
    tokens = mergeTokens(tokens, brandTokens(brand.values, tokens, roles, diagnostics));
  }
  tokens = mergeTokens(tokens, overrides);

  for (const { foreground, background, min } of defaults.contrast ?? []) {
    const light = luminance(readRole(tokens, foreground));
    const dark = luminance(readRole(tokens, background));
    const ratio =
      light === undefined || dark === undefined
        ? undefined
        : (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    if (ratio === undefined || ratio < min) {
      diagnostics.push({
        severity: 'error',
        code: 'appearance-contrast',
        message: `Los roles «${foreground}» y «${background}» requieren un contraste de al menos ${min}:1.`,
      });
    }
  }

  for (const { role, min, max } of defaults.limits ?? []) {
    const value = readRole(tokens, role);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      diagnostics.push({
        severity: 'error',
        code: 'appearance-limit',
        message: `El rol «${role}» debe estar entre ${min} y ${max}.`,
      });
    }
  }

  return { tokens, diagnostics };
}
