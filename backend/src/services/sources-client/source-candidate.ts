import type { SourceCandidate } from '@miauflix/service-contracts';

export type SourceMetadata = Omit<SourceCandidate, 'uploadDate'> & {
  uploadDate: Date;
  /** Legacy type compatibility; new candidates carry an opaque fileRef. */
  url?: string;
  is3D?: boolean;
};

export const fromCandidate = (candidate: SourceCandidate): SourceMetadata => ({
  ...candidate,
  uploadDate: new Date(candidate.uploadDate),
});
