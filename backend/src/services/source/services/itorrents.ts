import { enhancedFetch } from '@utils/fetch.util';

export const getTorrentFromITorrents = async (hash: string, timeout: number): Promise<Response> => {
  const response = await enhancedFetch(`https://itorrents.org/torrent/${hash}.torrent`, {
    timeout,
  });
  return response;
};
