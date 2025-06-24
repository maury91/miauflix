import { enhancedFetch } from '@utils/fetch.util';

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
  timeout: number
): Promise<Response> => {
  const encryptedTTLRaw = await fetch(
    `https://torrage.info/torrent.php?h=${hash}&ttl=${Math.floor(Date.now() / 1000)}`
  );
  const encryptedTTL = (await encryptedTTLRaw.clone().text()).match(/getTTL\("([^"]+)"/)?.[1];
  if (encryptedTTL) {
    const decryptedTTL = reverse(caesarShift(encryptedTTL, -12));
    return await enhancedFetch(`https://torrage.info/download.php?h=${hash}&ttl=${decryptedTTL}`, {
      timeout,
    });
  }
  return encryptedTTLRaw;
};
