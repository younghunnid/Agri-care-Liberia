#!/usr/bin/env python3
"""
Regenerates the Agricare Liberia brand images from the two original photographs in assets-source/brand/.

    python3 scripts/generate-brand-assets.py          (needs Pillow: pip install pillow)

Inputs   assets-source/brand/hero.JPG   (homepage photograph, 1600x900)
         assets-source/brand/logo.JPG   (full logo artwork on a flat near-white background; JPEG has NO transparency)
Outputs  src/assets/brand/   hero-*.webp, logo-full-*.webp, logo-emblem-*.webp   (imported through Vite, so they are content-hashed)
         public/             favicon-*.png, apple-touch-icon.png, pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png

The emblem (the Liberia-shaped mark with the wordmark) is cut out of the logo by flood-filling the flat background from the corners,
removing the thin connector arcs, and keeping the shape that contains the centre. The result is a real transparent image.
The originals are never modified. The icons that were in public/ before are kept in assets-source/previous-brand/.
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets-source', 'brand')
OUT = os.path.join(ROOT, 'src', 'assets', 'brand')
PUB = os.path.join(ROOT, 'public')
os.makedirs(OUT, exist_ok=True)
WHITE = (255, 255, 255)

def save_webp(im, name, q, **kw):
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=q, method=6, **kw)
    print(f'{name:28s} {im.size[0]}x{im.size[1]}  {os.path.getsize(path) // 1024} KB')

# ---- hero: responsive widths, no distortion (same aspect ratio), high quality
hero = Image.open(os.path.join(SRC, 'hero.JPG')).convert('RGB')
for w, q in ((640, 80), (960, 80), (1280, 80), (1600, 82)):
    save_webp(hero.resize((w, round(hero.height * w / hero.width)), Image.LANCZOS), f'hero-{w}.webp', q)

# ---- full logo (opaque: keeps its own flat background)
logo = Image.open(os.path.join(SRC, 'logo.JPG')).convert('RGB')
for w in (512, 1024):
    save_webp(logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS), f'logo-full-{w}.webp', 88)

# ---- emblem: cut the map-shaped mark out of the flat background
W, H = logo.size
bg = Image.new('RGB', logo.size, (247, 247, 247))
bglike = ImageChops.difference(logo, bg).convert('L').point(lambda v: 255 if v <= 10 else 0)
outside = bglike.copy()
for xy in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1)):
    if outside.getpixel(xy) == 255:
        ImageDraw.floodfill(outside, xy, 128)
fg = outside.point(lambda v: 255 if v != 128 else 0)
K = 31
core = fg.filter(ImageFilter.MinFilter(K))
seed = (765, 520)
assert core.getpixel(seed) == 255, 'seed point is not inside the emblem; adjust it'
ImageDraw.floodfill(core, seed, 128)
core = core.point(lambda v: 255 if v == 128 else 0)
mask = ImageChops.multiply(core.filter(ImageFilter.MaxFilter(K)), fg)
alpha = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.1))
emblem = logo.convert('RGBA')
emblem.putalpha(alpha)
x0, y0, x1, y1 = mask.getbbox()
pad = 10
emblem = emblem.crop((max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)))
print('emblem', emblem.size)
for h in (128, 256, 512):
    save_webp(emblem.resize((round(emblem.width * h / emblem.height), h), Image.LANCZOS), f'logo-emblem-{h}.webp', 92)

# ---- square icons from the emblem
def square(size, fill, background):
    canvas = Image.new('RGBA', (size, size), background)
    box = round(size * fill)
    e = emblem.copy(); e.thumbnail((box, box), Image.LANCZOS)
    canvas.alpha_composite(e, ((size - e.width) // 2, (size - e.height) // 2))
    return canvas

def save_png(im, name):
    path = os.path.join(PUB, name)
    im.save(path, 'PNG', optimize=True)
    print(f'public/{name:30s} {im.size[0]}x{im.size[1]}  {os.path.getsize(path) // 1024} KB')

save_png(square(16, 1.0, (0, 0, 0, 0)), 'favicon-16x16.png')
save_png(square(32, 1.0, (0, 0, 0, 0)), 'favicon-32x32.png')
save_png(square(180, 0.88, WHITE + (255,)).convert('RGB'), 'apple-touch-icon.png')   # iOS needs an opaque icon
save_png(square(192, 0.90, WHITE + (255,)).convert('RGB'), 'pwa-192x192.png')
save_png(square(512, 0.90, WHITE + (255,)).convert('RGB'), 'pwa-512x512.png')
save_png(square(512, 0.62, WHITE + (255,)).convert('RGB'), 'pwa-maskable-512x512.png')  # inside the 80% maskable safe zone
