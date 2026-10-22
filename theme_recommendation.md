# BidHub Theme Recommendation

## Recommendation

Use the minimal Campus Tech theme: a cool off-white canvas, navy text, teal for primary actions and trust cues, and amber only for occasional emphasis. This suits students and clients using the marketplace on laptops or phones in ordinary campus and office lighting. It feels dependable without the prior editorial serif, parchment, and gold treatment.

## Applied system

- Light mode is the default; a matching navy dark mode remains available.
- System sans-serif typography replaces the Fraunces and Inter pairing and avoids a remote font request.
- Cards use plain surfaces, fine borders, and restrained shadows. The old parchment gradient, grain texture, and decorative glows are removed.
- The primary palette uses `#F5F7FA` background, `#172B4D` text, `#087E8B` action teal, and `#F2A65A` as a sparing accent.
- Existing components retain compatibility through their legacy color-token names while receiving the new teal and navy values.

The production build passes. Review both light and dark modes on the running app for any page-specific hard-coded colors that do not follow the shared tokens.
