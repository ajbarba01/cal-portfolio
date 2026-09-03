/**
 * Master switch for the sticky global header. Flip this one boolean to enable or
 * disable the whole behavior coherently:
 *   - SiteHeader pins itself (`sticky top-0 z-30`);
 *   - HeaderHeightVar mounts and publishes `--site-header-h` so dependent sticky
 *     elements (zone sidebar, editorial side-labels) offset by the pinned bar.
 *
 * When false, the var stays at its 0px default, so every consumer that reads
 * it — whichever expression it wraps the var in — collapses to its original
 * offset, and the page reverts exactly to the non-sticky layout.
 */
export const STICKY_NAV = true;
