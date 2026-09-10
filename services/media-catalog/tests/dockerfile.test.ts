import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

describe('media-catalog production image', () => {
  it('copies Drizzle migrations next to the bundled runtime entrypoint', () => {
    const dockerfile = readFileSync(join(import.meta.dir, '../Dockerfile'), 'utf8');

    expect(dockerfile).toContain(
      'COPY --from=builder /workspace/services/media-catalog/src/db/migrations ./migrations'
    );
  });
});
