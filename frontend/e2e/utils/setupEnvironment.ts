import { promises as fs } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

interface GlobalSetupOptions {
  waitForBackend?: boolean;
  backendHealthPath?: string;
  maxAttempts?: number;
  delayMs?: number;
  credentialsPath?: string;
}

async function waitForBackendReady(
  backendUrl: string,
  healthPath: string,
  attempts: number,
  backoffMs: number
): Promise<void> {
  const healthUrl = new URL(healthPath, backendUrl).toString();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(healthUrl, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
    }

    await delay(backoffMs);
  }

  throw new Error(`Backend at ${healthUrl} did not respond with 2xx within ${attempts} attempts.`);
}

async function loadAdminCredentials(credentialsFile: string): Promise<void> {
  try {
    await fs.access(credentialsFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    console.warn(
      `[e2e global setup] Unable to access credentials file at ${credentialsFile}:`,
      error
    );
    return;
  }

  try {
    const raw = await fs.readFile(credentialsFile, 'utf-8');
    const data = JSON.parse(raw) as { adminEmail?: string; adminPassword?: string };

    if (data.adminEmail) {
      process.env['E2E_ADMIN_EMAIL'] = data.adminEmail;
    }

    if (data.adminPassword) {
      process.env['E2E_ADMIN_PASSWORD'] = data.adminPassword;
    }
  } catch (error) {
    console.warn(`[e2e global setup] Failed to read credentials from ${credentialsFile}:`, error);
  }
}

export function createGlobalSetup(options: GlobalSetupOptions = {}) {
  const {
    waitForBackend = true,
    backendHealthPath = '/api/health',
    maxAttempts = 10,
    delayMs = 1000,
    credentialsPath,
  } = options;

  return async function globalSetup(/* _config: FullConfig */): Promise<void> {
    const backendUrl = (process.env['BACKEND_URL'] ?? 'http://localhost:3000').trim();
    process.env['BACKEND_URL'] = backendUrl;
    process.env['API_URL'] = process.env['API_URL'] ?? backendUrl;

    if (waitForBackend) {
      await waitForBackendReady(backendUrl, backendHealthPath, maxAttempts, delayMs);
    }

    const resolvedCredentialsPath =
      credentialsPath ?? path.resolve(process.cwd(), '../backend-e2e/admin-credentials.json');
    await loadAdminCredentials(resolvedCredentialsPath);
  };
}
