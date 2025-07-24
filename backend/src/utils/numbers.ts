export const humanReadableBytes = (bytes: bigint | number): string => {
  if (bytes < 1n) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const unitIndex = Math.floor(Math.log2(Number(bytes)) / 10);
  const value = Number(bytes) / Math.pow(1024, unitIndex);
  return `${value.toFixed(2)} ${units[unitIndex]}`;
};
