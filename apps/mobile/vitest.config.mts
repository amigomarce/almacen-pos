import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'mobile', include: ['src/**/*.test.ts'] },
});
