import { config } from 'dotenv';
import { join } from 'path';

config({
  path: join(__dirname, '../../.env'),
});

import './__test-utils__/http-vcr';
import './__mocks__/@utils/cacheable.util';
