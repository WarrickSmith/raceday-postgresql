/**
 * Enhanced Jockey Silks Types for v4.7 Race Interface
 * Supports visual identification and color-coded display
 */

// Silk pattern types supported
export type SilkPattern = 
  | 'solid' 
  | 'stripes' 
  | 'hoops' 
  | 'diamond' 
  | 'checked' 
  | 'halved' 
  | 'quartered' 
  | 'cross' 
  | 'spots' 
  | 'seams';

// Silk color data
export interface SilkColor {
  name: string; // e.g., 'Royal Blue', 'Yellow', 'Red'
  hex: string; // hex color code
  rgb: string; // rgb color values
  isLight: boolean; // for text contrast
}

// Complete silk data
export interface JockeySilk {
  silk_id: string;
  created_at: string;
  updated_at: string;
  jockey_name: string;
  primary_color: SilkColor;
  secondary_color?: SilkColor;
  pattern: SilkPattern;
  icon_url?: string; // fallback image URL
  svg_data?: string; // inline SVG for pattern
  description: string; // e.g., "Royal Blue, Yellow Stripes"
}

// Silk display configuration
export interface SilkDisplayConfig {
  size: 'small' | 'medium' | 'large'; // 24px, 32px, 48px
  showPattern: boolean;
  showFallback: boolean; // show image if pattern fails
  highContrast: boolean; // accessibility mode
}

// Silk rendering data for components
export interface SilkRenderData {
  silk_id: string;
  runner_number: number;
  primary_color: string;
  secondary_color?: string;
  pattern: SilkPattern;
  description: string;
  svg_element?: string; // rendered SVG element
  fallback_url?: string;
  accessible: boolean; // meets contrast requirements
}

// Silk cache entry for performance
export interface SilkCacheEntry {
  silk_id: string;
  rendered_svg: string;
  cached_at: string;
  access_count: number;
  expires_at: string;
}

// Silk generation utilities
export interface SilkUtilities {
  generateSvg: (silk: JockeySilk, config: SilkDisplayConfig) => string;
  getContrastRatio: (color1: string, color2: string) => number;
  isAccessible: (primary_color: string, secondary_color?: string) => boolean;
  getCachedSilk: (silk_id: string) => SilkCacheEntry | null;
  cacheSilk: (silk_id: string, svg_data: string) => void;
}

// Silk pattern definitions for rendering
export interface SilkPatternDefinition {
  pattern: SilkPattern;
  svg_template: string;
  requires_secondary_color: boolean;
  description: string;
}

// Enhanced entrant with silk data
export interface EntrantWithSilk {
  entrant_id: string;
  runner_number: number;
  name: string;
  jockey?: string;
  silk?: JockeySilk;
  silk_render?: SilkRenderData;
}


// Default silk configuration for fallback
export const DEFAULT_SILK_CONFIG: SilkDisplayConfig = {
  size: 'medium',
  showPattern: true,
  showFallback: true,
  highContrast: false
};

// Common silk patterns for quick access
export const COMMON_SILK_PATTERNS: Record<SilkPattern, SilkPatternDefinition> = {
  solid: {
    pattern: 'solid',
    svg_template: '<rect width="100%" height="100%" fill="{primaryColor}"/>',
    requires_secondary_color: false,
    description: 'Solid color'
  },
  stripes: {
    pattern: 'stripes',
    svg_template: '<defs><pattern id="stripes" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="4" height="8" fill="{primaryColor}"/><rect x="4" width="4" height="8" fill="{secondaryColor}"/></pattern></defs><rect width="100%" height="100%" fill="url(#stripes)"/>',
    requires_secondary_color: true,
    description: 'Vertical stripes'
  },
  hoops: {
    pattern: 'hoops',
    svg_template: '<defs><pattern id="hoops" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="4" fill="{primaryColor}"/><rect y="4" width="8" height="4" fill="{secondaryColor}"/></pattern></defs><rect width="100%" height="100%" fill="url(#hoops)"/>',
    requires_secondary_color: true,
    description: 'Horizontal hoops'
  },
  diamond: {
    pattern: 'diamond',
    svg_template: '<rect width="100%" height="100%" fill="{primaryColor}"/><polygon points="16,8 24,16 16,24 8,16" fill="{secondaryColor}"/>',
    requires_secondary_color: true,
    description: 'Diamond pattern'
  },
  checked: {
    pattern: 'checked',
    svg_template: '<defs><pattern id="checked" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="4" height="4" fill="{primaryColor}"/><rect x="4" y="4" width="4" height="4" fill="{primaryColor}"/><rect x="4" width="4" height="4" fill="{secondaryColor}"/><rect y="4" width="4" height="4" fill="{secondaryColor}"/></pattern></defs><rect width="100%" height="100%" fill="url(#checked)"/>',
    requires_secondary_color: true,
    description: 'Checkered pattern'
  },
  halved: {
    pattern: 'halved',
    svg_template: '<rect width="50%" height="100%" fill="{primaryColor}"/><rect x="50%" width="50%" height="100%" fill="{secondaryColor}"/>',
    requires_secondary_color: true,
    description: 'Halved vertically'
  },
  quartered: {
    pattern: 'quartered',
    svg_template: '<rect width="50%" height="50%" fill="{primaryColor}"/><rect x="50%" width="50%" height="50%" fill="{secondaryColor}"/><rect y="50%" width="50%" height="50%" fill="{secondaryColor}"/><rect x="50%" y="50%" width="50%" height="50%" fill="{primaryColor}"/>',
    requires_secondary_color: true,
    description: 'Quartered'
  },
  cross: {
    pattern: 'cross',
    svg_template: '<rect width="100%" height="100%" fill="{primaryColor}"/><rect x="12" width="8" height="32" fill="{secondaryColor}"/><rect y="12" width="32" height="8" fill="{secondaryColor}"/>',
    requires_secondary_color: true,
    description: 'Cross pattern'
  },
  spots: {
    pattern: 'spots',
    svg_template: '<rect width="100%" height="100%" fill="{primaryColor}"/><circle cx="8" cy="8" r="2" fill="{secondaryColor}"/><circle cx="24" cy="8" r="2" fill="{secondaryColor}"/><circle cx="16" cy="16" r="2" fill="{secondaryColor}"/><circle cx="8" cy="24" r="2" fill="{secondaryColor}"/><circle cx="24" cy="24" r="2" fill="{secondaryColor}"/>',
    requires_secondary_color: true,
    description: 'Spotted pattern'
  },
  seams: {
    pattern: 'seams',
    svg_template: '<rect width="100%" height="100%" fill="{primaryColor}"/><path d="M8,0 L8,32 M24,0 L24,32" stroke="{secondaryColor}" stroke-width="2"/>',
    requires_secondary_color: true,
    description: 'Seamed pattern'
  }
};