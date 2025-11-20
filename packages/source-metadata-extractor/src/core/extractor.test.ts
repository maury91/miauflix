import { extractSourceMetadata } from './extractor';

import {
  AudioCodec,
  ExtractedSourceMetadata,
  Language,
  Quality,
  Source,
  VideoCodec,
} from '@/types';

describe('extractSourceMetadata', () => {
  describe('Movie Sources', () => {
    test.each<{
      name: string;
      size: number;
      runtime?: number;
      extracted: Omit<ExtractedSourceMetadata, 'confidence'>;
    }>([
      {
        name: 'Deep.Cover.2025.Amzn.1080p.WEB-DL.H.264.Dual.YG⭐',
        size: 7474712834,
        extracted: {
          title: 'Deep Cover',
          year: 2025,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [Language.MULTI],
          source: Source.WEB,
        },
      },
      {
        name: 'AngelsandDemons 2009 Extended Cut BluRay 1080p x264 DTS-WiKi',
        size: 12881655529,
        extracted: {
          title: 'AngelsandDemons',
          year: 2009,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.DTS],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Final Destination Bloodlines 2025 1080p WEB-DL HEVC x265 5.1 BONE',
        size: 2546290010,
        extracted: {
          title: 'Final Destination Bloodlines',
          year: 2025,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'F1 The Movie 2025.1080p.WEB-DL.DDP5.1.H264-AOC',
        size: 4001084251,
        extracted: {
          title: 'F1 The Movie',
          year: 2025,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Jims.Story.2024.BDRip.x264-RUSTED',
        size: 942831654,
        extracted: {
          title: 'Jims Story',
          year: 2024,
          quality: undefined,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Hatchet III 2013 1080p BluRay x264 OFT',
        size: 3758096384,
        extracted: {
          title: 'Hatchet III',
          year: 2013,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Harry Potter And The Chamber Of Secrets 2002 PROPER EXTENDED 1080',
        size: 6657199308,
        extracted: {
          title: 'Harry Potter And The Chamber Of Secrets',
          year: 2002,
          quality: Quality.FHD,
          videoCodec: [],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'Game Night 2018 1080p BluRay x265 HEVC 10bit AAC 5 1 Tigole',
        size: 3758096384,
        extracted: {
          title: 'Game Night',
          year: 2018,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X265_10BIT],
          audioCodec: [AudioCodec.AAC],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'First Man 2018 UHD BluRay 1080p DD Atmos 5 1 DoVi HDR10 x265 SM73',
        size: 6764573491,
        extracted: {
          title: 'First Man',
          year: 2018,
          quality: Quality['4K'],
          videoCodec: [VideoCodec.X265],
          audioCodec: [AudioCodec.ATMOS],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Final Destination Bloodlines 2025 1080p 10bit WEBRip 6CH x265 HEV',
        size: 1610612736,
        extracted: {
          title: 'Final Destination Bloodlines',
          year: 2025,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X265_10BIT],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Follow the Bitch 1996 480i NTSC DVD REMUX',
        size: 4939212390,
        extracted: {
          title: 'Follow the Bitch',
          year: 1996,
          quality: Quality.SD,
          videoCodec: [],
          audioCodec: [],
          language: [],
          source: Source.DVD,
        },
      },
      {
        name: 'Four Mothers 2024 1080p AMZN WEB-DL H264-Kitsune',
        size: 5590714257,
        extracted: {
          title: 'Four Mothers',
          year: 2024,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Justin Willman Magic Lover 2025 1080p NF WEB-DL H264-playWEB',
        size: 2479127021,
        extracted: {
          title: 'Justin Willman Magic Lover',
          year: 2025,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      // Test cases for new codec patterns
      {
        name: 'Cosmic Princess 1997 BluRay AV1 DDP 5 1 Multi7 dAV1nci',
        size: 2899102924,
        runtime: 7980,
        extracted: {
          title: 'Cosmic Princess',
          year: 1997,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.AV1],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Cosmic Princess Anime 22 Languages 1997 Multi Subs 720p H264 mp4',
        size: 4434553733,
        extracted: {
          title: 'Cosmic Princess Anime 22 Languages',
          year: 1997,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [Language.MULTI],
          source: undefined,
        },
      },
      {
        name: 'Cosmic Princess 1997 1080p BluRay ENG LATINO HINDI ITA JAP DDP5 1 H265 BEN THE MEN',
        size: 18156974243,
        extracted: {
          title: 'Cosmic Princess',
          year: 1997,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [AudioCodec.EAC3],
          language: [Language.ENGLISH, Language.ITALIAN],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Cosmic Princess 1997 DUBBED BRRip XviD MP3 XVID ORARBG',
        size: 1797259264,
        extracted: {
          title: 'Cosmic Princess',
          year: 1997,
          quality: undefined,
          videoCodec: [VideoCodec.XVID],
          audioCodec: [AudioCodec.MP3],
          language: [],
          source: Source.BLURAY,
        },
      },
      // Test case for AV1 with lower bitrate (should be FHD)
      {
        name: 'Test Movie 2024 AV1 Low Bitrate',
        size: 1500000000, // 1.5 GB
        runtime: 7200, // 2 hours
        extracted: {
          title: 'Test Movie',
          year: 2024,
          quality: Quality.FHD, // ~1.67 Mbps with AV1 should be FHD (≥1.5 Mbps)
          videoCodec: [VideoCodec.AV1],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
    ])('extracts metadata from $name', ({ name, size, runtime, extracted }) => {
      const result = extractSourceMetadata({
        name,
        size,
        ...(runtime ? { trackerMetadata: { runtime } } : {}),
      });

      expect(result.title).toBe(extracted.title);
      expect(result.year).toBe(extracted.year);
      expect(result.quality).toBe(extracted.quality);
      expect(result.videoCodec).toEqual(expect.arrayContaining(extracted.videoCodec));
      if (extracted.videoCodec.length === 0) {
        expect(result.videoCodec).toHaveLength(0);
      }
      expect(result.audioCodec).toEqual(expect.arrayContaining(extracted.audioCodec));
      if (extracted.audioCodec.length === 0) {
        expect(result.audioCodec).toHaveLength(0);
      }
      expect(result.language).toEqual(expect.arrayContaining(extracted.language));
      if (extracted.language.length === 0) {
        expect(result.language).toHaveLength(0);
      }
      expect(result.source).toBe(extracted.source);
      expect(result.confidence.overall).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases and Progressive Removal', () => {
    test.skip('handles complex title with multiple years', () => {
      const result = extractSourceMetadata({
        name: 'Some.Movie.1990.2020.Remastered.2160p.UHD.BluRay.x265.HDR.DTS-HD.MA.7.1-GROUP',
        size: 25000000000,
      });

      // UHD might remain when it's both quality indicator and part of title context
      expect(result.title).toBe('Some Movie');
      expect(result.year).toBe(2020);
      expect(result.quality).toBe(Quality['4K']);
      expect(result.videoCodec).toContain(VideoCodec.X265);
      expect(result.source).toBe(Source.BLURAY);
      expect(result.audioCodec).toContain(AudioCodec.DTS_HD);
    });

    test('progressive removal extracts multiple patterns correctly', () => {
      const result = extractSourceMetadata({
        name: 'DTS.Movie.About.Technology.2023.1080p.BluRay.TrueHD.x264-GROUP',
        size: 8000000000,
      });

      expect(result.title).toContain('Movie About Technology');
      expect(result.year).toBe(2023);
      expect(result.audioCodec).toContain(AudioCodec.TRUEHD);
      expect(result.audioCodec).toBeDefined();
    });

    test('handles release with no technical metadata', () => {
      const result = extractSourceMetadata({
        name: 'Simple Movie Title 2023',
        size: 1500000000,
      });

      expect(result.title).toBe('Simple Movie Title');
      expect(result.year).toBe(2023);
      expect(result.quality).toBeUndefined();
      expect(result.videoCodec).toHaveLength(0);
      expect(result.audioCodec).toHaveLength(0);
      expect(result.confidence.overall).toBeLessThan(50);
      expect(result.confidence.year).toBeGreaterThan(0);
    });

    test('confidence scoring works correctly', () => {
      const complexResult = extractSourceMetadata({
        name: 'Movie.2023.2160p.UHD.BluRay.x265.10bit.HDR.TrueHD.Atmos.7.1-GROUP',
        size: 30000000000,
      });

      const simpleResult = extractSourceMetadata({
        name: 'Movie Title',
        size: 1000000000,
      });

      expect(complexResult.confidence.overall).toBeGreaterThan(simpleResult.confidence.overall);
      expect(simpleResult.confidence.overall).toBeLessThan(30);
    });

    test('handles modern release patterns from live data', () => {
      const result = extractSourceMetadata({
        name: 'Goodrich 2024 BluRay 1080p DDP 5 1 x264 hallowed',
        size: 8912057139,
      });

      expect(result.title).toBe('Goodrich');
      expect(result.year).toBe(2024);
      expect(result.quality).toBe(Quality.FHD);
      expect(result.videoCodec).toContain(VideoCodec.X264);
      expect(result.source).toBe(Source.BLURAY);
      expect(result.audioCodec).toContain(AudioCodec.EAC3);
    });

    test('fallback quality detection works with standalone numbers', () => {
      const result = extractSourceMetadata({
        name: 'Movie Title 720 BluRay x264-GROUP',
        size: 2000000000,
      });

      expect(result.title).toContain('Movie Title');
      expect(result.quality).toBe(Quality.HD);
      expect(result.confidence.quality).toBeLessThan(50); // Lower confidence for fallback
    });
  });

  describe('Performance and Edge Cases', () => {
    test('handles very long source names efficiently', () => {
      const result = extractSourceMetadata({
        name: 'Very.Long.Movie.Title.With.Many.Words.And.Technical.Details.2023.2160p.UHD.BluRay.REMUX.x265.10bit.HDR10.Plus.TrueHD.Atmos.7.1.DTS-HD.MA.5.1.Multi.Language.Subtitles.Director.Commentary.Making.Of.Deleted.Scenes-SUPERLONGRELEASEGROUPNAME',
        size: 50000000000,
      });

      expect(result.confidence.overall).toBeGreaterThan(0);
      expect(result.quality).toBe(Quality['4K']);
      expect(result.year).toBe(2023);
      expect(result.title).toContain('Very Long Movie Title');
    });

    test('handles special characters and unicode', () => {
      const result = extractSourceMetadata({
        name: 'Café.París.2023.1080p.BluRay.x264.AC3-FRANÇAIS★',
        size: 3000000000,
      });

      expect(result.title).toContain('Café París');
      expect(result.year).toBe(2023);
      expect(result.quality).toBe(Quality.FHD);
      expect(result.audioCodec).toContain(AudioCodec.AC3);
    });

    test('handles mixed case and inconsistent formatting', () => {
      const result = extractSourceMetadata({
        name: 'MoViE.nAmE.2023.1080P.bLuRaY.X264.dTs-GrOuP',
        size: 4000000000,
      });

      expect(result.title).toBe('MoViE nAmE');
      expect(result.year).toBe(2023);
      expect(result.quality).toBe(Quality.FHD);
      expect(result.videoCodec).toContain(VideoCodec.X264);
      expect(result.source).toBe(Source.BLURAY);
      expect(result.audioCodec).toContain(AudioCodec.DTS);
    });

    test('extracts from real horror franchise release', () => {
      const result = extractSourceMetadata({
        name: 'Feast II Sloppy Seconds 2008 1080P BLURAY X264 WATCHABLE',
        size: 9019431321,
      });

      expect(result.title).toBe('Feast II Sloppy Seconds');
      expect(result.year).toBe(2008);
      expect(result.quality).toBe(Quality.FHD);
      expect(result.videoCodec).toContain(VideoCodec.X264);
      expect(result.source).toBe(Source.BLURAY);
    });

    test('validates core extraction functionality', () => {
      const result = extractSourceMetadata({
        name: 'The.Matrix.1999.1080p.BluRay.x264.DTS-HD.MA.7.1-GROUP',
        size: 8000000000,
      });

      expect(result.title).toContain('The Matrix');
      expect(result.year).toBe(1999);
      expect(result.quality).toBe(Quality.FHD);
      expect(result.videoCodec).toContain(VideoCodec.X264);
      expect(result.source).toBe(Source.BLURAY);
      expect(result.audioCodec).toContain(AudioCodec.DTS_HD);
      expect(result.confidence.overall).toBeGreaterThan(0);
    });

    test('handles release without year', () => {
      const result = extractSourceMetadata({
        name: 'Movie.Without.Year.1080p.BluRay.x264-GROUP',
        size: 4000000000,
      });

      expect(result.title).toContain('Movie Without Year');
      expect(result.year).toBeUndefined();
      expect(result.confidence.year).toBe(0);
    });
  });
  describe('TV Show Sources', () => {
    test.each<{
      name: string;
      size: number;
      extracted: Omit<ExtractedSourceMetadata, 'confidence'>;
    }>([
      // Real data from TheRarBG TV category
      {
        name: 'Jimmy Kimmel 2025 06 18 Charlie Day 720p HEVC x265 MeGusta EZTV',
        size: 276661054,
        extracted: {
          title: 'Jimmy Kimmel',
          year: 2025,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'Matices S01E05 Mr Mrs Polan 1080p SKST WEB DL DD 5 1 H 264 playWEB EZTV',
        size: 2058071516,
        extracted: {
          title: 'Matices',
          season: 1,
          episode: 5,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.AC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'The.Waterfront.S01E03.1080p.AV1.10bit-MeGusta',
        size: 402186504,
        extracted: {
          title: 'The Waterfront',
          season: 1,
          episode: 3,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.AV1_10BIT],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'The.Waterfront.S01E07.720p.HEVC.x265-MeGusta',
        size: 465209048,
        extracted: {
          title: 'The Waterfront',
          season: 1,
          episode: 7,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'The Buccaneers S02E01 The Duchess of Tintagel 2160p ATVP WEB-DL DDP5 1 Atmo',
        size: 8768922007,
        extracted: {
          title: 'The Buccaneers',
          season: 2,
          episode: 1,
          quality: Quality['4K'],
          videoCodec: [],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Criminal Minds S18E07 All the Devils are Here 720p AMZN WEB-DL DDP5 1 H 264',
        size: 1099807847,
        extracted: {
          title: 'Criminal Minds',
          season: 18,
          episode: 7,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'The Daily Show 2025 06 18 Matt Berninger 720p HEVC x265 MeGusta EZTV',
        size: 243503238,
        extracted: {
          title: 'The Daily Show',
          year: 2025,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'Expedition Unknown S15E01 Hitlers Amerikabomber 720p AMZN WEB DL DDP2 0 H 264 RAWR EZTV',
        size: 2184531900,
        extracted: {
          title: 'Expedition Unknown',
          season: 15,
          episode: 1,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Jimmy Kimmel 2025 06 18 Charlie Day 480p x264 mSD EZTV',
        size: 200272616,
        extracted: {
          title: 'Jimmy Kimmel',
          year: 2025,
          quality: Quality.SD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'The Secret Of Skinwalker Ranch S06E03 720p WEB H264 JFF EZTV',
        size: 862202796,
        extracted: {
          title: 'The Secret Of Skinwalker Ranch',
          season: 6,
          episode: 3,
          quality: Quality.HD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Criminal Minds S18E07 All the Devils Are Here 2160p PMTP WEB-DL DDP5 1 DV H',
        size: 3655448726,
        extracted: {
          title: 'Criminal Minds',
          season: 18,
          episode: 7,
          quality: Quality['4K'],
          videoCodec: [],
          audioCodec: [AudioCodec.EAC3],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'The.Buccaneers.2023.S02E01.1080p.x265-ELiTE',
        size: 885489195,
        extracted: {
          title: 'The Buccaneers',
          year: 2023,
          season: 2,
          episode: 1,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X265],
          audioCodec: [],
          language: [],
          source: undefined,
        },
      },
      {
        name: 'Stick S01E05 The Birdie Machine 2160p ATVP WEB-DL DDP5 1 Atmos HDR H 265-ST',
        size: 5659678738,
        extracted: {
          title: 'Stick',
          season: 1,
          episode: 5,
          quality: Quality['4K'],
          videoCodec: [VideoCodec.X265],
          audioCodec: [AudioCodec.EAC3, AudioCodec.ATMOS],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Rick and Morty S08E05 1080p WEB H264-SuccessfulCrab',
        size: 2585073376,
        extracted: {
          title: 'Rick and Morty',
          season: 8,
          episode: 5,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Resident Alien S04E03 1080p WEBRip x264-BAE',
        size: 2538826010,
        extracted: {
          title: 'Resident Alien',
          season: 4,
          episode: 3,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Alone S12E02 1080p HULU WEB-DL AAC2 0 H 264-RAWR',
        size: 4039867833,
        extracted: {
          title: 'Alone',
          season: 12,
          episode: 2,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.AAC],
          language: [],
          source: Source.WEB,
        },
      },
    ])('extracts metadata from TV show: $name', ({ name, size, extracted }) => {
      const result = extractSourceMetadata({ name, size });

      expect(result.title).toBe(extracted.title);
      if (extracted.year !== undefined) {
        expect(result.year).toBe(extracted.year);
      }
      if (extracted.season !== undefined) {
        expect(result.season).toBe(extracted.season);
      }
      if (extracted.episode !== undefined) {
        expect(result.episode).toBe(extracted.episode);
      }
      expect(result.quality).toBe(extracted.quality);
      expect(result.videoCodec).toEqual(expect.arrayContaining(extracted.videoCodec));
      if (extracted.videoCodec.length === 0) {
        expect(result.videoCodec).toHaveLength(0);
      }
      expect(result.audioCodec).toEqual(expect.arrayContaining(extracted.audioCodec));
      if (extracted.audioCodec.length === 0) {
        expect(result.audioCodec).toHaveLength(0);
      }
      expect(result.language).toEqual(expect.arrayContaining(extracted.language));
      if (extracted.language.length === 0) {
        expect(result.language).toHaveLength(0);
      }
      expect(result.source).toBe(extracted.source);
      expect(result.confidence.overall).toBeGreaterThan(0);
    });
  });

  describe('TV Show Edge Cases and Additional Patterns', () => {
    test.each<{
      name: string;
      size: number;
      extracted: Omit<ExtractedSourceMetadata, 'confidence'>;
    }>([
      // Comprehensive test cases for edge cases
      {
        name: 'Breaking.Bad.S01E01.Pilot.BluRay.1080p.x264.DTS-HD.MA.5.1-DHD',
        size: 4294967296,
        extracted: {
          title: 'Breaking Bad',
          season: 1,
          episode: 1,
          quality: Quality.FHD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [AudioCodec.DTS_HD],
          language: [],
          source: Source.BLURAY,
        },
      },
      {
        name: 'Royal Chronicles.S08E06.The.Iron.Throne.HDTV.x264-KILLERS',
        size: 536870912,
        extracted: {
          title: 'Royal Chronicles',
          season: 8,
          episode: 6,
          quality: undefined,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.HDTV,
        },
      },
      {
        name: 'Stranger.Things.S04E09.The.Piggyback.2160p.NF.WEB-DL.x265.10bit.HDR.DDP5.1.Atmos-NTb',
        size: 8589934592,
        extracted: {
          title: 'Stranger Things',
          season: 4,
          episode: 9,
          quality: Quality['4K'],
          videoCodec: [VideoCodec.X265_10BIT],
          audioCodec: [AudioCodec.EAC3, AudioCodec.ATMOS],
          language: [],
          source: Source.WEB,
        },
      },
      {
        name: 'Friends.1x01.The.One.Where.Monica.Gets.a.Roommate.DVDRip.XviD-SAiNTS',
        size: 367001600,
        extracted: {
          title: 'Friends',
          season: 1,
          episode: 1,
          quality: undefined,
          videoCodec: [VideoCodec.XVID],
          audioCodec: [],
          language: [],
          source: Source.DVD,
        },
      },
      {
        name: 'The.Office.US.S09E23.Finale.480p.WEB-DL.x264-mSD',
        size: 268435456,
        extracted: {
          title: 'The Office US',
          season: 9,
          episode: 23,
          quality: Quality.SD,
          videoCodec: [VideoCodec.X264],
          audioCodec: [],
          language: [],
          source: Source.WEB,
        },
      },
    ])('extracts metadata from comprehensive TV test: $name', ({ name, size, extracted }) => {
      const result = extractSourceMetadata({ name, size });

      expect(result.title).toBe(extracted.title);
      expect(result.season).toBe(extracted.season);
      expect(result.episode).toBe(extracted.episode);
      expect(result.quality).toBe(extracted.quality);
      expect(result.videoCodec).toEqual(expect.arrayContaining(extracted.videoCodec));
      if (extracted.videoCodec.length === 0) {
        expect(result.videoCodec).toHaveLength(0);
      }
      expect(result.audioCodec).toEqual(expect.arrayContaining(extracted.audioCodec));
      if (extracted.audioCodec.length === 0) {
        expect(result.audioCodec).toHaveLength(0);
      }
      expect(result.language).toEqual(expect.arrayContaining(extracted.language));
      if (extracted.language.length === 0) {
        expect(result.language).toHaveLength(0);
      }
      expect(result.source).toBe(extracted.source);
      expect(result.confidence.overall).toBeGreaterThan(0);
    });

    test('handles TV show without season/episode info', () => {
      const result = extractSourceMetadata({
        name: 'Documentary.Series.2023.1080p.WEB-DL.H264-GROUP',
        size: 2000000000,
      });

      expect(result.title).toBe('Documentary Series');
      expect(result.season).toBeUndefined();
      expect(result.episode).toBeUndefined();
      expect(result.year).toBe(2023);
    });

    test('handles alternative season format (S1 instead of S01)', () => {
      const result = extractSourceMetadata({
        name: 'Show.Name.S1E5.Episode.Title.720p.WEB-DL.x264-GROUP',
        size: 1000000000,
      });

      expect(result.title).toBe('Show Name');
      expect(result.season).toBe(1);
      expect(result.episode).toBe(5);
    });

    test('handles multi-episode releases', () => {
      const result = extractSourceMetadata({
        name: 'TV.Show.S02E01-E03.Triple.Episode.1080p.WEB-DL.x264-GROUP',
        size: 4000000000,
      });

      expect(result.title).toBe('TV Show');
      expect(result.season).toBe(2);
      expect(result.episode).toBe(1); // Should extract first episode from range
    });

    test('handles anime-style numbering', () => {
      const result = extractSourceMetadata({
        name: 'Anime.Series.E001.First.Episode.1080p.BluRay.x264-GROUP',
        size: 1500000000,
      });

      expect(result.title).toBe('Anime Series');
      expect(result.episode).toBe(1);
      expect(result.season).toBeUndefined(); // No season info
    });
  });
});
