const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

/**
 * Convert bytes to a human readable string
 * @param bytes - The number of bytes to convert
 * @returns A string representing the number of bytes in a human readable format
 */
export const humanReadableBytes = (bytes: bigint | number): string => {
  let value = BigInt(bytes);
  if (value < 1n) {
    return '0 B';
  }
  let unitIndex = 0;
  // Stop one unit before the last one
  while (value >= 1024n * 1024n && unitIndex < units.length - 2) {
    value /= 1024n;
    unitIndex++;
  }
  if (value >= 1024n) {
    const remainder = value % 1024n;
    const main = value / 1024n;
    return `${main}.${((remainder * 100n) / 1024n).toString().padStart(2, '0')} ${units[unitIndex + 1]}`;
  }
  return `${value} ${units[unitIndex]}`;
};
