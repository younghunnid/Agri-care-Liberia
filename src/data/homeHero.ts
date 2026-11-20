/**
 * Homepage hero photograph. To use your own photo, replace the two files in public/images/home/ (same names)
 * or point `srcSet`/`src` at new files. Recommended: landscape, subject on the right, 1280 px wide (about 150 KB as WebP)
 * and a 640 px version for phones. The text sits on a dark-green overlay, so any bright photo stays readable.
 */
export const HERO_IMAGE = {
  src: '/images/home/hero-1280.webp',
  srcSet: '/images/home/hero-640.webp 640w, /images/home/hero-1280.webp 1280w',
  sizes: '100vw',
  alt: 'Liberian smallholder farmers tending green cassava and rice plots',
  /** CSS object-position: keeps the subject visible when the photo is cropped on narrow screens. */
  position: '70% center',
} as const;
