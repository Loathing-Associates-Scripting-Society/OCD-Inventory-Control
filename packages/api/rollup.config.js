/**
 * @file Rollup configuration for building Philter's relay API script
 * (Written in JavaScript to avoid an extra compilation step)
 *
 * This script imports build constants from @philter/common, which is a native
 * ESM package.
 * Unfortunately, Rollup transpiles the config file from ESM to CJS before
 * running it. The transpiled code (CJS) attempts to load @philter/common using
 * require(), which fails because Node.js disallows loading ESM from CJS.
 *
 * ## Solution 1
 * Prevent Rollup from transpiling the config file before passing it to Node.js.
 * As of Rollup v2.44.0, the only way to do so is to:
 *
 * 1. Use the `.mjs` file extension for the config file.
 *    This is not ideal because TypeScript's compiler refuses to type-check .mjs
 *    files, meaning that we cannot automate type checks for our build config.
 *    Thankfully, VS Code still type-checks .mjs files.
 * 2. Use Node.js >= 13.
 *    Note that this is an arbitrary restriction imposed on by Rollup. Although
 *    Node.js >= 12.17.0 can resolve `.mjs` files without a CLI flag, Rollup
 *    does not know this.
 *
 * (See: https://rollupjs.org/guide/en/#using-untranspiled-config-files)
 *
 * ## Solution 2
 * Alternatively, we can directly import the ESM code from @philter/common using
 * a relative path. This allows Rollup to transpile the ESM.
 *
 * This allows us to keep the `.js` extension, and support Node.js v12.
 * This is the hack will use until Node.js v12 reaches EOL or Rollup provides
 * better native ESM support.
 */

/* eslint-disable node/no-unpublished-import */
/* eslint-disable node/no-unsupported-features/es-syntax */
// Import @philter/common using a relative path. This is a hack, btw.
// File extension is required to make this work in Node.js v12 AND v14.
import {nodeResolve} from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
import {RELAY_SCRIPT_FILE} from '../common/build/src/index.js';

/** @type {import('rollup').RollupOptions} */
const config = {
  external: ['kolmafia', 'philter.util.ash', 'zlib.ash'],
  input: 'src/index.ts',
  output: {
    // To take advantage of TypeScript's incremental build mode, we must allow
    // Rollup to emit to a build directory, then copy the bundled script
    dir: 'build',
    format: 'cjs',
  },
  plugins: [
    nodeResolve(),
    typescript({
      // Don't generate type definitions
      declaration: false,
      // Don't generate source maps (Rhino doesn't support them anyway)
      sourceMap: false,
      tsconfig: 'src/tsconfig.json',
    }),
    copy({
      hook: 'writeBundle',
      targets: [
        {
          src: 'build/index.js',
          dest: '../../release/relay',
          rename: RELAY_SCRIPT_FILE,
        },
      ],
    }),
  ],
  treeshake: {
    moduleSideEffects: id => id !== 'philter.util.ash',
  },
};

export default config;
