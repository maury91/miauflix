import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { Database } from '@database/database';
import type { ConfigurationService } from '@services/configuration/configuration.service';

/**
 * Test database helper utilities for creating isolated test databases
 */
export class TestDatabaseHelper {
  private static readonly TEST_BASE_DIR = '/tmp/miauflix-test';
  private testDir: string;
  private database: Database | null = null;
  private readonly encryptionKey: string;

  constructor() {
    // Create unique test directory for this test instance
    this.testDir = path.join(TestDatabaseHelper.TEST_BASE_DIR, `test-${uuidv4()}`);
    this.encryptionKey = randomBytes(32).toString('base64');
  }

  /**
   * Setup isolated test database with unique DATA_DIR
   */
  async setupTestDatabase(): Promise<Database> {
    // Ensure test directory exists
    await fs.promises.mkdir(this.testDir, { recursive: true });

    const testDir = this.testDir;
    const encryptionKey = this.encryptionKey;
    const mockConfig = {
      get: (key: string) => {
        if (key === 'DATA_DIR') return testDir;
        if (key === 'SOURCE_SECURITY_KEY') return encryptionKey;
        return undefined;
      },
      getOrThrow: (key: string) => {
        if (key === 'DATA_DIR') return testDir;
        if (key === 'SOURCE_SECURITY_KEY') return encryptionKey;
        throw new Error(`${key} is not set`);
      },
    } as unknown as ConfigurationService;

    // Initialize database
    this.database = new Database(mockConfig);
    await this.database.initialize();

    return this.database;
  }

  /**
   * Get the current test database instance
   */
  getDatabase(): Database {
    if (!this.database) {
      throw new Error('Test database not initialized. Call setupTestDatabase() first.');
    }
    return this.database;
  }

  /**
   * Clean up test database and remove all test files
   */
  async cleanup(): Promise<void> {
    try {
      // Close database connection
      if (this.database) {
        await this.database.close();
        this.database = null;
      }

      // Remove test directory and all its contents
      if (fs.existsSync(this.testDir)) {
        await fs.promises.rm(this.testDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Error cleaning up test database: ${error}`);
      // Don't throw to avoid masking test failures
    }
  }

  /**
   * Get the test directory path
   */
  getTestDir(): string {
    return this.testDir;
  }

  /**
   * Get database file path for this test instance
   */
  getDatabasePath(): string {
    return path.join(this.testDir, 'database.sqlite');
  }

  /**
   * Check if database file exists
   */
  databaseExists(): boolean {
    return fs.existsSync(this.getDatabasePath());
  }
}

/**
 * Create a test database helper for use in tests
 */
export function createTestDatabase(): TestDatabaseHelper {
  return new TestDatabaseHelper();
}

/**
 * Setup and teardown helper for Jest tests
 */
export function setupDatabaseTest() {
  let dbHelper: TestDatabaseHelper;
  let database: Database;

  beforeEach(async () => {
    dbHelper = createTestDatabase();
    database = await dbHelper.setupTestDatabase();
  });

  afterEach(async () => {
    if (dbHelper) {
      await dbHelper.cleanup();
    }
  });

  return {
    getDatabase: () => database,
    getDatabaseHelper: () => dbHelper,
  };
}
