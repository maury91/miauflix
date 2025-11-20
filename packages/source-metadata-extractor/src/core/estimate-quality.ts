import { Quality, VideoCodec } from '@/types';

/**
 * Estimate quality based on file size, runtime, and video codec
 * Uses precise bitrate ranges for each codec and resolution combination
 */

export function estimateQuality(
  sizeInBytes: number,
  runtimeInSeconds: number,
  videoCodec?: VideoCodec | VideoCodec[]
): Quality | undefined {
  if (!runtimeInSeconds || runtimeInSeconds <= 0) {
    return undefined;
  }

  const bitrateInMbps = (sizeInBytes * 8) / (runtimeInSeconds * 1000000);
  const codec = Array.isArray(videoCodec) ? videoCodec[0] : videoCodec;

  // Handle enum values first
  switch (codec) {
    case VideoCodec.AV1:
    case VideoCodec.AV1_10BIT:
      if (bitrateInMbps >= 14) return Quality['8K']; // 4320p: 14-28 Mbps
      if (bitrateInMbps >= 6) return Quality['4K']; // 2160p: 6-14 Mbps
      if (bitrateInMbps >= 3.5) return Quality['2K']; // 1440p: 3-6 Mbps
      if (bitrateInMbps >= 1.5) return Quality.FHD; // 1080p: 1.5-3.5 Mbps
      if (bitrateInMbps >= 1) return Quality.HD; // 720p: 1-2 Mbps
      return Quality.SD; // 480p: 0.4-1 Mbps
    case VideoCodec.X265:
    case VideoCodec.X265_10BIT:
      if (bitrateInMbps >= 20) return Quality['8K']; // 4320p: 20-40 Mbps
      if (bitrateInMbps >= 10) return Quality['4K']; // 2160p: 10-20 Mbps
      if (bitrateInMbps >= 4.5) return Quality['2K']; // 1440p: 4-8 Mbps
      if (bitrateInMbps >= 2) return Quality.FHD; // 1080p: 2-4.5 Mbps
      if (bitrateInMbps >= 1.5) return Quality.HD; // 720p: 1.5-3 Mbps
      return Quality.SD; // 480p: 0.5-1.5 Mbps
    case VideoCodec.X264:
      if (bitrateInMbps >= 40) return Quality['8K']; // 4320p: 40-80 Mbps
      if (bitrateInMbps >= 20) return Quality['4K']; // 2160p: 20-40 Mbps
      if (bitrateInMbps >= 8) return Quality['2K']; // 1440p: 8-16 Mbps
      if (bitrateInMbps >= 4.5) return Quality.FHD; // 1080p: 4-8 Mbps
      if (bitrateInMbps >= 2.5) return Quality.HD; // 720p: 2.5-5 Mbps
      return Quality.SD; // 480p: 1-2.5 Mbps
    case VideoCodec.VP9:
      if (bitrateInMbps >= 16) return Quality['8K']; // 4320p: 16-32 Mbps
      if (bitrateInMbps >= 8) return Quality['4K']; // 2160p: 8-16 Mbps
      if (bitrateInMbps >= 4) return Quality['2K']; // 1440p: 4-8 Mbps
      if (bitrateInMbps >= 1.8) return Quality.FHD; // 1080p: 1.8-4 Mbps
      if (bitrateInMbps >= 1.2) return Quality.HD; // 720p: 1.2-2.5 Mbps
      return Quality.SD; // 480p: 0.5-1.2 Mbps
    case VideoCodec.XVID:
      if (bitrateInMbps >= 10) return Quality['4K']; // 2160p: 10-20 Mbps
      if (bitrateInMbps >= 5) return Quality['2K']; // 1440p: 5-10 Mbps
      if (bitrateInMbps >= 2.5) return Quality.FHD; // 1080p: 2.5-5 Mbps
      if (bitrateInMbps >= 1.25) return Quality.HD; // 720p: 1.25-2.5 Mbps
      return Quality.SD; // 480p: 0.5-1.2 Mbps
  }

  return undefined;
}
