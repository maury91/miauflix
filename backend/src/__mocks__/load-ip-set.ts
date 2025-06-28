const loadIpset = jest
  .fn()
  .mockImplementation(
    (url: string, options: unknown, callback: (err: Error | null, ipSet: unknown) => void) => {
      callback(null, { contains: jest.fn() });
    }
  );

export default loadIpset;
