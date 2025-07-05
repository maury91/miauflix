import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';
import sqlite3 from 'sqlite3';

const DATABASE_FILE = '/usr/src/app/data/database.sqlite';

describe('Database Encryption E2E Tests', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

  // Temp folder for copied DB files
  const os = require('os');
  const fs = require('fs');
  const path = require('path');
  const tmpDbDir = path.join(os.tmpdir(), 'miauflix-e2e-db');
  if (!fs.existsSync(tmpDbDir)) {
    fs.mkdirSync(tmpDbDir, { recursive: true });
  }

  const getDatabase = () => {
    // Copy the database file out of the running backend container
    const path = require('path');
    const fs = require('fs');
    const { execSync } = require('child_process');

    // Find the running backend container name (docker-compose test env)
    let containerName = '';
    try {
      containerName = execSync('docker ps --filter "name=backend" --format "{{.Names}}" | head -n1')
        .toString()
        .trim();
    } catch (err) {
      throw new Error('Could not find running backend container: ' + err);
    }

    if (!containerName) {
      throw new Error('No running backend container found');
    }

    // Copy the database file from the container to a temp location
    const tempDbPath = path.join(tmpDbDir, `database.sqlite.testcopy.${Date.now()}`);
    try {
      execSync(`docker cp ${containerName}:${DATABASE_FILE} ${tempDbPath}`);
    } catch (err) {
      throw new Error(`Failed to copy database from container (${containerName}): ${err}`);
    }

    if (!fs.existsSync(tempDbPath)) {
      throw new Error(`Database file not found at ${tempDbPath} after docker cp`);
    }

    return new sqlite3.Database(tempDbPath);
  };

  afterAll(() => {
    // Remove all files in the temp db dir and the dir itself
    if (fs.existsSync(tmpDbDir)) {
      fs.readdirSync(tmpDbDir).forEach((file: string) => {
        fs.unlinkSync(path.join(tmpDbDir, file));
      });
      fs.rmdirSync(tmpDbDir);
    }
  });

  beforeAll(async () => {
    client = new TestClient();

    try {
      await waitForService(client);

      // Try to extract user credentials from Docker logs
      userCredentials = await extractUserCredentialsFromLogs();

      if (userCredentials) {
        // Login to get authentication
        await client.login(userCredentials);
      }
    } catch (error) {
      console.log('❌ Backend service is not available. Ensure the Docker environment is running.');
      throw error;
    }
  }, 60000);

  describe('Database Encryption', () => {
    it('should store sensitive MovieSource fields encrypted in database', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // First, get a movie with sources to ensure we have data to test
      const movieResponse = await client.get(['movies', ':id'], {
        param: { id: '550' },
        query: { includeSources: 'true' },
      });

      if (
        movieResponse.status !== 200 ||
        'sources' in movieResponse.data === false ||
        !movieResponse.data.sources ||
        movieResponse.data.sources.length === 0
      ) {
        throw new Error('No sources available for encryption testing - test data is required');
      }

      const source = movieResponse.data.sources[0];

      // Connect directly to the database to verify encryption
      try {
        const db = getDatabase();

        try {
          // Query the raw database to check if sensitive fields are encrypted
          const rawSourceData = await new Promise<any>((resolve, reject) => {
            db.get(
              `SELECT ih, ml, file FROM movie_source WHERE id = ?`,
              [source.id],
              (err, row) => {
                if (err) reject(err);
                else resolve(row);
              }
            );
          });

          if (rawSourceData) {
            // Verify that sensitive fields are stored encrypted in database
            // These fields should be encrypted base64 strings, not plaintext
            expect(rawSourceData.ih).toMatch(/^[A-Za-z0-9+/=]+$/);
            expect(rawSourceData.ml).toMatch(/^[A-Za-z0-9+/=]+$/);

            // Encrypted data should be longer than typical hash/magnet lengths due to IV + tag + padding
            expect(rawSourceData.ih.length).toBeGreaterThan(40); // Longer than SHA-1 hash
            expect(rawSourceData.ml.length).toBeGreaterThan(50); // Longer than typical magnet link start
          } else {
            throw new Error('Could not find source data in database for verification');
          }
        } finally {
          await new Promise<void>(resolve => {
            db.close(err => {
              if (err) console.warn('Error closing database:', err);
              resolve();
            });
          });
        }
      } catch (error) {
        throw new Error(`Could not verify database encryption directly: ${error}`);
      }
    });

    // TODO: Proper encryption e2e tests should be implemented
    // The following tests are marked as .todo because they would properly test encryption functionality
    // rather than duplicating API validation tests that belong in sources.test.ts

    it.todo('should test EncryptionService initialization with MovieSource entity static property');

    it.todo('should test end-to-end encryption/decryption through entity transformers');

    it.todo('should test encryption service error handling when keys are missing or invalid');

    it.todo(
      'should test deterministic vs non-deterministic encryption for hash vs magnetLink fields'
    );

    it.todo('should test that encrypted fields can be round-trip encrypted/decrypted correctly');

    it.todo('should test encryption service buffer operations for torrent file data');

    it.todo(
      'should test that changing encryption keys breaks existing data decryption as expected'
    );

    it.todo('should test encryption service initialization from environment variables');
  });
});
