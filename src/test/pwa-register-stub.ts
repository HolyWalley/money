/* eslint-disable @typescript-eslint/no-unused-vars */
// Resolution target for the `virtual:pwa-register` alias in vitest.config.ts.
// vi.mock cannot rescue that specifier: it fails inside vite:import-analysis
// before the mock registry is consulted.
export function registerSW(_options?: unknown) {
  return async (_reload?: boolean) => {}
}
