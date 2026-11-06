import { serviceConfiguration, transforms, variable } from '@utils/config';

/**
 * Playback preparation settings. The torrent engine's settings (limits, trackers, download path,
 * storage budget) belong to the media-load service, under the same keys.
 */
export const downloadConfigurationDefinition = serviceConfiguration({
  name: 'Download',
  description: 'Playback preparation: warmup buffer and video conversion',
  variables: {
    CONVERT_H265_TO_H264: variable({
      label: 'Convert H.265 to H.264',
      description:
        'Allow CPU-intensive real-time H.265 video conversion when the client cannot play or remux it. Output is limited to 1080p at 30 fps. Supported clients keep the original video.',
      defaultValue: 'false',
      required: false,
      transform: transforms.boolean(),
    }),
    PRELOAD_WARM_TARGET: variable({
      description: 'Amount of the beginning of a video to download before torrent warmup is ready',
      label: 'Torrent warmup buffer',
      example: '64MB',
      defaultValue: '64MB',
      required: true,
      transform: transforms.size(),
    }),
  },
});
