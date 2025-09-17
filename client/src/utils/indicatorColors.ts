import type { CSSProperties } from 'react'

/**
 * Mapping of known indicator colors to utility class fallbacks.
 * This allows Tailwind to pick up the classes at build time while
 * still supporting arbitrary user-provided hex values at runtime.
 */
const KNOWN_COLOR_CLASS_MAP: Record<string, string> = {
  '#e5e7eb': 'bg-gray-200',
  '#bfdbfe': 'bg-blue-200',
  '#fef3c7': 'bg-amber-100',
  '#bbf7d0': 'bg-green-200',
  '#fecaca': 'bg-red-200',
  '#f3e8ff': 'bg-purple-100',
}

const BASE_CLASSES =
  'transition-colors duration-200 ease-in-out rounded-sm text-gray-900'

const HEX_COLOR_REGEX = /^#([0-9a-f]{6})$/i

const luminanceForChannel = (channel: number): number => {
  const proportion = channel / 255
  return proportion <= 0.03928
    ? proportion / 12.92
    : Math.pow((proportion + 0.055) / 1.055, 2.4)
}

const getRelativeLuminance = (hexColor: string): number => {
  const match = hexColor.match(HEX_COLOR_REGEX)
  if (!match) {
    return 0 // Default to darker to keep text readable
  }

  const value = parseInt(match[1], 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff

  const luminance =
    0.2126 * luminanceForChannel(r) +
    0.7152 * luminanceForChannel(g) +
    0.0722 * luminanceForChannel(b)

  return luminance
}

export interface IndicatorCellStyle {
  className: string
  style?: CSSProperties
}

const normalizeHex = (color: string): string | null => {
  if (!color) return null
  const trimmed = color.trim()
  if (HEX_COLOR_REGEX.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  return null
}

const buildDynamicStyle = (color: string): IndicatorCellStyle => {
  return {
    className: BASE_CLASSES,
    style: { backgroundColor: color },
  }
}

export const mapIndicatorColorToCellStyle = (
  color?: string
): IndicatorCellStyle | null => {
  const normalized = color ? normalizeHex(color) : null
  if (!normalized) {
    return null
  }

  const fallbackClass = KNOWN_COLOR_CLASS_MAP[normalized]
  if (fallbackClass) {
    return {
      className: `${BASE_CLASSES} ${fallbackClass}`.trim(),
    }
  }

  return buildDynamicStyle(normalized)
}

export const indicatorColorTestUtils = {
  normalizeHex,
  getRelativeLuminance,
}

export default mapIndicatorColorToCellStyle
