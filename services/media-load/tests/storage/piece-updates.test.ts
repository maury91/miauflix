import type { PiecesUpdate } from '@miauflix/service-contracts';
import { describe, expect, it, jest } from 'bun:test';

import { piecesUpdate, PieceUpdates } from '../../src/storage/piece-updates';
import { testDatabase } from '../helpers/engine';

const bits = (...bytes: number[]) => new Uint8Array(bytes);

describe('piecesUpdate', () => {
  it('sends the whole bitfield first', () => {
    expect(piecesUpdate(1, undefined, { totalPieces: 10, bitfield: bits(0b10000000, 0) })).toEqual({
      sourceId: 1,
      totalPieces: 10,
      bitfield: Buffer.from([0b10000000, 0]).toString('base64'),
    });
  });

  it('sends the added pieces when that is smaller', () => {
    const previous = { totalPieces: 800, bitfield: new Uint8Array(100) };
    const next = { totalPieces: 800, bitfield: new Uint8Array(100) };
    next.bitfield[0] = 0b01000001;
    next.bitfield[99] = 0b00000001;
    expect(piecesUpdate(1, previous, next)).toEqual({
      sourceId: 1,
      totalPieces: 800,
      added: [1, 7, 799],
    });
  });

  it('sends the whole bitfield when the added pieces would be larger', () => {
    const previous = { totalPieces: 16, bitfield: bits(0, 0) };
    const next = { totalPieces: 16, bitfield: bits(0xff, 0xff) };
    expect(piecesUpdate(1, previous, next)).toEqual({
      sourceId: 1,
      totalPieces: 16,
      bitfield: Buffer.from([0xff, 0xff]).toString('base64'),
    });
  });

  it('sends the whole bitfield when a piece was lost', () => {
    const previous = { totalPieces: 800, bitfield: new Uint8Array(100).fill(0xff) };
    const next = { totalPieces: 800, bitfield: new Uint8Array(100).fill(0xff) };
    next.bitfield[50] = 0b11110111;
    expect(piecesUpdate(1, previous, next)?.bitfield).toBe(
      Buffer.from(next.bitfield).toString('base64')
    );
  });

  it('sends nothing when no piece changed, and ignores trailing bytes', () => {
    const previous = { totalPieces: 8, bitfield: bits(0xf0) };
    expect(piecesUpdate(1, previous, { totalPieces: 8, bitfield: bits(0xf0, 0, 0) })).toBeNull();
  });
});

describe('PieceUpdates', () => {
  const setup = async () => {
    const database = await testDatabase();
    const repository = database.getStorageRepository();
    const updates = new PieceUpdates(repository, 60_000);
    await database.getSourceRepository().put({
      id: 7,
      hash: '7'.repeat(40),
      magnetLink: 'magnet:?xt=urn:btih:' + '7'.repeat(40),
      size: 0,
    });
    const storage = await repository.create({
      sourceId: 7,
      location: '/downloads/7',
      totalPieces: 800,
      downloadedPieces: new Uint8Array(100),
    });
    const received: PiecesUpdate[] = [];
    updates.subscribe(update => received.push(update));
    return { repository, storage, updates, received };
  };

  it('batches the writes of a source into one update since the last one', async () => {
    const { repository, storage, updates, received } = await setup();
    updates.flush();
    expect(received).toEqual([
      {
        sourceId: 7,
        totalPieces: 800,
        bitfield: Buffer.from(new Uint8Array(100)).toString('base64'),
      },
    ]);
    const bitfield = new Uint8Array(100);
    bitfield[0] = 0b10000000;
    await repository.update(storage.id, { downloadedPieces: new Uint8Array(bitfield) });
    bitfield[1] = 0b10000000;
    await repository.update(storage.id, { downloadedPieces: new Uint8Array(bitfield) });
    await repository.update(storage.id, { lastAccessAt: new Date() });
    updates.flush();
    expect(received[1]).toEqual({ sourceId: 7, totalPieces: 800, added: [0, 8] });
    expect(received).toHaveLength(2);
    updates.close();
  });

  it('reports a removed storage as an empty bitfield', async () => {
    const { repository, updates, received } = await setup();
    updates.flush();
    await repository.deleteBySourceId(7);
    updates.flush();
    expect(received.at(-1)).toEqual({ sourceId: 7, totalPieces: 0, bitfield: '' });
    updates.close();
  });

  it('keeps delivering when a listener throws', async () => {
    const { updates, received } = await setup();
    updates.subscribe(() => {
      throw new Error('boom');
    });
    const later = jest.fn();
    updates.subscribe(later);
    updates.flush();
    expect(received).toHaveLength(1);
    expect(later).toHaveBeenCalledTimes(1);
    updates.close();
  });
});
