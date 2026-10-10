/** Replay a recorded TMDB image response with the requested language filter applied. */
export function tmdbFixtureQuery(
  path: string,
  query: Record<string, string>
): Record<string, string> | null {
  if (
    !/^\/3\/(movie|tv)\/\d+$/.test(path) ||
    !query.include_image_language ||
    !query.append_to_response?.split(',').includes('images')
  )
    return null;
  const { include_image_language: _language, ...recorded } = query;
  return recorded;
}

export function filterTmdbImages(data: unknown, languages: string, language = 'en'): unknown {
  if (!data || typeof data !== 'object') return data;
  const detail = data as { images?: Record<string, unknown> };
  if (!detail.images) return data;
  const allowed = new Set(
    [language, ...languages.split(',')].map(value => value.trim().toLowerCase().split('-')[0])
  );
  return {
    ...detail,
    images: Object.fromEntries(
      Object.entries(detail.images).map(([key, value]) => [
        key,
        Array.isArray(value)
          ? value.filter(image => allowed.has(image.iso_639_1 ?? 'null'))
          : value,
      ])
    ),
  };
}
