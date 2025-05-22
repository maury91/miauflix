export const Cacheable = jest.fn((): MethodDecorator => {
  return (_target, _key, descriptor) => {
    return descriptor;
  };
});
