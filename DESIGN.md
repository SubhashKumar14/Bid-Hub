# Existing visual system

The implementation in `frontend/styles/theme.css`, `fonts.css`, `bidhub-brand.css` and `frontend/app/brand/` is authoritative. This repair preserves it.

Light: chalk `#F5F3EE`, ink `#24231F`, card `#FFFDF8`, brick accent `#A6422B`. Dark: charcoal `#1A1917`, ivory `#F1EDE5`, card `#22211E`, accent `#EAA88C`. Status colors are independent semantic tokens.

IBM Plex Sans serves application UI; Newsreader serves editorial headings. Fonts and vector brand assets are self-hosted under `public/brand/bidhub`. Use existing logo components and preserve personal avatars.

Controls retain their shared 44px target and 5px radius; panels use 8px and dialogs 12px. Retain desktop composition; allow responsive wrapping/shrinking only to keep controls and content within the viewport. Restore focus after overlays close. Existing theme colors, typography and assets must not change during workflow repairs.
