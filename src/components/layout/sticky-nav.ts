/**
 * Master switch for the sticky global header. Flip this one boolean to enable or
 * disable the whole behavior coherently:
 *   - SiteHeader pins itself (`sticky top-0 z-30`);
 *   - HeaderHeightVar mounts and publishes `--site-header-h` so dependent sticky
 *     elements (zone sidebar, editorial side-labels) offset by the pinned bar;
 *   - CursorRing paints an always-on glow band so the ring shows over the navbar
 *     even when a hero photo sits behind it.
 *
 * When false, the var stays at its 0px default, every `calc(var(--site-header-h)
 * + …)` collapses to its original offset, and the cursor-ring band is skipped —
 * so the page reverts exactly to the non-sticky layout.
 */
export const STICKY_NAV = true;
