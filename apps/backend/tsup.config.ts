import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // the workspace package ships TS source — bundle it; npm deps stay external
  noExternal: ['@re/shared'],
})
