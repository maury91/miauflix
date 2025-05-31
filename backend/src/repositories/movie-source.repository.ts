import type { DataSource, Repository } from 'typeorm';

import { MovieSource as MovieSourceEntity } from '@entities/movie-source.entity';
import type { EncryptionService } from '@services/encryption/encryption.service';

export interface MovieSource extends Omit<MovieSourceEntity, 'file' | 'ih' | 'ml'> {
  hash: string;
  magnetLink: string;
  torrentFile?: Buffer; // Optional torrent file data
}

export class MovieSourceRepository {
  private readonly movieSourceRepository: Repository<MovieSourceEntity>;

  constructor(
    datasource: DataSource,
    private readonly encryptionService: EncryptionService
  ) {
    this.movieSourceRepository = datasource.getRepository(MovieSourceEntity);
  }

  private encryptSource(source: Partial<MovieSource>): Partial<MovieSourceEntity> {
    const { hash, magnetLink, torrentFile, ...rest } = source;
    return {
      ...rest,
      ih: hash ? this.encryptionService.encryptString(hash, true) : undefined,
      ml: magnetLink ? this.encryptionService.encryptString(magnetLink) : undefined,
      file: torrentFile ? this.encryptionService.encryptBuffer(torrentFile) : undefined,
    };
  }

  public decryptSource(source: MovieSourceEntity): MovieSource;
  public decryptSource(source: Partial<MovieSourceEntity>): Partial<MovieSource>;
  public decryptSource(
    source: MovieSourceEntity | Partial<MovieSourceEntity>
  ): MovieSource | Partial<MovieSource> {
    const { ih, ml, file, ...rest } = source;

    return {
      ...rest,
      hash: ih ? this.encryptionService.decryptString(ih) : undefined,
      magnetLink: ml ? this.encryptionService.decryptString(ml) : undefined,
      torrentFile: file ? this.encryptionService.decryptBuffer(file) : undefined,
    };
  }

  /**
   * Get the underlying TypeORM repository for advanced queries
   */
  getRepository(): Repository<MovieSourceEntity> {
    return this.movieSourceRepository;
  }

  /**
   * Find all sources for a specific movie
   */
  async findByMovieId(movieId: number): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.find({ where: { movieId } });
    return sources.map(source => this.decryptSource(source));
  }

  /**
   * Create a new movie source
   */
  async create(source: Partial<MovieSourceEntity>): Promise<MovieSource> {
    const newSource = this.movieSourceRepository.create(this.encryptSource(source));
    const savedSource = await this.movieSourceRepository.save(newSource);
    return this.decryptSource(savedSource);
  }

  /**
   * Create multiple movie sources at once
   */
  async createMany(sources: Partial<MovieSourceEntity>[]): Promise<MovieSource[]> {
    const newSources = sources.map(source => this.encryptSource(source));
    const savedSources = await this.movieSourceRepository.save(newSources);
    return savedSources.map(source => this.decryptSource(source));
  }

  /**
   * Find a source by hash for a specific movie
   */
  async findByMovieAndHash(movieId: number, hash: string): Promise<MovieSource | null> {
    const encryptedHash = this.encryptionService.encryptString(hash, true);
    const source = await this.movieSourceRepository.findOne({
      where: {
        movieId,
        ih: encryptedHash,
      },
    });
    return source ? this.decryptSource(source) : null;
  }

  /**
   * Delete all sources for a movie
   */
  async deleteByMovieId(movieId: number): Promise<void> {
    await this.movieSourceRepository.delete({ movieId });
  }

  /**
   * Update a movie source with torrent file data
   */
  async updateTorrentFile(sourceId: number, torrentFile: Buffer): Promise<void> {
    await this.movieSourceRepository.update(
      sourceId,
      this.encryptSource({
        torrentFile,
      })
    );
  }

  /**
   * Find a movie source by its ID
   */
  async findById(sourceId: number): Promise<MovieSource | null> {
    const source = await this.movieSourceRepository.findOne({ where: { id: sourceId } });
    return source ? this.decryptSource(source) : null;
  }

  /**
   * Save an existing movie source (used by migration)
   */
  async save(source: MovieSource): Promise<MovieSource> {
    const savedSource = await this.movieSourceRepository.save(this.encryptSource(source));
    return this.decryptSource(savedSource);
  }

  /**
   * Find all sources (used by migration)
   */
  async findAll(): Promise<MovieSource[]> {
    const sources = await this.movieSourceRepository.find();
    return sources.map(source => this.decryptSource(source));
  }
}
