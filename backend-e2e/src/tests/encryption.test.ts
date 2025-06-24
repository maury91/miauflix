import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';
import * as fs from 'fs';
import sqlite3 from 'sqlite3';

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
      execSync(`docker cp ${containerName}:/usr/src/app/data/database.sqlite ${tempDbPath}`);
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

  describe('MovieSource Entity Encryption', () => {
    it('should store sensitive data encrypted in the database', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // First, get a movie with sources to ensure we have data to test
      const movieResponse = await client.get(['movies', ':id'], {
        param: { id: '550' }, // Use a valid movie ID for testing
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
            // Verify that sensitive fields are stored encrypted (not plaintext)
            // Encrypted data should not match the plaintext values returned by the API
            expect(rawSourceData.ih).not.toBe(source.hash);
            expect(rawSourceData.ml).not.toBe(source.magnetLink);

            // Encrypted data should be base64 encoded strings (typical encryption output)
            expect(rawSourceData.ih).toMatch(/^[A-Za-z0-9+/=]+$/);
            expect(rawSourceData.ml).toMatch(/^[A-Za-z0-9+/=]+$/);

            // Encrypted data should be longer than typical plaintext due to IV + tag + padding
            expect(rawSourceData.ih.length).toBeGreaterThan(source.hash.length);
            expect(rawSourceData.ml.length).toBeGreaterThan(source.magnetLink.length);
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

    it('should properly decrypt data when retrieved through API', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Get movie sources multiple times to ensure decryption is working consistently
      const responses = await Promise.all([
        client.get(['movies', ':id'], { param: { id: '550' }, query: { includeSources: 'true' } }),
        client.get(['movies', ':id'], { param: { id: '550' }, query: { includeSources: 'true' } }),
        client.get(['movies', ':id'], { param: { id: '550' }, query: { includeSources: 'true' } }),
      ]);

      // All responses should be successful
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Skip if no sources available
      const firstResponse = responses[0];
      if (
        'sources' in firstResponse.data === false ||
        !firstResponse.data.sources ||
        firstResponse.data.sources.length === 0
      ) {
        throw new Error('No sources available for decryption testing - test data is required');
      }

      // All responses should return identical decrypted data
      const firstSources = firstResponse.data.sources;

      responses.slice(1).forEach(response => {
        if ('sources' in response.data === false) {
          throw new Error('No sources available for decryption testing - test data is required');
        }
        expect(response.data.sources).toEqual(firstSources);
      });

      // Verify that decrypted data has expected format
      firstSources.forEach((source: any) => {
        // Hash should be 40-character hex string
        expect(source.hash).toMatch(/^[a-fA-F0-9]{40}$/);

        // Magnet link should be properly formatted
        expect(source.magnetLink).toMatch(/^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);

        // Data should be readable strings, properly decrypted
        expect(source.hash).toMatch(/^[a-fA-F0-9]{40}$/); // Valid 40-char hex hash
        expect(source.magnetLink).toContain('magnet:'); // Contains expected prefix
      });
    });

    it('should encrypt all sensitive fields in MovieSource entity', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

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
        throw new Error(
          'No sources available for testing all encrypted fields - test data is required'
        );
      }

      const source = movieResponse.data.sources[0];

      // Verify all sensitive fields are present and properly formatted
      // These fields should be encrypted in the database according to MovieSource entity

      // Hash field (should be decrypted source hash)
      expect(source.hash).toBeDefined();
      expect(typeof source.hash).toBe('string');
      expect(source.hash.length).toBe(40); // SHA-1 hash length

      // Magnet link field (should be decrypted magnet URI)
      expect(source.magnetLink).toBeDefined();
      expect(typeof source.magnetLink).toBe('string');
      expect(source.magnetLink).toMatch(/^magnet:/);

      // If file URL is present, it should also be properly decrypted
      // Note: This field might not always be present depending on the source
    });

    it('should handle encryption/decryption errors gracefully', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Test that the system handles potential encryption issues gracefully
      // This test verifies that even if there are encryption problems, the API doesn't crash

      // Make multiple rapid requests to test encryption service stability
      const promises = Array(10)
        .fill(0)
        .map(() =>
          client.get(['movies', ':id'], { param: { id: '550' }, query: { includeSources: 'true' } })
        );

      const responses = await Promise.all(promises);

      // All requests should complete successfully (not crash due to encryption issues)
      responses.forEach(response => {
        expect([200, 404]).toContain(response.status); // Either success or not found, but not server error
      });

      // If any have sources, they should all be consistent
      const responsesWithSources = responses.filter(
        r => r.status === 200 && 'sources' in r.data && r.data.sources && r.data.sources.length > 0
      );

      if (responsesWithSources.length > 1) {
        const firstResponse = responsesWithSources[0];
        if ('sources' in firstResponse.data === false) {
          throw new Error('No sources available for consistency testing - test data is required');
        }
        const firstSources = firstResponse.data.sources;
        responsesWithSources.slice(1).forEach(response => {
          if ('sources' in response.data === false) {
            throw new Error('No sources available for consistency testing - test data is required');
          }
          expect(response.data.sources).toEqual(firstSources);
        });
      }
    });

    it('should maintain data integrity across encryption/decryption cycles', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      // Get the same source data multiple times over a period to ensure consistency
      const responses = [];

      for (let i = 0; i < 5; i++) {
        const response = await client.get(['movies', ':id'], {
          param: { id: '550' },
          query: { includeSources: 'true' },
        });
        if (response.status === 200) {
          responses.push(response);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (responses.length < 2) {
        throw new Error(
          'Insufficient responses for data integrity testing - need at least 2 responses'
        );
      }

      // All responses should have identical source data
      const firstResponse = responses[0];
      if ('sources' in firstResponse.data === false || !firstResponse.data.sources) {
        throw new Error('No sources available for data integrity testing - test data is required');
      }
      const firstSources = firstResponse.data.sources;

      responses.slice(1).forEach((response, index) => {
        if ('sources' in response.data === false || !response.data.sources) {
          throw new Error(`No sources available in response ${index + 1} - test data is required`);
        }
        expect(response.data.sources).toEqual(firstSources);
      });

      // Verify that hash values are consistent and valid
      if (firstSources && firstSources.length > 0) {
        firstSources.forEach((source: any) => {
          expect(source.hash).toMatch(/^[a-fA-F0-9]{40}$/);
          expect(source.magnetLink).toMatch(/^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);
        });
      }
    });
  });
});
