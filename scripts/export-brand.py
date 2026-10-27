"""Renders the MDotion brand SVGs in assets/ into assets/export/ (PNG and ICO). macOS only: uses `sips`.

Usage: python3 scripts/export-brand.py assets
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

assets = sys.argv[1]
out = os.path.join(assets, 'export')
tmp = tempfile.mkdtemp()


def svg(name):
    with open(os.path.join(assets, name)) as f:
        return f.read()


def view_box(source):
    _, _, w, h = map(float, re.search(r'viewBox="([^"]+)"', source).group(1).split())
    return w, h


def render(source, width, dest):
    w, h = view_box(source)
    height = round(width * h / w)
    sized = source.replace('<svg ', f'<svg width="{width}" height="{height}" ', 1)
    src = os.path.join(tmp, 'in.svg')
    with open(src, 'w') as f:
        f.write(sized)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    subprocess.run(['sips', '-s', 'format', 'png', src, '--out', dest], check=True, capture_output=True)
    im = Image.open(dest)
    assert im.size == (width, height), (dest, im.size)
    return dest


if os.path.isdir(out):
    shutil.rmtree(out)

icon_dark = svg('mdotion-icon-dark.svg')
icon_light = svg('mdotion-icon-light.svg')
icon_small = svg('mdotion-icon-small.svg')
# Square, full-bleed tile: for avatars and platforms that round or crop the icon themselves.
full_bleed = re.sub(r'rx="\d+"', 'rx="0"', icon_dark, count=1)

# App icon (rounded tile). The small-size variant has a wider gap that stays readable at 16 / 32 px.
for size in (16, 32):
    render(icon_small, size, f'{out}/icon/mdotion-icon-dark-{size}.png')
for size in (48, 64, 128, 256, 512, 1024):
    render(icon_dark, size, f'{out}/icon/mdotion-icon-dark-{size}.png')
for size in (64, 128, 256, 512, 1024):
    render(icon_light, size, f'{out}/icon/mdotion-icon-light-{size}.png')

# Mark without tile, transparent background.
for color in ('charcoal', 'white'):
    for size in (64, 128, 256, 512, 1024):
        render(svg(f'mdotion-glyph-{color}.svg'), size, f'{out}/glyph/mdotion-glyph-{color}-{size}.png')

# Mark + name, transparent background ("light" = for light backgrounds).
for variant in ('light', 'dark'):
    for width in (400, 800, 1600, 3200):
        render(svg(f'mdotion-lockup-{variant}.svg'), width, f'{out}/lockup/mdotion-lockup-{variant}-{width}.png')

# Profile pictures (GitHub, X, LinkedIn crop them to a circle or a rounded square).
for size in (400, 1024):
    render(full_bleed, size, f'{out}/avatar/mdotion-avatar-{size}.png')

# Website icons.
web = f'{out}/web'
render(full_bleed, 180, f'{web}/apple-touch-icon.png')
render(icon_dark, 192, f'{web}/icon-192.png')
render(icon_dark, 512, f'{web}/icon-512.png')
shutil.copy(os.path.join(assets, 'mdotion-icon-small.svg'), f'{web}/favicon.svg')
frames = [
    Image.open(render(icon_small, 16, f'{tmp}/f16.png')),
    Image.open(render(icon_small, 32, f'{tmp}/f32.png')),
    Image.open(render(icon_dark, 48, f'{tmp}/f48.png')),
]
frames[2].save(f'{web}/favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48)], append_images=frames[:2])

for root, _, files in sorted(os.walk(out)):
    for name in sorted(files):
        path = os.path.join(root, name)
        print(os.path.relpath(path, out), os.path.getsize(path))
