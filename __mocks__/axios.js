// Manual mock for axios - returns a singleton so that resetModules() doesn't break test references
if (!global.__axiosMock__) {
  global.__axiosMock__ = {
    post: jest.fn(),
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
    head: jest.fn(),
    options: jest.fn(),
    request: jest.fn(),
    defaults: { headers: {} },
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    create: jest.fn(),
  };
}

module.exports = global.__axiosMock__;
