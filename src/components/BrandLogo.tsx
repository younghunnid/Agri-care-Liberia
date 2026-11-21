import React from 'react';
import emblem128 from '../assets/brand/logo-emblem-128.webp';
import emblem256 from '../assets/brand/logo-emblem-256.webp';
import emblem512 from '../assets/brand/logo-emblem-512.webp';
import full512 from '../assets/brand/logo-full-512.webp';
import full1024 from '../assets/brand/logo-full-1024.webp';

const NAME = 'Agricare Liberia';

/**
 * Official Agricare Liberia logo, made from assets-source/brand/logo.JPG (see scripts/generate-brand-assets.py).
 *  - `mark`: the Liberia-shaped emblem as a transparent image, so it sits on light or dark backgrounds. Height is set by `className` (default 36 px).
 *  - `full`: the complete logo artwork. It is opaque (the original is a JPEG on a flat near-white background), so it is shown on its own light panel.
 * Width and height follow the image ratio (never stretched or cropped). `decorative` hides it from screen readers when the name is written next to it.
 */
export const BrandLogo: React.FC<{variant?: 'mark' | 'full'; className?: string; decorative?: boolean}> = ({variant = 'mark', className, decorative = false}) => {
  const alt = decorative ? '' : `${NAME} logo`;
  if (variant === 'full') {
    return (
      <img src={full1024} srcSet={`${full512} 512w, ${full1024} 1024w`} sizes="(max-width: 640px) 90vw, 420px" width={1024} height={683} alt={alt}
        className={`h-auto w-full max-w-[420px] rounded-2xl bg-[#F7F7F7] object-contain ${className ?? ''}`} decoding="async" />
    );
  }
  return (
    <img src={emblem256} srcSet={`${emblem128} 116w, ${emblem256} 232w, ${emblem512} 464w`} sizes="48px" width={232} height={256} alt={alt}
      className={`aspect-[232/256] w-auto object-contain ${className ?? 'h-9'}`} decoding="async" />
  );
};
