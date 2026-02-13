import { z } from 'zod';

/**
 * Brand Kit Types
 *
 * Defines the schema and types for a persistent brand kit
 * that customizes subtitle templates with logo, colors, and fonts.
 */

/**
 * Zod schema for brand kit validation
 */
export const BrandKitSchema = z.object({
  // Logo
  logoUrl: z.string().optional(),
  logoPosition: z
    .enum(['top-left', 'top-right', 'bottom-left', 'bottom-right'])
    .default('top-right'),
  logoScale: z.number().min(0.1).max(2).default(1),

  // Colors
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  secondaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  textColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  backgroundColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),

  // Typography
  fontFamily: z.string().optional(),
});

export type BrandKit = z.infer<typeof BrandKitSchema>;

/**
 * Logo position options with labels
 */
export type LogoPosition = BrandKit['logoPosition'];

/**
 * localStorage key for persisting brand kit
 */
export const BRAND_KIT_STORAGE_KEY = 'video-wizard-brand-kit';

/**
 * Predefined font options (web-safe and commonly available)
 */
export const DEFAULT_FONT_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Impact', value: 'Impact, Arial Black, sans-serif' },
  { label: 'Montserrat', value: 'Montserrat, system-ui, sans-serif' },
  { label: 'Helvetica Neue', value: 'Helvetica Neue, Helvetica, sans-serif' },
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Oswald', value: 'Oswald, sans-serif' },
  { label: 'Roboto', value: 'Roboto, sans-serif' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Poppins', value: 'Poppins, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
];
