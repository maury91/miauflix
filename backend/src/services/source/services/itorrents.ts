import type { RequestService, RequestServiceResponse } from '@services/request/request.service';

export const getSourceMetadataFileFromITorrents = (
  hash: string,
  timeout: number,
  requestService: RequestService
): Promise<RequestServiceResponse<ArrayBuffer>> => {
  return requestService.request(`https://itorrents.org/torrent/${hash}.torrent`, {
    asBuffer: true,
    timeout,
  });
};
