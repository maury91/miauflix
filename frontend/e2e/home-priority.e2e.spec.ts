import { navigateToLogin } from './utils/login';
import { expect, test } from './fixtures';

const adminEmail = process.env['E2E_ADMIN_EMAIL'] ?? 'test@example.com';
const adminPassword = process.env['E2E_ADMIN_PASSWORD'] ?? 'testpassword123';

type ListRequest = {
  method: string;
  pathname: string;
  priority: string | null;
};

type PromotionRequest = {
  items?: Array<{
    mediaId?: number;
    tier?: string;
  }>;
};

test.describe('Home row loading priority', () => {
  test('promotes newly visible rows after four ArrowDown presses', async ({ page }) => {
    const listRequests: ListRequest[] = [];
    const promotionRequests: PromotionRequest[] = [];

    page.on('request', request => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/list/')) {
        listRequests.push({
          method: request.method(),
          pathname: url.pathname,
          priority: url.searchParams.get('priority'),
        });
      }
      if (request.method() === 'POST' && url.pathname === '/api/list/priorities') {
        promotionRequests.push((request.postDataJSON() ?? {}) as PromotionRequest);
      }
    });

    await navigateToLogin(page);
    await page.locator('#email').fill(adminEmail);
    await page.locator('#password').fill(adminPassword);
    await Promise.all([
      page.waitForResponse(response => response.url().includes('/api/auth/login')),
      page.locator('button[type="submit"]').click(),
    ]);

    await expect(page.getByRole('main')).toBeVisible();
    await expect
      .poll(() => listRequests.filter(request => request.method === 'GET').length, {
        timeout: 30000,
      })
      .toBeGreaterThanOrEqual(2);
    await expect
      .poll(
        () =>
          listRequests.filter(
            request => request.method === 'GET' && request.priority === 'prefetch'
          ).length,
        { timeout: 30000 }
      )
      .toBeGreaterThanOrEqual(1);
    await expect(page.locator('main [aria-current="true"]').first()).toBeVisible({
      timeout: 30000,
    });
    await expect.poll(() => promotionRequests.length, { timeout: 30000 }).toBeGreaterThanOrEqual(2);

    const initialPromotionCount = promotionRequests.length;
    await page.getByRole('main').focus();
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press('ArrowDown');
    }
    expect(initialPromotionCount).toBeGreaterThanOrEqual(1);

    await expect
      .poll(
        () =>
          new Set(
            promotionRequests
              .slice(initialPromotionCount)
              .flatMap(promotion => promotion.items ?? [])
              .map(item => item.tier)
          ),
        { timeout: 30000 }
      )
      .toEqual(new Set(['visible', 'viewport']));

    const visibleListRequests = listRequests.filter(
      request => request.method === 'GET' && request.priority === 'visible'
    );
    expect(visibleListRequests.length).toBeGreaterThanOrEqual(2);
    expect(
      new Set(visibleListRequests.map(request => request.pathname)).size
    ).toBeGreaterThanOrEqual(2);
  });
});
