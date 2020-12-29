import * as path from 'path';
import typescript from 'rollup-plugin-typescript2';
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import { nodeResolve } from '@rollup/plugin-node-resolve';

const isDev = process.env.DEV;
const WebRTCModuleId = path.resolve(
  __dirname,
  './assets/sdk/NIM_Web_WebRTC2_v3.7.0.js'
);
const NIMModuleId = path.resolve(
  __dirname,
  './assets/sdk/NIM_Web_SDK_v8.1.0.js'
);
const globals = {
  [WebRTCModuleId]: 'WebRTC2',
  [NIMModuleId]: 'SDK',
};
const external = [WebRTCModuleId, NIMModuleId];

export default {
  input: './src/index.ts',
  output: [
    {
      file: './lib/index.umd.js',
      name: 'NRTCCalling',
      format: 'umd',
      plugins: [!isDev && terser()],
      globals,
    },
    {
      file: './lib/index.esm.js',
      format: 'esm',
      plugins: [!isDev && terser()],
      globals,
    },
    {
      file: './lib/index.cjs.js',
      format: 'cjs',
      plugins: [!isDev && terser()],
      globals,
    },
  ],
  external,
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      useTsconfigDeclarationDir: true,
    }),

    nodeResolve({
      mainFields: ['jsnext', 'preferBuiltins', 'browser'],
    }),

    commonjs({
      include: ['./assets/sdk/**', './node_modules/**'],
    }),
  ],
};
