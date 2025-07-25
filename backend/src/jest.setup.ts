import './__test-utils__/http-vcr';

// Mock DATA_DIR so the database initialized in the tests will be created here
process.env.DATA_DIR = '/tmp/miauflix-test';

// Add BigInt serialization support for Jest
if (typeof BigInt !== 'undefined') {
  // @ts-expect-error - Jest types don't include BigInt support
  BigInt.prototype.toJSON = function () {
    return this.toString();
  };
}
