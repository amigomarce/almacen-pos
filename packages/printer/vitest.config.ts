import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'printer', include: ['src/**/*.test.ts'] },
});
