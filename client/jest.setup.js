import '@testing-library/jest-dom/jest-globals'

// Setup environment variables for tests
process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT = 'https://cloud.appwrite.io/v1'
process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = 'test-project-id'
process.env.APPWRITE_API_KEY = 'test-api-key'
