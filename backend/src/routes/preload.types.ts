export type { MediaIntentRef, PreloadIntentRequest, ReachableIntent } from './playable.types';

export interface PreloadIntentResponse {
  acceptedSequence: number;
  expiresAt: string;
}
