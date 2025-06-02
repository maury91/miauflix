import './__test-utils__/http-vcr';

// Mock DATA_DIR so the database initialized in the tests will be created here
process.env.DATA_DIR = '/tmp/miauflix-test';
