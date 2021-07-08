/* eslint-disable node/no-unpublished-import */
import buble from '@rollup/plugin-buble';
import typescript from '@rollup/plugin-typescript';
import createBubleConfig from 'buble-config-rhino';
import type {RollupOptions} from 'rollup';

const config: RollupOptions = {
  input: 'src/index.ts',
  output: {
    file: '../../release/scripts/philter.js',
    format: 'cjs',
  },
  plugins: [
    typescript({tsconfig: 'src/tsconfig.json'}),
    buble(createBubleConfig()),
  ],
};

export default config;
