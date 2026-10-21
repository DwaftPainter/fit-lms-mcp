/**
 * Utility functions for date manipulation and format normalization.
 */

export function toIsoString(timestampInSeconds: number | null | undefined): string | null {
  if (timestampInSeconds == null || timestampInSeconds <= 0) {
    return null;
  }
  const date = new Date(timestampInSeconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function fromIsoString(isoString: string): number | null {
  const date = new Date(isoString);
  const time = date.getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

export function isUpcoming(
  timestampInSeconds: number | null | undefined,
  referenceTimeMs: number = Date.now(),
): boolean {
  if (timestampInSeconds == null || timestampInSeconds <= 0) {
    return false;
  }
  return timestampInSeconds * 1000 > referenceTimeMs;
}
