'use client';

import { memo, useMemo, useCallback } from 'react';
import Image from 'next/image';
import type {
  JockeySilk,
  SilkDisplayConfig,
  SilkPattern
} from '@/types/jockeySilks';
import { DEFAULT_SILK_CONFIG, COMMON_SILK_PATTERNS } from '@/types/jockeySilks';

interface JockeySilksProps {
  silk?: JockeySilk;
  runner_number: number;
  runnerName: string;
  jockey?: string;
  fallbackUrl?: string;
  config?: Partial<SilkDisplayConfig>;
  className?: string;
  onClick?: (runner_number: number) => void;
}

// Silk pattern generation utilities
const SilkUtils = {
  // Generate SVG for silk pattern
  generateSvg: (silk: JockeySilk, config: SilkDisplayConfig): string => {
    const size = config.size === 'small' ? 24 : config.size === 'large' ? 48 : 32;
    const pattern = COMMON_SILK_PATTERNS[silk.pattern];
    
    if (!pattern) {
      // Fallback to solid pattern
      return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${silk.primary_color.hex}"/>
      </svg>`;
    }
    
    let svgTemplate = pattern.svg_template;
    svgTemplate = svgTemplate.replace(/\{primaryColor\}/g, silk.primary_color.hex);
    
    if (pattern.requires_secondary_color && silk.secondary_color) {
      svgTemplate = svgTemplate.replace(/\{secondaryColor\}/g, silk.secondary_color.hex);
    } else if (pattern.requires_secondary_color) {
      // Use white as fallback secondary color
      svgTemplate = svgTemplate.replace(/\{secondaryColor\}/g, '#FFFFFF');
    }
    
    return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      ${svgTemplate}
    </svg>`;
  },

  // Check if colors meet accessibility contrast requirements
  getContrastRatio: (color1: string, color2: string): number => {
    // Simplified contrast ratio calculation
    const getLuminance = (hex: string): number => {
      const rgb = parseInt(hex.slice(1), 16);
      const r = (rgb >> 16) & 0xff;
      const g = (rgb >> 8) & 0xff;
      const b = (rgb >> 0) & 0xff;
      
      const normalize = (c: number) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      
      return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
    };
    
    const lum1 = getLuminance(color1);
    const lum2 = getLuminance(color2);
    
    return (Math.max(lum1, lum2) + 0.05) / (Math.min(lum1, lum2) + 0.05);
  },

  // Check if silk meets accessibility requirements
  isAccessible: (primaryColor: string, secondaryColor?: string): boolean => {
    const contrastWithWhite = SilkUtils.getContrastRatio(primaryColor, '#FFFFFF');
    const contrastWithBlack = SilkUtils.getContrastRatio(primaryColor, '#000000');
    
    // Ensure at least 3:1 contrast ratio for UI components
    let hasGoodContrast = contrastWithWhite >= 3 || contrastWithBlack >= 3;
    
    if (secondaryColor) {
      const contrastBetweenColors = SilkUtils.getContrastRatio(primaryColor, secondaryColor);
      hasGoodContrast = hasGoodContrast && contrastBetweenColors >= 2;
    }
    
    return hasGoodContrast;
  },

  // Create fallback color scheme for accessibility
  createAccessibleFallback: (silk: JockeySilk): JockeySilk => {
    const runner_number = parseInt(silk.silk_id.split('-').pop() || '1');
    
    // Generate high-contrast colors based on runner number
    const colors = [
      { name: 'Navy Blue', hex: '#1e3a8a', rgb: '30, 58, 138', isLight: false },
      { name: 'Dark Red', hex: '#dc2626', rgb: '220, 38, 38', isLight: false },
      { name: 'Dark Green', hex: '#16a34a', rgb: '22, 163, 74', isLight: false },
      { name: 'Purple', hex: '#7c3aed', rgb: '124, 58, 237', isLight: false },
      { name: 'Orange', hex: '#ea580c', rgb: '234, 88, 12', isLight: false },
      { name: 'Teal', hex: '#0891b2', rgb: '8, 145, 178', isLight: false },
    ];
    
    const primaryIndex = runner_number % colors.length;
    const secondaryIndex = (runner_number + 3) % colors.length;
    
    return {
      ...silk,
      primary_color: colors[primaryIndex],
      secondary_color: colors[secondaryIndex],
      pattern: 'solid' as SilkPattern,
      description: `High contrast silk ${runner_number}`
    };
  }
};



// Memoized SVG silk component
const SvgSilk = memo(function SvgSilk({ 
  silk, 
  config, 
  className 
}: { 
  silk: JockeySilk; 
  config: SilkDisplayConfig; 
  className?: string; 
}) {
  const svgMarkup = useMemo(() => {
    return SilkUtils.generateSvg(silk, config);
  }, [silk, config]);

  return (
    <div 
      className={`inline-block ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
      title={silk.description}
      aria-label={`Racing silk: ${silk.description}`}
    />
  );
});

// Memoized fallback silk component
const FallbackSilk = memo(function FallbackSilk({ 
  runner_number, 
  config, 
  className 
}: { 
  runner_number: number; 
  config: SilkDisplayConfig; 
  className?: string; 
}) {
  const size = config.size === 'small' ? 'w-6 h-6' : config.size === 'large' ? 'w-12 h-12' : 'w-8 h-8';
  
  // Generate a color based on runner number
  const colors = [
    'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 
    'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-orange-500'
  ];
  const colorClass = colors[runner_number % colors.length];

  return (
    <div 
      className={`${size} rounded border border-gray-300 flex items-center justify-center ${colorClass} ${className}`}
      title={`Runner ${runner_number} - Default silk`}
      aria-label={`Runner ${runner_number} default racing silk`}
    >
      <span className="text-white text-xs font-bold">
        {runner_number}
      </span>
    </div>
  );
});

// Main JockeySilks component
export const JockeySilks = memo(function JockeySilks({
  silk,
  runner_number,
  runnerName,
  jockey,
  fallbackUrl,
  config = {},
  className = '',
  onClick
}: JockeySilksProps) {
  const displayConfig: SilkDisplayConfig = useMemo(() => ({
    ...DEFAULT_SILK_CONFIG,
    ...config
  }), [config]);

  const isAccessible = useMemo(() => {
    if (!silk) return true;
    return SilkUtils.isAccessible(silk.primary_color.hex, silk.secondary_color?.hex);
  }, [silk]);

  const accessibleSilk = useMemo(() => {
    if (!silk || isAccessible || !displayConfig.highContrast) return silk;
    return SilkUtils.createAccessibleFallback(silk);
  }, [silk, isAccessible, displayConfig.highContrast]);

  const handleClick = useCallback(() => {
    if (onClick) {
      onClick(runner_number);
    }
  }, [onClick, runner_number]);

  const silkElement = useMemo(() => {
    // Try to render SVG silk first
    if (accessibleSilk && displayConfig.showPattern) {
      return (
        <SvgSilk 
          silk={accessibleSilk} 
          config={displayConfig} 
          className="transition-transform hover:scale-110"
        />
      );
    }

    // Try fallback image
    if (fallbackUrl && displayConfig.showFallback) {
      const sizeClass = displayConfig.size === 'small' ? 'w-6 h-6' : 
                       displayConfig.size === 'large' ? 'w-12 h-12' : 'w-8 h-8';
      
      return (
        <Image
          src={fallbackUrl}
          alt={`Racing silks for ${runnerName}`}
          width={displayConfig.size === 'small' ? 24 : displayConfig.size === 'large' ? 48 : 32}
          height={displayConfig.size === 'small' ? 24 : displayConfig.size === 'large' ? 48 : 32}
          className={`${sizeClass} rounded border border-gray-200 transition-transform hover:scale-110`}
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    }

    // Final fallback to generated silk
    return (
      <FallbackSilk 
        runner_number={runner_number} 
        config={displayConfig}
        className="transition-transform hover:scale-110"
      />
    );
  }, [accessibleSilk, displayConfig, fallbackUrl, runnerName, runner_number]);

  const containerClassName = useMemo(() => {
    const baseClasses = `inline-flex items-center justify-center ${className}`;
    const cursorClass = onClick ? 'cursor-pointer' : '';
    const highContrastClass = displayConfig.highContrast ? 'filter contrast-125' : '';
    
    return `${baseClasses} ${cursorClass} ${highContrastClass}`.trim();
  }, [className, onClick, displayConfig.highContrast]);

  return (
    <div 
      className={containerClassName}
      onClick={handleClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      } : undefined}
      title={`${runnerName} (${runner_number})${jockey ? ` - ${jockey}` : ''}`}
      aria-label={`Racing silk for ${runnerName}, runner number ${runner_number}${jockey ? `, jockey ${jockey}` : ''}`}
    >
      {silkElement}
      
      {/* Accessibility indicator for high contrast mode */}
      {displayConfig.highContrast && !isAccessible && (
        <span className="sr-only">
          High contrast version of racing silk for better visibility
        </span>
      )}
    </div>
  );
});

// Utility component for displaying multiple silks in a group
export const SilkGroup = memo(function SilkGroup({
  silks,
  config = {},
  className = '',
  onSilkClick
}: {
  silks: Array<{
    silk?: JockeySilk;
    runner_number: number;
    runnerName: string;
    jockey?: string;
    fallbackUrl?: string;
  }>;
  config?: Partial<SilkDisplayConfig>;
  className?: string;
  onSilkClick?: (runner_number: number) => void;
}) {
  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {silks.map(({ silk, runner_number, runnerName, jockey, fallbackUrl }) => (
        <JockeySilks
          key={runner_number}
          silk={silk}
          runner_number={runner_number}
          runnerName={runnerName}
          jockey={jockey}
          fallbackUrl={fallbackUrl}
          config={config}
          onClick={onSilkClick}
        />
      ))}
    </div>
  );
});

export default JockeySilks;
