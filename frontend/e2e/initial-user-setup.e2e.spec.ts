import { expect, test } from './fixtures';

type SetupResponse = {
  session: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
};

test('creates and authenticates the first administrator from a fresh installation', async ({
  page,
}) => {
  const api = page.context().request;
  const admin = {
    email: 'initial-admin@example.com',
    password: 'InitialAdmin123!',
  };

  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(
    () => (window as Window & { _miauflixAnimationComplete?: boolean })._miauflixAnimationComplete,
    undefined,
    { timeout: 15_000 }
  );

  const initialStatus = await api.get('/api/auth/setup');
  expect(initialStatus.status()).toBe(200);
  await expect(initialStatus.json()).resolves.toEqual({ available: true });

  await expect(page.getByText("Let's create your admin account!")).toBeVisible();
  const emailInput = page.locator('#setup-email');
  const passwordInput = page.locator('#setup-password');
  const confirmPasswordInput = page.locator('#setup-confirm-password');
  const submitButton = page.getByRole('button', { name: 'Create Admin Account' });

  await expect(emailInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(confirmPasswordInput).toBeVisible();
  await expect(submitButton).toBeDisabled();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => {
    let node: Element | null = document.querySelector('#setup-email');
    while (node) {
      if (getComputedStyle(node).position === 'fixed') {
        return getComputedStyle(node).opacity === '1';
      }
      node = node.parentElement;
    }
    return true;
  });
  await expect(page).toHaveScreenshot('initial-user-creation.png', {
    fullPage: true,
    animations: 'disabled',
  });

  await emailInput.fill(admin.email);
  await passwordInput.fill(admin.password);
  await confirmPasswordInput.fill(admin.password);
  await expect(submitButton).toBeEnabled();

  const setupResponsePromise = page.waitForResponse(response => {
    return response.url().endsWith('/api/auth/setup') && response.request().method() === 'POST';
  });
  await submitButton.click();

  const setupResponse = await setupResponsePromise;
  expect(setupResponse.status()).toBe(201);
  const setupResult = (await setupResponse.json()) as SetupResponse;
  expect(setupResult.session).toEqual(expect.any(String));
  expect(setupResult.user).toMatchObject({ email: admin.email, role: 'admin' });

  await expect(emailInput).toHaveCount(0);

  const sessionsResponse = await api.get('/api/auth/sessions');
  expect(sessionsResponse.status()).toBe(200);
  const sessions = (await sessionsResponse.json()) as Array<{
    session: string;
    user: { email: string; role: string };
  }>;
  expect(sessions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        session: setupResult.session,
        user: expect.objectContaining({ email: admin.email, role: 'admin' }),
      }),
    ])
  );

  const currentSessionResponse = await api.get('/api/auth/session', {
    headers: { 'X-Session-Id': setupResult.session },
  });
  expect(currentSessionResponse.status()).toBe(200);
  await expect(currentSessionResponse.json()).resolves.toMatchObject({
    id: setupResult.session,
    user: { email: admin.email, role: 'admin' },
  });

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
