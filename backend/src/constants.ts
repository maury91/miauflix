const requiredEnv = [
  "TMDB_API_ACCESS_TOKEN",
  "TRAKT_CLIENT_ID",
  "JWT_SECRET",
  "REFRESH_TOKEN_SECRET",
] as const;
const optionalEnv = ["TMDB_API_URL", "TRAKT_API_URL"] as const;

export const ENV = (
  variable: (typeof requiredEnv)[number] | (typeof optionalEnv)[number],
  defaultValue?: string,
) => process.env[variable] ?? defaultValue ?? "";
