import type { RequestService, RequestServiceResponse } from '@services/request/request.service';

export const caesarShift = (str: string, shift: number): string => {
  return str
    .split('')
    .map(char => {
      if (char >= 'a' && char <= 'z') {
        return String.fromCharCode(((char.charCodeAt(0) - 97 + shift + 26) % 26) + 97);
      } else if (char >= 'A' && char <= 'Z') {
        return String.fromCharCode(((char.charCodeAt(0) - 65 + shift + 26) % 26) + 65);
      }
      return char; // Non-alphabetic characters are unchanged
    })
    .join('');
};

export const reverse = (str: string): string => {
  return str.split('').reverse().join('');
};

export const getSourceMetadataFileFromTorrage = async (
  hash: string,
  timeout: number,
  requestService: RequestService
): Promise<RequestServiceResponse<string>> => {
  const encryptedTTLRaw = await requestService.request<string>(
    `https://torrage.info/torrent.php?h=${hash}&ttl=${Math.floor(Date.now() / 1000)}`
  );
  const encryptedTTL = encryptedTTLRaw.body.match(/getTTL\("([^"]+)"/)?.[1];
  if (encryptedTTL) {
    const decryptedTTL = reverse(caesarShift(encryptedTTL, -12));
    return await requestService.request<string>(
      `https://torrage.info/download.php?h=${hash}&ttl=${decryptedTTL}`,
      {
        timeout,
      }
    );
  }
  return encryptedTTLRaw;
};
