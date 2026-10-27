# Brand assets

Source files of the MDotion logo. The images used by the extension and the README are rendered from these files into [`images/`](../images/).

| File | Use |
|---|---|
| `mdotion-icon-dark.svg` / `.png` | App icon on a dark tile — source of the Marketplace icon `images/icon.png` |
| `mdotion-icon-light.svg` | App icon on a light tile |
| `mdotion-icon-small.svg` | Icon variant for sizes ≤ 32 px (wider gap, smaller radius) |
| `mdotion-favicon-16.png` | 16 px favicon |
| `mdotion-glyph-charcoal.svg`, `mdotion-glyph-white.svg` | Mark without tile |
| `mdotion-lockup-light.svg` | Mark + name for light backgrounds — source of `images/logo-light.png` |
| `mdotion-lockup-dark.svg` | Mark + name for dark backgrounds — source of `images/logo-dark.png` |
| `mdotion-construction.png` | Construction of the mark (geometry and proportions) |
| `mdotion-social-preview.png` | 1280 × 640 GitHub social preview (Settings → General → Social preview) |

## Ready-to-use exports

[`export/`](export/) holds PNG renders of the SVGs above, regenerated with `python3 scripts/export-brand.py assets` (macOS).

| Folder | Files | Use |
|---|---|---|
| `icon/` | `mdotion-icon-dark-{16…1024}.png`, `mdotion-icon-light-{64…1024}.png` | App icon on a rounded tile; 16 and 32 px use the small-size variant |
| `glyph/` | `mdotion-glyph-charcoal-*.png`, `mdotion-glyph-white-*.png` | Mark alone on a transparent background |
| `lockup/` | `mdotion-lockup-light-{400…3200}.png`, `mdotion-lockup-dark-*.png` | Mark + name on a transparent background, for light / dark backgrounds |
| `avatar/` | `mdotion-avatar-400.png`, `mdotion-avatar-1024.png` | Square full-bleed tile for profile pictures (GitHub, X, LinkedIn crop it to a circle) |
| `web/` | `favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | Website icons |

The MIT License of this repository covers the source code. The MDotion name and logo identify the project: you may use them to refer to MDotion, but not to brand forks or other products as if they were MDotion.
