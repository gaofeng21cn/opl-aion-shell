# Shell Theme Implementation

App owns the visual product baseline. The Shell applies that baseline through
`packages/desktop/src/renderer/styles/themes/opl-product-baseline.css` and the
pinned DSH visual inputs. Base stylesheet values are implementation inputs,
not a second product palette or an independently maintained token catalog.

`packages/desktop/src/renderer/utils/theme/applyTheme.ts` applies only the
resolved appearance to `html[data-theme]` and `body[arco-theme]`.
It removes legacy `theme-tokens` and `theme-decoration` style elements;
stored theme `tokens` and `css` are not an active custom-theme authoring API.

Use existing semantic variables and UnoCSS mappings from the actual
stylesheets and `uno.config.ts`. Do not copy their numeric values or usage
counts into Markdown. System/Light/Dark selection changes appearance while
preserving the governed baseline.

OPL surfaces use `OplIcon` through the pinned visual provider; unchanged
upstream surfaces retain their own implementation. Changes must preserve focus,
contrast, motion preferences, and current interaction handlers. The App owner
must accept changes to the visual baseline before Shell implementation follows.
