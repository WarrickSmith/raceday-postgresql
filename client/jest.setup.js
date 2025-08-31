import '@testing-library/jest-dom/jest-globals'
import 'jest-axe/extend-expect'

// Setup environment variables for tests
process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1'
process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = 'test-project-id'
process.env.APPWRITE_API_KEY = 'test-api-key'

// Mock fetch globally for all tests
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ isCompleted: false }),
  })
)
