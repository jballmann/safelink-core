import resolve from '@rollup/plugin-node-resolve';
import eslint from '@rollup/plugin-eslint';
import commonjs from '@rollup/plugin-commonjs';

export default [
  {
    input: 'src/index.js',
    output: {
      file: 'dist/index.js',
      format: 'esm'
    },
    plugins: [
      eslint(),
      resolve({
        preferBuiltins: false
      }),
      commonjs()
    ]
  }
]