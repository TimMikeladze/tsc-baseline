import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm', 'cjs'],
  platform: 'node',
  target: 'node20',
  dts: true,
  sourcemap: true,
  splitting: false,
  clean: true
})
