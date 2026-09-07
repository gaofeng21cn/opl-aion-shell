# Theme Stylesheet Composition

`index.css` imports the base and default styles plus the OPL product baseline.
`base.css` contains theme-independent rules; `default-color-scheme.css`
provides upstream variables; `opl-product-baseline.css` binds the active OPL
surface to its governed visual inputs.

Appearance is resolved by the existing theme utilities. There is no active
`useColorScheme` extension API or a pending arbitrary-color-scheme selector.
For current application behavior and authoring boundaries, use
[Shell theme implementation](../../../../../../docs/theming/tokens.md).
