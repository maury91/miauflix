/**
 * Builds a Storybook URL with properly encoded arguments
 */
export function buildStorybookUrl(
  baseUrl: string,
  storyId: string,
  args: Record<string, unknown>,
  options: { viewMode?: 'story' | 'docs' } = {}
): string {
  const { viewMode = 'story' } = options;

  // Convert args object to array of key:value strings
  const argsArray = Object.entries(args).map(([key, value]) => `${key}:${value}`);

  // Join with semicolons and encode once
  const argsParam = encodeURIComponent(argsArray.join(';'));

  return `${baseUrl}?id=${storyId}&args=${argsParam}&viewMode=${viewMode}`;
}
