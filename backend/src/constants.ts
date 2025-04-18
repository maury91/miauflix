type RequiredEnv =
  | "JWT_SECRET"
  | "REFRESH_TOKEN_SECRET"
  | "TMDB_API_ACCESS_TOKEN"
  | "TRAKT_CLIENT_ID";

type OptionalEnv = "CORS_ORIGIN" | "TMDB_API_URL" | "TRAKT_API_URL";

export const ENV = (
  variable: OptionalEnv | RequiredEnv,
  defaultValue?: string,
): string => process.env[variable] ?? defaultValue ?? "";
