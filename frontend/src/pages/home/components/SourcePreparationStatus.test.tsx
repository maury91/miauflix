import type { PreloadPreparationSnapshot } from '@miauflix/backend';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SourcePreparationStatus } from './SourcePreparationStatus';

const baseSnapshot = (overrides: Record<string, unknown> = {}): PreloadPreparationSnapshot =>
  ({
    playable: { kind: 'movie', mediaId: 42 },
    state: 'source_found',
    ...overrides,
  }) as PreloadPreparationSnapshot;

describe('SourcePreparationStatus', () => {
  it('shows digital cinema source metadata', () => {
    render(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="browse"
        preparation={baseSnapshot({ source: { id: 760, quality: 'FHD', sourceType: 'DCP' } })}
      />
    );
    expect(screen.getByText('DCP')).toBeInTheDocument();
    expect(screen.getByText('1080p')).toBeInTheDocument();
  });

  it('shows known resolution and generic release badges', () => {
    render(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="browse"
        preparation={baseSnapshot({
          source: { id: 9, quality: 'FHD', sourceType: 'WEB' },
        })}
      />
    );

    expect(screen.getByText('1080p')).toBeInTheDocument();
    expect(screen.getByText('WEB')).toBeInTheDocument();
    expect(screen.queryByText('WEBRip')).not.toBeInTheDocument();
  });

  it('keeps source metadata visible while discovery is still checking', () => {
    render(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="browse"
        preparation={baseSnapshot({
          state: 'checking',
          source: { id: 9, quality: 'HD', sourceType: 'BLURAY' },
        })}
      />
    );

    expect(screen.getByText('Checking sources')).toBeInTheDocument();
    expect(screen.getByText('720p')).toBeInTheDocument();
    expect(screen.getByText('Blu-ray')).toBeInTheDocument();
  });

  it('adds an accessible quality warning icon for CAM and TS releases', () => {
    render(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="details"
        preparation={baseSnapshot({
          source: { id: 9, quality: 'SD', sourceType: 'CAM' },
        })}
      />
    );

    expect(
      screen.getByRole('img', { name: 'CAM release may have lower audio and video quality.' })
    ).toBeInTheDocument();
    expect(screen.getByText('CAM')).toBeInTheDocument();
  });

  it('shows warmup only in details while browse remains discovery-only', () => {
    const preparation = baseSnapshot({
      source: { id: 9, quality: 'FHD', sourceType: 'WEB' },
      warmup: { state: 'warming' },
    });

    const { rerender } = render(
      <SourcePreparationStatus mediaKind="movie" mode="browse" preparation={preparation} />
    );
    expect(screen.queryByText('Source found')).not.toBeInTheDocument();
    expect(screen.queryByText('Warming up torrent…')).not.toBeInTheDocument();

    rerender(
      <SourcePreparationStatus mediaKind="movie" mode="details" preparation={preparation} />
    );
    expect(screen.queryByText('Source found')).not.toBeInTheDocument();
    expect(screen.getByText('Warming up torrent…')).toBeInTheDocument();

    rerender(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="details"
        preparation={baseSnapshot({ warmup: { state: 'ready' } })}
      />
    );
    expect(screen.getByText('Initial buffer ready')).toBeInTheDocument();
  });

  it('shows checking for a movie without a snapshot and nothing for a show', () => {
    const { rerender } = render(
      <SourcePreparationStatus mediaKind="movie" mode="browse" preparation={null} />
    );
    expect(screen.getByText('Checking sources')).toBeInTheDocument();

    rerender(<SourcePreparationStatus mediaKind="tvshow" mode="browse" preparation={null} />);
    expect(screen.queryByText('Checking sources')).not.toBeInTheDocument();
  });

  it('keeps a pending source honest and reports paused warmup', () => {
    const { rerender } = render(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="browse"
        preparation={baseSnapshot({ state: 'no_source' })}
      />
    );
    expect(screen.getByText('No compatible source found yet')).toBeInTheDocument();

    rerender(
      <SourcePreparationStatus
        mediaKind="movie"
        mode="details"
        preparation={baseSnapshot({ state: 'unknown', warmup: { state: 'paused' } })}
      />
    );
    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.queryByText('Checking sources')).not.toBeInTheDocument();
  });
});
