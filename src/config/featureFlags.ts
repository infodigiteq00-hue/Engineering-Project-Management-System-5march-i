/**
 * Feature flags - set to false to revert to previous behavior.
 *
 * USE_ON_DEMAND_PROGRESS_IMAGES:
 * - When true: Only metadata + latest progress image are loaded per equipment;
 *   prev/next load that image on demand (one at a time). Reduces load with many images.
 * - When false: Original behavior - all progress images are fetched with equipment.
 */
export const USE_ON_DEMAND_PROGRESS_IMAGES = true;
