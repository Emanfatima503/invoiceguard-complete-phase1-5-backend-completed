// Empty stand-in for the `server-only` package, used ONLY by Vitest.
//
// `server-only` throws unless it is loaded under the `react-server` export
// condition (i.e. inside a React Server Components bundler). Vitest runs in
// plain Node, so any module that imports `server-only` — `invoice-processing`,
// `data`, `admin`, `supabase` — would throw at import time and no test could
// even load. The vitest config aliases `server-only` to this file, so tests
// see an inert module. Production builds never read the vitest config, so
// the real `server-only` guard is untouched there.
export {};
