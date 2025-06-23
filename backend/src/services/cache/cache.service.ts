import KeyvSqlite from '@keyv/sqlite';
import { logger } from '@logger';
import type { Cache } from 'cache-manager';
import { createCache } from 'cache-manager';
import { CacheableMemory, Keyv } from 'cacheable';
import path from 'path';
import sqlite3 from 'sqlite3';

import { ENV } from '@constants';

export class CacheService {
  private db: sqlite3.Database;
  private maximumEmptySpace = ENV('MAXIMUM_CACHE_EMPTY_SPACE');
  public cache: Cache;

  constructor() {
    // Also create direct database connection for queries
    const dbFilePath = path.resolve(ENV('DATA_DIR'), 'cache.sqlite');
    this.db = new sqlite3.Database(dbFilePath);

    this.cache = createCache({
      stores: [
        // Memory-based cache
        new Keyv({
          store: new CacheableMemory({
            lruSize: 500,
          }),
        }),

        // File-based cache
        new Keyv({
          store: new KeyvSqlite(`sqlite://${dbFilePath}`),
        }),
      ],
    });
  }

  /**
   * Get expired cache entries using efficient SQL query
   */
  private async getExpiredCacheEntries(): Promise<{ count: number; size: number }> {
    return new Promise((resolve, reject) => {
      this.db.get(
        `SELECT COUNT(*) as count, SUM(LENGTH(value)) as size 
         FROM keyv 
         WHERE json_extract(value, "$.expires") < (strftime('%s', 'now') * 1000);`,
        (err: Error | null, row: { count: number; size: number }) => {
          if (err) {
            reject(err);
            return;
          }

          resolve({
            count: row.count,
            size: row.size || 0, // Handle null case when no rows match
          });
        }
      );
    });
  }

  /**
   * Delete expired entries directly from database using efficient SQL
   */
  private async deleteExpiredEntriesFromDB(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM keyv WHERE json_extract(value, "$.expires") < (strftime('%s', 'now') * 1000)`,
        function (this: { changes: number }, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes || 0);
          }
        }
      );
    });
  }

  /**
   * Reclaim disk space by running VACUUM on the database
   */
  private async vacuumDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.debug('CacheService', 'Running VACUUM to reclaim disk space...');
      this.db.run('VACUUM', (err: Error | null) => {
        if (err) {
          reject(err);
        } else {
          logger.debug('CacheService', 'VACUUM completed successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Get the actual free space in the database using SQLite's freelist
   */
  private async getEmptySpace(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT (freelist_count*page_size) as empty_space FROM pragma_freelist_count, pragma_page_size',
        (err: Error | null, row: { empty_space: number }) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.empty_space || 0);
          }
        }
      );
    });
  }

  /**
   * Format bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Perform actual cleanup - delete expired entries
   */
  async cleanup(): Promise<void> {
    logger.debug('CacheService', 'Starting cache cleanup...');

    try {
      const { count, size } = await this.getExpiredCacheEntries();

      if (count === 0) {
        logger.debug('CacheService', '✅ No expired entries found. Cache is clean!');
        return;
      }

      logger.info('CacheService', `🗑️  Deleting ${count} expired entries...`);

      const deletedCount = await this.deleteExpiredEntriesFromDB();

      const shouldVacuum = (await this.getEmptySpace()) >= this.maximumEmptySpace;
      if (shouldVacuum) {
        const freeSpace = await this.getEmptySpace();
        logger.info(
          'CacheService',
          `Accumulated free space: ${this.formatBytes(freeSpace)} - running VACUUM`
        );
        await this.vacuumDatabase();
      }

      logger.info('CacheService', `✅ Cache cleanup completed successfully!`);
      logger.info(
        'CacheService',
        `Deleted entries: ${deletedCount} | Freed space: ${this.formatBytes(size)}`
      );
    } catch (error) {
      logger.error('CacheService', 'Error during cleanup:', error);
      throw error;
    }
  }
}
