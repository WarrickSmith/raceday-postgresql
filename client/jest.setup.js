import '@testing-library/jest-dom/jest-globals'
import 'jest-axe/extend-expect'

// Setup environment variables for tests
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:7000'
process.env.API_BASE_URL = 'http://localhost:7000'

// Provide a default fetch mock; tests may override as needed
if (!global.fetch) {
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    })
  )
}
