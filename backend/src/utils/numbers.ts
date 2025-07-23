export const humanReadableBytes = (bytes: bigint | number): string => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.floor(Math.log2(Number(bytes)) / 10);
  const value = Number(bytes) / Math.pow(1024, unitIndex);
  return `${value.toFixed(2)} ${units[unitIndex]}`;
};
