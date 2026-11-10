import { redactLogArgument, redactSourceIdentifiers } from '@miauflix/service-contracts';

import { logger } from '../src/lib/logger';

const HEX = '0123456789abcdef0123456789abcdef01234567';
const BASE32 = 'MFRGGZDFMZTWQ2LKNNWG23TPOBYXE43U';
const MAGNET = `magnet:?xt=urn:btih:${HEX}&dn=Some.Movie.2024.1080p&tr=udp%3A%2F%2Ftracker`;

describe('redactSourceIdentifiers', () => {
  it('removes info hashes in hex, either case, and in base32', () => {
    expect(redactSourceIdentifiers(`torrent ${HEX} failed`)).toBe('torrent [redacted] failed');
    expect(redactSourceIdentifiers(`torrent ${HEX.toUpperCase()}`)).toBe('torrent [redacted]');
    expect(redactSourceIdentifiers(`hash=${BASE32}.`)).toBe('hash=[redacted].');
  });

  it('removes v2 info hashes', () => {
    expect(redactSourceIdentifiers(`v2 ${'a'.repeat(64)} and ${'b'.repeat(68)}`)).toBe(
      'v2 [redacted] and [redacted]'
    );
  });

  it('removes whole magnet links, including the release name and trackers', () => {
    expect(redactSourceIdentifiers(`adding ${MAGNET} now`)).toBe('adding [redacted] now');
  });

  it('removes the hash from a .torrent download URL', () => {
    expect(
      redactSourceIdentifiers(`GET https://itorrents.org/torrent/${HEX.toUpperCase()}.torrent 404`)
    ).toBe('GET https://itorrents.org/torrent/[redacted].torrent 404');
  });

  it('leaves ordinary log text alone', () => {
    const text =
      'Download completed for movie source 42 (piece 1234, 512 KiB, abcdef0123, deadbeef)';
    expect(redactSourceIdentifiers(text)).toBe(text);
  });

  it('does not take part of a longer hex run as a hash', () => {
    // 41 hex characters: not an info hash, and not cut into one.
    expect(redactSourceIdentifiers(`${HEX}8`)).toBe(`${HEX}8`);
  });
});

describe('redactLogArgument', () => {
  it('redacts error messages, stacks and causes, keeping the error name', () => {
    const cause = new Error(`tracker said ${HEX}`);
    const error = new TypeError(`Cannot add duplicate torrent ${HEX}`, { cause });
    const redacted = redactLogArgument(error) as Error;
    expect(redacted).toBeInstanceOf(Error);
    expect(redacted.name).toBe('TypeError');
    expect(redacted.message).toBe('Cannot add duplicate torrent [redacted]');
    expect(redacted.stack).not.toContain(HEX);
    expect((redacted.cause as Error).message).toBe('tracker said [redacted]');
    // The original is untouched.
    expect(error.message).toContain(HEX);
  });

  it('redacts objects through JSON, keeping them valid', () => {
    expect(redactLogArgument({ hash: HEX, magnet: `"${MAGNET}"`, id: 7 })).toEqual({
      hash: '[redacted]',
      magnet: '"[redacted]"',
      id: 7,
    });
  });

  it('drops values that cannot be serialised instead of logging them raw', () => {
    const cyclic: Record<string, unknown> = { hash: HEX };
    cyclic.self = cyclic;
    expect(redactLogArgument(cyclic)).toBe('[unloggable value]');
  });

  it('passes other values through', () => {
    expect(redactLogArgument(42)).toBe(42);
    expect(redactLogArgument(undefined)).toBeUndefined();
  });
});

describe('media-load logger', () => {
  it('never prints an info hash or magnet link', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      logger.error('DownloadService', `Error adding ${MAGNET}`, new Error(`duplicate ${HEX}`));
      const printed = error.mock.calls[0]
        .map(arg => (arg instanceof Error ? `${arg.message}\n${arg.stack}` : String(arg)))
        .join(' ');
      expect(printed).not.toContain(HEX);
      expect(printed).not.toContain('magnet:');
      expect(printed).not.toContain('Some.Movie');
      expect(printed).toContain('[redacted]');
    } finally {
      error.mockRestore();
    }
  });
});
