/* eslint-disable node/no-unpublished-import */
import {resolve} from 'path';
import type {Configuration} from 'webpack';
// Because Webpack 5 bundles terser-webpack-plugin, there is no need to specify
// it in package.json. Since ESLint doesn't know this, we suppress it manually.
// eslint-disable-next-line node/no-extraneous-import
import TerserPlugin from 'terser-webpack-plugin';

const commonConfig: Configuration = {
  externals: {
    kolmafia: 'commonjs kolmafia',
    'zlib.ash': 'commonjs zlib.ash',
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        loader: 'ts-loader',
        // include: [resolve(__dirname, 'src/scripts')],
        exclude: [/node_modules/],
      },
    ],
  },
  // Since KoLmafia (Rhino) does not support source maps, we should emit a
  // human-readable bundle to help debugging.
  optimization: {
    chunkIds: 'named',
    mangleExports: false,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            defaults: false,
            // Tree-shake unused code
            unused: true,
          },
          // Don't apply optimizations that use ES6+ features
          ecma: 5,
          format: {
            beautify: true,
            indent_level: 2,
          },
          mangle: false,
        },
      }),
    ],
    moduleIds: 'named',
  },
  output: {
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    path: resolve(__dirname, 'release/scripts'),
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  target: 'node',
};

const config: Configuration[] = [
  {
    ...commonConfig,
    entry: {
      'ocd-cleanup': './src/scripts/ocd-cleanup.ts',
    },
    output: {
      ...commonConfig.output,
      path: resolve(__dirname, 'release/scripts'),
    },
  },
  {
    ...commonConfig,
    entry: {
      'ocd-test-basic': './test/e2e/ocd-test-basic.ts',
    },
    output: {
      ...commonConfig.output,
      // E2E test script bundles should not be committed to this repo
      path: resolve(__dirname, 'build'),
    },
  },
];

export default config;
