import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'dte', include: ['src/**/*.test.ts'] },
});
