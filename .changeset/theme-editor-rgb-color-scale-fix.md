---
"@runtypelabs/persona": patch
---

Fix theme editor `set_brand_colors` (and contrast checks) corrupting palettes when given `rgb()`/`rgba()` color input. `hexToHsl` and `wcagContrastRatio` now parse rgb strings instead of producing `#NaNNaNNaN` shades. Adds an `rgbToHex` color utility.
