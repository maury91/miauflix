export function clearEnvironmentVariable(name: string): () => void {
  const previousValue = process.env[name];
  delete process.env[name];

  return () => {
    if (previousValue === undefined) delete process.env[name];
    else process.env[name] = previousValue;
  };
}
