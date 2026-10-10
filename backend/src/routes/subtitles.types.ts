import { z } from 'zod';

export const subtitleSearchRequestSchema = z
  .object({
    streamingKey: z.string().min(10).max(256),
    language: z.string().regex(/^[a-z]{2,3}$/i),
    hearingImpaired: z.boolean().default(false),
    refresh: z.boolean().default(false),
  })
  .strict();

export type SubtitleSearchRequest = z.infer<typeof subtitleSearchRequestSchema>;

export interface SubtitleCandidateDto {
  id: string;
  provider: 'opensubtitles';
  fileId: number;
  language: string;
  languageLabel: string;
  release: string;
  hearingImpaired: boolean;
  trusted: boolean;
  match: 'file' | 'release' | 'title';
  /** Filename similarity from 0 to 100, or null when the video filename is unavailable. */
  filenameSimilarity: number | null;
}

export interface SubtitleSearchResponse {
  configured: boolean;
  available: boolean;
  candidates: SubtitleCandidateDto[];
}
