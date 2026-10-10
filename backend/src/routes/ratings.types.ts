export type MediaRatingValue = 'dislike' | 'like' | 'love';
export type MediaRatingRef = { mediaType: 'movie' | 'tv'; mediaId: number };
export type MediaRatingResponse = MediaRatingRef & { rating: MediaRatingValue | null };
