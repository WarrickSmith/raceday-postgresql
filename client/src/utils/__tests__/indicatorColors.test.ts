import mapIndicatorColorToCellStyle from '@/utils/indicatorColors'

describe('mapIndicatorColorToCellStyle', () => {
  it('returns Tailwind class mapping for known colors without inline style', () => {
    const style = mapIndicatorColorToCellStyle('#BFDBFE')

    expect(style).not.toBeNull()
    expect(style?.className).toContain('bg-blue-200')
    expect(style?.className).toContain('transition-colors')
    expect(style?.className).toContain('text-gray-900')
    expect(style?.style).toBeUndefined()
  })

  it('falls back to inline styles for custom colors and keeps text readable', () => {
    const style = mapIndicatorColorToCellStyle('#ffdd00')

    expect(style).not.toBeNull()
    expect(style?.className).toContain('transition-colors')
    expect(style?.style).toEqual({ backgroundColor: '#ffdd00' })
    expect(style?.className.includes('text-gray-900')).toBe(true)
  })

  it('keeps grid text black even for darker custom colors', () => {
    const style = mapIndicatorColorToCellStyle('#111111')

    expect(style).not.toBeNull()
    expect(style?.className).toContain('text-gray-900')
  })
})
