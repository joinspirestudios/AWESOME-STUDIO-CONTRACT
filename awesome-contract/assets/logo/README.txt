============================================================
AWESOME LOGO — Replace the placeholder with the real logo
============================================================

The current file (awesome-wordmark.svg) is a placeholder
that mimics the awęsome wordmark using EB Garamond.

Replace it with the real logo from:
https://drive.google.com/drive/folders/1CiyAOXnw11KennGp2oRw5r0nHavoCNUn

------------------------------------------------------------
INSTRUCTIONS
------------------------------------------------------------

1. Download the official AWESOME wordmark from the Drive folder
   (preferably as .svg — PNG also works).

2. If it's an SVG file:
   - Rename it to "awesome-wordmark.svg"
   - Replace this folder's existing awesome-wordmark.svg

3. If it's a PNG/JPG:
   - Edit /index.html and find the loadLogo() function
   - Update the fetch path to your actual filename
   - For example: ./assets/logo/awesome-wordmark.png

4. Make sure the logo:
   - Is the horizontal full wordmark (not the awę icon)
   - Uses the Stop crimson (#C70100) as primary color
   - Has the diacritic "ę" intact
   - Has transparent background (for SVG/PNG)

------------------------------------------------------------
SIZING NOTES
------------------------------------------------------------

The contract displays the logo at three sizes:

  • Topbar: 32px tall (small)
  • Hero cover: 110px tall (large)
  • Sign block: hidden (uses wax seal instead)

The CSS scales by height and preserves aspect ratio,
so any natural width works fine.
