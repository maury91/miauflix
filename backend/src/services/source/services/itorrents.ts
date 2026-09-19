import type { RequestService, RequestServiceResponse } from '@services/request/request.service';

const maxTorrentFileBytes = 2 * 1024 * 1024;

export const getSourceMetadataFileFromITorrents = (
  hash: string,
  timeout: number,
  requestService: RequestService
): Promise<RequestServiceResponse<ArrayBuffer>> => {
  return requestService.request(`https://itorrents.org/torrent/${hash}.torrent`, {
    asBuffer: true,
    headers: { 'accept-encoding': 'identity' },
    timeout,
    maxResponseBytes: maxTorrentFileBytes,
  });
};
