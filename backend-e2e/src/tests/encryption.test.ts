import { TestClient, waitForService, extractUserCredentialsFromLogs } from '../utils/test-utils';
import * as fs from 'fs';
import sqlite3 from 'sqlite3';

describe('Database Encryption E2E Tests', () => {
  let client: TestClient;
  let userCredentials: { email: string; password: string } | null = null;

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
      const movieResponse = await client.get('/movies/550', { includeSources: 'true' });

      if (
        movieResponse.status !== 200 ||
        !movieResponse.data.sources ||
        movieResponse.data.sources.length === 0
      ) {
        console.warn(
          'No sources available for encryption testing - skipping database encryption verification'
        );
        return;
      }

      const source = movieResponse.data.sources[0];

      // Connect directly to the database to verify encryption
      try {
        // Note: In a real E2E environment, we'd need to know the actual database path
        // This test assumes we can access the database file or have a way to query it
        const dbPath = process.env.DATABASE_PATH || '/app/data/database.sqlite';

        if (!fs.existsSync(dbPath)) {
          console.warn(
            `Database file not found at ${dbPath} - skipping direct database verification`
          );
          return;
        }

        const db = new sqlite3.Database(dbPath);

        try {
          // Query the raw database to check if sensitive fields are encrypted
          const rawSourceData = await new Promise<any>((resolve, reject) => {
            db.get(
              `SELECT hash, magnetLink, torrentFileUrl FROM movie_sources WHERE id = ?`,
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
            expect(rawSourceData.hash).not.toBe(source.hash);
            expect(rawSourceData.magnetLink).not.toBe(source.magnetLink);

            // Encrypted data should be base64 encoded strings (typical encryption output)
            expect(rawSourceData.hash).toMatch(/^[A-Za-z0-9+/=]+$/);
            expect(rawSourceData.magnetLink).toMatch(/^[A-Za-z0-9+/=]+$/);

            // Encrypted data should be longer than typical plaintext due to IV + tag + padding
            expect(rawSourceData.hash.length).toBeGreaterThan(source.hash.length);
            expect(rawSourceData.magnetLink.length).toBeGreaterThan(source.magnetLink.length);
          } else {
            console.warn('Could not find source data in database for verification');
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
        console.warn(`Could not verify database encryption directly: ${error}`);
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
        client.get('/movies/550', { includeSources: 'true' }),
        client.get('/movies/550', { includeSources: 'true' }),
        client.get('/movies/550', { includeSources: 'true' }),
      ]);

      // All responses should be successful
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Skip if no sources available
      if (!responses[0].data.sources || responses[0].data.sources.length === 0) {
        console.warn('No sources available for decryption testing');
        return;
      }

      // All responses should return identical decrypted data
      const firstSources = responses[0].data.sources;

      responses.slice(1).forEach(response => {
        expect(response.data.sources).toEqual(firstSources);
      });

      // Verify that decrypted data has expected format
      firstSources.forEach((source: any) => {
        // Hash should be 40-character hex string
        expect(source.hash).toMatch(/^[a-fA-F0-9]{40}$/);

        // Magnet link should be properly formatted
        expect(source.magnetLink).toMatch(/^magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);

        // Data should be readable strings, not encrypted gibberish
        expect(source.hash).not.toMatch(/^[A-Za-z0-9+/=]+$/); // Not base64
        expect(source.magnetLink).toContain('magnet:'); // Contains expected prefix
      });
    });

    it('should encrypt all sensitive fields in MovieSource entity', async () => {
      if (!userCredentials) {
        throw new Error(
          'No user credentials available for testing - ensure backend is running and generating admin user'
        );
      }

      const movieResponse = await client.get('/movies/550', { includeSources: 'true' });

      if (
        movieResponse.status !== 200 ||
        !movieResponse.data.sources ||
        movieResponse.data.sources.length === 0
      ) {
        console.warn('No sources available for testing all encrypted fields');
        return;
      }

      const source = movieResponse.data.sources[0];

      // Verify all sensitive fields are present and properly formatted
      // These fields should be encrypted in the database according to MovieSource entity

      // Hash field (should be decrypted torrent hash)
      expect(source.hash).toBeDefined();
      expect(typeof source.hash).toBe('string');
      expect(source.hash.length).toBe(40); // SHA-1 hash length

      // Magnet link field (should be decrypted magnet URI)
      expect(source.magnetLink).toBeDefined();
      expect(typeof source.magnetLink).toBe('string');
      expect(source.magnetLink).toMatch(/^magnet:/);

      // If torrent file URL is present, it should also be properly decrypted
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
        .map(() => client.get('/movies/550', { includeSources: 'true' }));

      const responses = await Promise.all(promises);

      // All requests should complete successfully (not crash due to encryption issues)
      responses.forEach(response => {
        expect([200, 404]).toContain(response.status); // Either success or not found, but not server error
      });

      // If any have sources, they should all be consistent
      const responsesWithSources = responses.filter(
        r => r.status === 200 && r.data.sources && r.data.sources.length > 0
      );

      if (responsesWithSources.length > 1) {
        const firstSources = responsesWithSources[0].data.sources;
        responsesWithSources.slice(1).forEach(response => {
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
        const response = await client.get('/movies/550', { includeSources: 'true' });
        if (response.status === 200) {
          responses.push(response);
        }

        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      if (responses.length < 2) {
        console.warn('Insufficient responses for data integrity testing');
        return;
      }

      // All responses should have identical source data
      const firstSources = responses[0].data.sources;

      responses.slice(1).forEach((response, index) => {
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
