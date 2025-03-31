const requiredEnv = ["TMDB_API_ACCESS_TOKEN", "TRAKT_CLIENT_ID"] as const;
const optionalEnv = ["TMDB_API_URL", "TRAKT_API_URL"] as const;

export const ENV = [...requiredEnv, ...optionalEnv].reduce(
  (acc, key) => {
    const value = process.env[key];
    if (value === undefined) {
      return acc;
    }
    return {
      ...acc,
      [key]: value,
    };
  },
  {} as Record<(typeof requiredEnv)[number], string> &
    Record<(typeof optionalEnv)[number], string | undefined>,
);

for (const key of requiredEnv) {
  if (!ENV[key]) {
    throw new Error(`${key} is not set`);
  }
}
