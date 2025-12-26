import { logger } from '@logger';
import type IPSet from 'ip-set';
import loadIPSet from 'load-ip-set';
import type { Torrent, TorrentFile } from 'webtorrent';

import type { RequestService } from '@services/request/request.service';

export const isVideoFile = (filename: string) => {
  return (
    filename.endsWith('.mp4') ||
    filename.endsWith('.mkv') ||
    filename.endsWith('.avi') ||
    filename.endsWith('.mov') ||
    filename.endsWith('.wmv') ||
    filename.endsWith('.flv') ||
    filename.endsWith('.webm') ||
    filename.endsWith('.m4v')
  );
};

// From https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
export function encodeRFC5987(str: string) {
  return (
    encodeURIComponent(str)
      // Note that although RFC3986 reserves "!", RFC5987 does not,
      // so we do not need to escape it
      .replace(/['()]/g, escape) // i.e., %27 %28 %29
      .replace(/\*/g, '%2A')
      // The following are not required for percent-encoding per RFC5987,
      // so we can allow for a little better readability over the wire: |`^
      .replace(/%(?:7C|60|5E)/g, unescape)
  );
}

export const getIpSet = async (url: string): Promise<IPSet | null> => {
  return new Promise(resolve => {
    loadIPSet(
      url,
      {
        'user-agent': 'Miauflix/1.0.0',
      },
      (err, ipSet) => {
        if (err) {
          logger.error('DownloadService', 'Error loading IP set:', err);
          return resolve(null);
        }
        resolve(ipSet);
      }
    );
  });
};

export const getTrackers = async (url: string, requestService: RequestService) => {
  try {
    const response = await requestService.request<string>(url);

    if (response.status >= 200 && response.status < 300) {
      const data = response.body;
      if (data) {
        const trackers: string[] = data
          .split('\n')
          .map(line => line.split('#')[0].trim())
          .filter(line => line.trim() !== '');
        return trackers;
      }
    }
  } catch (error) {
    logger.error('DownloadService', 'Error fetching trackers:', error);
  }
  return [];
};

export const getVideoFile = (torrent: Torrent): TorrentFile => {
  const files = torrent.files
    .filter(file => isVideoFile(file.name))
    .sort((a, b) => b.length - a.length);
  const mainFile = files[0];
  return mainFile;
};
export const getContentType = (filename: string): string => {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'mp4':
      return 'video/mp4';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'wmv':
      return 'video/x-ms-wmv';
    case 'flv':
      return 'video/x-flv';
    case 'webm':
      return 'video/webm';
    case 'm4v':
      return 'video/x-m4v';
    default:
      return 'video/mp4'; // Default to mp4
  }
};

export const parseRangeHeader = (
  fileSize: number,
  rangeHeader: string
): { start: number; end: number } | null => {
  const ranges = rangeHeader.replace(/bytes=/, '').split(',');
  const result: { start: number; end: number }[] = [];

  for (const range of ranges) {
    const [startStr, endStr] = range.split('-');

    let start = parseInt(startStr, 10);
    let end = parseInt(endStr, 10);

    if (isNaN(start) && !isNaN(end)) {
      // Suffix-byte-range-spec
      start = fileSize - end;
      end = fileSize - 1;
    } else if (!isNaN(start) && isNaN(end)) {
      // Byte-range-spec without end
      end = fileSize - 1;
    } else if (!isNaN(start) && !isNaN(end)) {
      // Complete byte-range-spec
      if (start > end || start < 0 || end >= fileSize) {
        return null; // Invalid range
      }
    } else {
      return null; // Invalid range
    }

    if (start < 0) start = 0;
    if (end >= fileSize) end = fileSize - 1;

    result.push({ start, end });
  }

  return result.length > 0 ? result[0] : null;
};
