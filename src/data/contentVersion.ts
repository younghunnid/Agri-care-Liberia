/**
 * Release date and version of the bundled agricultural content (src/data/*).
 * Bump both whenever advice text changes so offline copies on farmers' phones are
 * flagged "update available" and replaced on the next download/update.
 * 2026-11-18 is the date of the source data files supplied for this project.
 */
export const BUNDLED_CONTENT_VERSION = 1;
export const BUNDLED_CONTENT_UPDATED = '2026-11-18';
/** Content older than this is labelled "may be outdated" in the offline library. */
export const OUTDATED_AFTER_DAYS = 365;
