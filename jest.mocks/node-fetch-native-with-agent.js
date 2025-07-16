// Mock for node-fetch-native-with-agent to avoid ES module issues in Jest
const mockHeaders = jest.fn().mockImplementation(() => ({
  get: jest.fn(),
  has: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  append: jest.fn(),
  forEach: jest.fn(),
  keys: jest.fn(),
  values: jest.fn(),
  entries: jest.fn(),
  [Symbol.iterator]: jest.fn(),
}))

const mockResponse = jest.fn().mockImplementation(() => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new mockHeaders(),
  url: 'https://test.example.com',
  json: jest.fn().mockResolvedValue({}),
  text: jest.fn().mockResolvedValue(''),
  blob: jest.fn(),
  arrayBuffer: jest.fn(),
  clone: jest.fn(),
  body: null,
  bodyUsed: false,
}))

const mockFetch = jest.fn().mockImplementation(() => {
  return Promise.resolve(new mockResponse())
})

module.exports = {
  fetch: mockFetch,
  default: mockFetch,
  AbortController: jest.fn(),
  Blob: jest.fn(),
  File: jest.fn(),
  FormData: jest.fn(),
  Headers: mockHeaders,
  Request: jest.fn(),
  Response: mockResponse,
}
