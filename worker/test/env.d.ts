/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { D1Migration } from 'cloudflare:test';
import type { Env as WorkerEnv } from '../src/lib/env';

declare global {
  // What `env` from cloudflare:test hands the tests. Cloudflare.Env is declared
  // empty by workers-types and filled in per project; `wrangler types` would
  // generate this file, but the bindings are already written down by hand in
  // src/lib/env.ts and two spellings of the same thing could disagree.
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      /**
       * The contents of migrations/, read by vitest.config.ts. Only the tests
       * see this binding; the deployed worker has no such thing.
       */
      TEST_MIGRATIONS: D1Migration[];
    }
  }

  // Vite serves a ?raw import as the file's text. vite/client declares this
  // too, but it also declares a browser's import.meta and globals, none of
  // which exist on workerd.
  module '*.toml?raw' {
    const contents: string;
    export default contents;
  }
}
