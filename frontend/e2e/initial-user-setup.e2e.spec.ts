import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

type SetupResponse = {
  session: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};

type ConfigEntry = {
  key: string;
  value: string;
  isSecret: boolean;
  serviceGroup: string;
  required: boolean;
  hasValue: boolean;
};

type ServiceStatusResponse = {
  services: Record<string, { status: string }>;
};

const visualStylePath = path.resolve('e2e/visual-sanitization.css');

const waitForIntro = async (page: Page) => {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => (window as Window & { _miauflixAnimationComplete?: boolean })._miauflixAnimationComplete,
    undefined,
    { timeout: 15_000 }
  );
};

const screenshotOptions = {
  fullPage: true,
  animations: 'disabled' as const,
  caret: 'hide' as const,
  scale: 'css' as const,
  stylePath: visualStylePath,
};

test('completes first-run admin and required configuration through the UI', async ({ page }) => {
  const api = page.context().request;
  const admin = {
    email: 'initial-admin@example.com',
    password: 'InitialAdmin123!',
  };

  await page.goto('/');
  await waitForIntro(page);

  const initialStatus = await api.get('/api/auth/setup');
  expect(initialStatus.status()).toBe(200);
  await expect(initialStatus.json()).resolves.toEqual({ available: true });

  await expect(page.getByText("Let's create your admin account!")).toBeVisible();
  const emailInput = page.locator('#setup-email');
  const passwordInput = page.locator('#setup-password');
  const confirmPasswordInput = page.locator('#setup-confirm-password');
  const createAdminButton = page.getByRole('button', { name: 'Create Admin Account' });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(confirmPasswordInput).toBeVisible();
  await expect(createAdminButton).toBeDisabled();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page).toHaveScreenshot('initial-user-creation.png', screenshotOptions);

  await emailInput.fill(admin.email);
  await passwordInput.fill(admin.password);
  await confirmPasswordInput.fill(admin.password);
  await expect(createAdminButton).toBeEnabled();

  const setupResponsePromise = page.waitForResponse(response => {
    return response.url().endsWith('/api/auth/setup') && response.request().method() === 'POST';
  });
  await createAdminButton.click();

  const setupResponse = await setupResponsePromise;
  expect(setupResponse.status()).toBe(201);
  const setupResult = (await setupResponse.json()) as SetupResponse;
  expect(setupResult.session).toEqual(expect.any(String));
  expect(setupResult.user).toMatchObject({ email: admin.email, role: 'admin' });
  await expect(emailInput).toHaveCount(0);

  const sessionHeaders = { 'X-Session-Id': setupResult.session };
  const currentSessionResponse = await api.get('/api/auth/session', {
    headers: sessionHeaders,
  });
  expect(currentSessionResponse.status()).toBe(200);
  await expect(currentSessionResponse.json()).resolves.toMatchObject({
    id: setupResult.session,
    user: { email: admin.email, role: 'admin' },
  });

  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Optional settings' })).toHaveCount(0);

  const tokenInput = page.locator('#CATALOG__TMDB_API_ACCESS_TOKEN');
  const nextButton = page.getByRole('button', { name: 'Next step' });
  const testButton = page.getByRole('button', { name: 'Test', exact: true });
  const saveButton = page.getByRole('button', { name: 'Save', exact: true });
  const optionalSettingsButton = page.getByRole('button', { name: /^Optional settings/ });

  await expect(page.getByText('1 missing')).toBeVisible();
  await expect(tokenInput).toBeVisible();
  await expect(tokenInput).toHaveValue('');
  await expect(saveButton).toBeDisabled();
  await expect(nextButton).toBeDisabled();
  await expect(page).toHaveScreenshot('catalog-required-desktop.png', screenshotOptions);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Catalog' })).toBeVisible();
  await expect(page).toHaveScreenshot('catalog-required-mobile.png', screenshotOptions);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const configBeforeTestResponse = await api.get('/api/config', { headers: sessionHeaders });
  expect(configBeforeTestResponse.status()).toBe(200);
  const configBeforeTest = (await configBeforeTestResponse.json()) as ConfigEntry[];
  expect(configBeforeTest).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        key: 'CATALOG__TMDB_API_ACCESS_TOKEN',
        isSecret: true,
        required: true,
        hasValue: false,
      }),
    ])
  );

  const statusBeforeTestResponse = await api.get('/api/status');
  expect(statusBeforeTestResponse.status()).toBe(200);
  const statusBeforeTest = (await statusBeforeTestResponse.json()) as ServiceStatusResponse;
  expect(statusBeforeTest.services.CATALOG.status).toBe('needs_configuration');

  await tokenInput.fill('e2e-dummy-token');
  await expect(saveButton).toBeEnabled();
  await expect(nextButton).toBeDisabled();

  await optionalSettingsButton.click();
  const catalogUrlInput = page.locator('#CATALOG__TMDB_API_URL');
  await expect(catalogUrlInput).toBeVisible();
  await catalogUrlInput.fill('not-a-url');

  const invalidTestResponsePromise = page.waitForResponse(response => {
    return (
      response.url().endsWith('/api/config/CATALOG/test') && response.request().method() === 'POST'
    );
  });
  await testButton.click();
  const invalidTestResponse = await invalidTestResponsePromise;
  expect(invalidTestResponse.ok()).toBeTruthy();
  const invalidTestResult = await invalidTestResponse.json();
  expect(invalidTestResult).toMatchObject({
    services: [
      expect.objectContaining({
        service: 'CATALOG',
        success: false,
        message: expect.stringContaining('Invalid values for: TMDB_API_URL'),
      }),
    ],
  });

  await expect(page.getByText('Failed to test Catalog')).toBeVisible();
  await expect(catalogUrlInput.locator('xpath=..')).toHaveAttribute('data-test-failure', 'true');
  await expect(nextButton).toBeDisabled();
  await expect(page).toHaveScreenshot('catalog-test-failure.png', screenshotOptions);

  const configAfterTestResponse = await api.get('/api/config', { headers: sessionHeaders });
  expect(configAfterTestResponse.status()).toBe(200);
  const configAfterTest = (await configAfterTestResponse.json()) as ConfigEntry[];
  expect(configAfterTest).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ key: 'CATALOG__TMDB_API_ACCESS_TOKEN', hasValue: false }),
    ])
  );

  await catalogUrlInput.fill('http://tmdb-mock/3');
  const saveResponsePromise = page.waitForResponse(response => {
    return response.url().endsWith('/api/config/CATALOG') && response.request().method() === 'PUT';
  });
  await saveButton.click();
  const saveResponse = await saveResponsePromise;
  expect(saveResponse.ok()).toBeTruthy();
  await expect(saveResponse.json()).resolves.toMatchObject({
    success: true,
    services: [expect.objectContaining({ service: 'CATALOG', success: true })],
  });

  await expect(page.getByRole('heading', { name: 'LIST' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText('3 missing')).toBeVisible();
  await page.getByRole('textbox', { name: 'List Trakt Client ID' }).fill('mock-trakt-client-id');
  await page
    .getByRole('textbox', { name: 'List Trakt Client Secret' })
    .fill('mock-trakt-client-secret');
  await page
    .getByRole('textbox', { name: 'List Service Encryption Key' })
    .fill('e2e-list-service-key');

  const listSaveResponsePromise = page.waitForResponse(response => {
    return response.url().endsWith('/api/config/LIST') && response.request().method() === 'PUT';
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const listSaveResponse = await listSaveResponsePromise;
  expect(listSaveResponse.ok()).toBeTruthy();
  await expect(listSaveResponse.json()).resolves.toMatchObject({
    success: true,
    services: [expect.objectContaining({ service: 'LIST', success: true })],
  });

  await expect(page.getByRole('heading', { name: 'Optional settings' })).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByAltText('Miauflix logo')).toHaveCSS('height', '56px');
  await expect(page).toHaveScreenshot('configuration-optional-settings.png', screenshotOptions);

  const configAfterSaveResponse = await api.get('/api/config', { headers: sessionHeaders });
  expect(configAfterSaveResponse.status()).toBe(200);
  const configAfterSave = (await configAfterSaveResponse.json()) as ConfigEntry[];
  const savedToken = configAfterSave.find(entry => entry.key === 'CATALOG__TMDB_API_ACCESS_TOKEN');
  expect(savedToken).toMatchObject({ hasValue: true, isSecret: true });
  expect(savedToken?.value).not.toBe('e2e-dummy-token');

  const statusAfterSaveResponse = await api.get('/api/status');
  expect(statusAfterSaveResponse.status()).toBe(200);
  const statusAfterSave = (await statusAfterSaveResponse.json()) as ServiceStatusResponse;
  expect(statusAfterSave.services.CATALOG.status).toBe('ready');

  await page.getByRole('button', { name: 'Finish and start using Miauflix' }).click();
  await expect(page.getByRole('heading', { name: 'Optional settings' })).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();

  await page.reload();
  await waitForIntro(page);
  await expect(page.getByRole('heading', { name: 'Optional settings' })).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();

  const finalStatus = await api.get('/api/auth/setup');
  expect(finalStatus.status()).toBe(200);
  await expect(finalStatus.json()).resolves.toEqual({ available: false });

  const secondSetupResponse = await api.post('/api/auth/setup', {
    data: {
      email: 'second-admin@example.com',
      password: 'SecondAdmin123!',
    },
  });
  expect(secondSetupResponse.status()).toBe(404);
});
