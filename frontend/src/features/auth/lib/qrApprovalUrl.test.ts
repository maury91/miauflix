import { describe, expect, it } from 'vitest';

import { qrApprovalUrl } from './qrApprovalUrl';

describe('qrApprovalUrl', () => {
  it("points at the page's own origin in the browser", () => {
    expect(qrApprovalUrl('/auth/qr/request-1')).toBe(`${window.location.origin}/auth/qr/request-1`);
  });

  it("points at the backend's origin for the TV app", () => {
    expect(qrApprovalUrl('/auth/qr/request-1', 'https://miauflix.example')).toBe(
      'https://miauflix.example/auth/qr/request-1'
    );
  });
});
