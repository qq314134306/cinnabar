import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = process.cwd();

interface TypeScriptConfig {
  compilerOptions?: Record<string, unknown>;
  exclude?: string[];
  include?: string[];
  references?: Array<{ path?: string }>;
}

function readConfig(relativePath: string): TypeScriptConfig {
  return JSON.parse(
    readFileSync(path.join(appRoot, relativePath), 'utf8'),
  ) as TypeScriptConfig;
}

describe('API TypeScript build boundary', () => {
  const rootConfig = readConfig('tsconfig.json');
  const apiConfig = readConfig('tsconfig.api.json');
  const options = apiConfig.compilerOptions ?? {};

  it('is referenced by the root tsc build', () => {
    expect(rootConfig.references?.map((reference) => reference.path)).toContain(
      './tsconfig.api.json',
    );
  });

  it('includes every API TypeScript source but no tests', () => {
    expect(apiConfig.include).toEqual(['api/**/*.ts']);
    expect(apiConfig.exclude).toEqual(
      expect.arrayContaining(['api/**/*.test.ts', 'api/**/*.test.tsx']),
    );
  });

  it('models the shared Edge and Node runtime surface', () => {
    expect(options.target).toBe('ES2022');
    expect(options.module).toBe('ESNext');
    expect(options.moduleResolution).toBe('bundler');
    expect(options.lib).toEqual(
      expect.arrayContaining(['ES2022', 'DOM', 'DOM.Iterable']),
    );
    expect(options.types).toEqual(expect.arrayContaining(['node']));
    expect(options.resolveJsonModule).toBe(true);
    expect(options.noEmit).toBe(true);
  });

  it('keeps API code under the strict build policy', () => {
    for (const option of [
      'strict',
      'noUnusedLocals',
      'noUnusedParameters',
      'erasableSyntaxOnly',
      'noFallthroughCasesInSwitch',
      'noUncheckedSideEffectImports',
    ]) {
      expect(options[option], `${option} must remain enabled`).toBe(true);
    }
  });
});
