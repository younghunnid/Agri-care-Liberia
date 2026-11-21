import hero640 from '../assets/brand/hero-640.webp';
import hero960 from '../assets/brand/hero-960.webp';
import hero1280 from '../assets/brand/hero-1280.webp';
import hero1600 from '../assets/brand/hero-1600.webp';

/**
 * Homepage hero photograph (assets-source/brand/hero.JPG, regenerated into src/assets/brand/ by scripts/generate-brand-assets.py).
 * Imported through Vite so the files are content-hashed: a replaced photograph is never served from an old cache.
 * To use another photograph: replace assets-source/brand/hero.JPG and run the script; no other change is needed.
 */
export const HERO_IMAGE = {
  src: hero1280,
  srcSet: `${hero640} 640w, ${hero960} 960w, ${hero1280} 1280w, ${hero1600} 1600w`,
  sizes: '100vw',
  width: 1600,
  height: 900,
  alt: 'A Liberian farmer using a tablet in a green field with cattle, a goat and fresh produce',
} as const;
