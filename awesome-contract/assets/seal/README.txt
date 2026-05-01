# Custom Wax Seal — Drop Zone

This folder holds the wax seal that appears at the bottom of the contract,
just above the "Sealed in pursuit of the awesome" tagline.

---

## How to replace it with your custom-designed seal

Just drop your seal file into this folder. The site will pick it up automatically.

### Supported filenames (it tries them in this order)

```
awesome-seal.svg     ← preferred
awesome-seal.png
awesome-seal.jpg
awesome-seal.webp
custom-seal.svg
custom-seal.png
```

The first file it finds wins. If none of these exist, the site falls back
to the built-in inline SVG seal.

### Recommended specs

- **Format:** SVG (sharp at any size, smallest filesize). PNG with transparency is the next best option.
- **Aspect ratio:** Square (1:1). The seal renders at 92×92 px in the contract.
- **Background:** Transparent. The seal sits on a dark maroon panel.
- **Export size (raster):** At least 256×256 px so it stays crisp on Retina screens.
- **Color:** Wax tones (golds / ambers / dark brown) read best against the maroon background, but any color that fits the brand works.

### To replace the seal

1. Save your seal file with one of the supported filenames above.
2. Drop it into this folder (`/assets/seal/`).
3. Commit and push to GitHub. Vercel will redeploy automatically.

The current `awesome-seal.svg` file in this folder is a placeholder
generic wax seal. Overwriting it with your custom design is the
cleanest path.

### To remove the custom seal and go back to the inline default

Delete your custom file (or rename it to something the loader doesn't
look for, e.g. `awesome-seal-OLD.svg`). The site will fall back to
the inline SVG seal automatically.
