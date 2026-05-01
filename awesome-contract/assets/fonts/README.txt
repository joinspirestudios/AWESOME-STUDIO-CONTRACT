============================================================
BRAND FONTS — Drop your font files in this folder
============================================================

The contract uses two brand typefaces:
  • PP Editorial New (display / headlines)
  • ZT Nature Sans (body / interface)

Until these files are added, the contract falls back to
EB Garamond and Inter (loaded from Google Fonts).

------------------------------------------------------------
WHERE TO GET THEM
------------------------------------------------------------

Kehinde's font files are stored here:
https://drive.google.com/drive/folders/16EyDI-YiTRM3JV70e8nQTT7LsYa0yKRL

Download the .woff2 files (preferred) or .otf/.ttf files.

------------------------------------------------------------
EXPECTED FILENAMES
------------------------------------------------------------

Drop these exact filenames in /assets/fonts/:

  PPEditorialNew-Ultralight.woff2
  PPEditorialNew-UltralightItalic.woff2
  PPEditorialNew-Regular.woff2

  ZTNature-Regular.woff2
  ZTNature-Medium.woff2
  ZTNature-SemiBold.woff2
  ZTNature-Bold.woff2

If the source files are .otf or .ttf, convert to .woff2 first.
Easiest free converter: https://transfonter.org

------------------------------------------------------------
IF YOU CAN'T CONVERT TO .woff2
------------------------------------------------------------

Edit the @font-face declarations at the top of /index.html
to point to your actual files. For example:

  @font-face {
    font-family: 'PP Editorial New';
    src: url('./assets/fonts/PPEditorialNew-Regular.otf') format('opentype');
    font-weight: 400;
  }

------------------------------------------------------------
LICENSING
------------------------------------------------------------

PP Editorial New and ZT Nature Sans are commercial fonts.
Make sure your foundry license covers web embedding before
deploying these files publicly.
