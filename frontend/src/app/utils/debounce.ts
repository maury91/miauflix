export const debounce = <A extends Array<unknown>>(func: (...args: A) => void, wait: number) => {
  let timeout: number;
  return (...args: A) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      func(...args);
    }, wait);
  };
};
