import { humanReadableBytes } from './numbers';

describe('humanReadableBytes', () => {
  describe('zero and negative values', () => {
    it('should return "0 B" for zero bytes (number)', () => {
      expect(humanReadableBytes(0)).toBe('0 B');
    });

    it('should return "0 B" for zero bytes (bigint)', () => {
      expect(humanReadableBytes(0n)).toBe('0 B');
    });

    it('should return "0 B" for negative bytes (number)', () => {
      expect(humanReadableBytes(-1)).toBe('0 B');
    });

    it('should return "0 B" for negative bytes (bigint)', () => {
      expect(humanReadableBytes(-1n)).toBe('0 B');
    });
  });

  describe('bytes (B)', () => {
    it('should format single byte correctly', () => {
      expect(humanReadableBytes(1)).toBe('1 B');
    });

    it('should format bytes correctly (number)', () => {
      expect(humanReadableBytes(512)).toBe('512 B');
    });

    it('should format bytes correctly (bigint)', () => {
      expect(humanReadableBytes(512n)).toBe('512 B');
    });

    it('should format bytes just under 1KB', () => {
      expect(humanReadableBytes(1023)).toBe('1023 B');
    });
  });

  describe('kilobytes (KB)', () => {
    it('should format exactly 1KB correctly', () => {
      expect(humanReadableBytes(1024)).toBe('1.00 KB');
    });

    it('should format kilobytes correctly (number)', () => {
      expect(humanReadableBytes(2048)).toBe('2.00 KB');
    });

    it('should format kilobytes correctly (bigint)', () => {
      expect(humanReadableBytes(2048n)).toBe('2.00 KB');
    });

    it('should format fractional kilobytes correctly', () => {
      expect(humanReadableBytes(1536)).toBe('1.50 KB');
    });

    it('should format kilobytes just under 1MB', () => {
      expect(humanReadableBytes(1048575)).toBe('1023.99 KB');
    });
  });

  describe('megabytes (MB)', () => {
    it('should format exactly 1MB correctly', () => {
      expect(humanReadableBytes(1048576)).toBe('1.00 MB');
    });

    it('should format megabytes correctly (number)', () => {
      expect(humanReadableBytes(2097152)).toBe('2.00 MB');
    });

    it('should format megabytes correctly (bigint)', () => {
      expect(humanReadableBytes(2097152n)).toBe('2.00 MB');
    });

    it('should format fractional megabytes correctly', () => {
      expect(humanReadableBytes(1572864)).toBe('1.50 MB');
    });

    it('should format megabytes just under 1GB', () => {
      expect(humanReadableBytes(1073741823)).toBe('1023.99 MB');
    });
  });

  describe('gigabytes (GB)', () => {
    it('should format exactly 1GB correctly', () => {
      expect(humanReadableBytes(1073741824)).toBe('1.00 GB');
    });

    it('should format gigabytes correctly (number)', () => {
      expect(humanReadableBytes(2147483648)).toBe('2.00 GB');
    });

    it('should format gigabytes correctly (bigint)', () => {
      expect(humanReadableBytes(2147483648n)).toBe('2.00 GB');
    });

    it('should format fractional gigabytes correctly', () => {
      expect(humanReadableBytes(1610612736)).toBe('1.50 GB');
    });

    it('should format gigabytes just under 1TB', () => {
      expect(humanReadableBytes(1099511627775n)).toBe('1023.99 GB');
    });
  });

  describe('terabytes (TB)', () => {
    it('should format exactly 1TB correctly', () => {
      expect(humanReadableBytes(1099511627776n)).toBe('1.00 TB');
    });

    it('should format terabytes correctly (number)', () => {
      expect(humanReadableBytes(2199023255552)).toBe('2.00 TB');
    });

    it('should format terabytes correctly (bigint)', () => {
      expect(humanReadableBytes(2199023255552n)).toBe('2.00 TB');
    });

    it('should format fractional terabytes correctly', () => {
      expect(humanReadableBytes(1649267441664n)).toBe('1.50 TB');
    });

    it('should format large terabytes correctly', () => {
      expect(humanReadableBytes(1099511627776000n)).toBe('1000.00 TB');
    });
  });

  describe('petabytes (PB)', () => {
    it('should format exactly 1PB correctly', () => {
      expect(humanReadableBytes(1125899906842624n)).toBe('1.00 PB');
    });

    it('should format petabytes correctly (bigint)', () => {
      expect(humanReadableBytes(2251799813685248n)).toBe('2.00 PB');
    });

    it('should format fractional petabytes correctly', () => {
      expect(humanReadableBytes(1688849860263936n)).toBe('1.50 PB');
    });
  });

  describe('edge cases and precision', () => {
    it('should handle very large numbers', () => {
      expect(humanReadableBytes(Number.MAX_SAFE_INTEGER)).toBe('7.99 PB');
    });

    it('should maintain 2 decimal places precision', () => {
      expect(humanReadableBytes(1025)).toBe('1.00 KB');
      expect(humanReadableBytes(1536)).toBe('1.50 KB');
      expect(humanReadableBytes(1792)).toBe('1.75 KB');
    });

    it('should handle boundary values between units', () => {
      // Just under 1KB
      expect(humanReadableBytes(1023)).toBe('1023 B');
      // Exactly 1KB
      expect(humanReadableBytes(1024)).toBe('1.00 KB');
      // Just over 1KB
      expect(humanReadableBytes(1025)).toBe('1.00 KB');
    });

    it('should handle values that round up to next unit', () => {
      // These values are very close to the next unit boundary
      expect(humanReadableBytes(1048575)).toBe('1023.99 KB');
      expect(humanReadableBytes(1073741823)).toBe('1023.99 MB');
      expect(humanReadableBytes(1099511627775n)).toBe('1023.99 GB');
    });
  });

  describe('real-world examples', () => {
    it('should format common file sizes correctly', () => {
      // Small text file
      expect(humanReadableBytes(1024)).toBe('1.00 KB');
      // Medium image
      expect(humanReadableBytes(2097152)).toBe('2.00 MB');
      // Large video file
      expect(humanReadableBytes(2147483648)).toBe('2.00 GB');
      // Very large file
      expect(humanReadableBytes(1099511627776n)).toBe('1.00 TB');
    });

    it('should handle storage sizes correctly', () => {
      // 500MB
      expect(humanReadableBytes(524288000)).toBe('500.00 MB');
      // 1.5GB
      expect(humanReadableBytes(1610612736)).toBe('1.50 GB');
      // 2.5TB
      expect(humanReadableBytes(2748779069440n)).toBe('2.50 TB');
    });
  });

  describe('function behavior analysis', () => {
    it('should demonstrate no rounding behavior', () => {
      // Test values that are very close to unit boundaries
      expect(humanReadableBytes(1023)).toBe('1023 B');
      expect(humanReadableBytes(1024)).toBe('1.00 KB');
      expect(humanReadableBytes(1025)).toBe('1.00 KB');

      expect(humanReadableBytes(1048575)).toBe('1023.99 KB');
      expect(humanReadableBytes(1048576)).toBe('1.00 MB');
      expect(humanReadableBytes(1048577)).toBe('1.00 MB');
    });

    it('should show supported units up to PB', () => {
      // Test the highest supported unit that we can reasonably test
      expect(humanReadableBytes(1099511627776n)).toBe('1.00 TB');
      expect(humanReadableBytes(1125899906842624n)).toBe('1.00 PB');
    });
  });
});
