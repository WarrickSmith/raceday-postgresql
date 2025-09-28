// Type definitions for client environment variables used in polling configuration

declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_DOUBLE_POLLING_FREQUENCY?: string
    readonly DOUBLE_POLLING_FREQUENCY?: string
    readonly NEXT_PUBLIC_POLLING_ENABLED?: string
    readonly NEXT_PUBLIC_POLLING_DEBUG_MODE?: string
    readonly NEXT_PUBLIC_POLLING_TIMEOUT?: string
  }
}

export {}
