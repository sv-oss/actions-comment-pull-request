import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{src,test,projenrc}/**/*.{test,spec}.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'lcov', 'clover', 'cobertura'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
    reporters: ['default', ['junit', { outputFile: 'test-reports/junit.xml' }]],
  },
});
