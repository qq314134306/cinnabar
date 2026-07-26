import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = path.resolve(process.cwd(), '..');

function readUtf8(relativePath: string): string {
  const bytes = readFileSync(path.join(repositoryRoot, relativePath));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

describe('agent entrypoint contracts', () => {
  const claude = readUtf8('CLAUDE.md');
  const agents = readUtf8('AGENTS.md');
  const normalizedAgents = agents.replace(/\s+/g, ' ');

  it('keeps the Claude startup links in their required order', () => {
    const requiredLinks = [
      '[`AGENTS.md`](AGENTS.md)',
      '[`docs/dev/progress.md`](docs/dev/progress.md)',
      '[`docs/dev/project-map.md`](docs/dev/project-map.md)',
      '[`docs/dev/decisions.md`](docs/dev/decisions.md)',
      '[`app/AGENTS.md`](app/AGENTS.md)',
    ];

    let previousIndex = -1;
    for (const link of requiredLinks) {
      const index = claude.indexOf(link);
      expect(index, `${link} must be present`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    expect(claude).toContain(
      '[`docs/dev/workflow.md`](docs/dev/workflow.md)',
    );
    expect(claude).toContain('authoritative project instructions');
    expect(claude).toContain('contains no roadmap');
  });

  it('guards its UTF-8 entrypoint against encoding drift', () => {
    expect(claude).toContain('Keep this file encoded as UTF-8.');

    for (const marker of ['\uFFFD', 'Ã', 'Â', 'â€', 'ðŸ', '锟斤拷']) {
      expect(claude).not.toContain(marker);
    }
  });

  it('maps the key repository directories that currently exist', () => {
    for (const directory of ['app/', 'docs/', 'supabase/', '.github/workflows/']) {
      expect(agents).toContain(`${directory} -`);
    }

    expect(agents).not.toMatch(/(?:01|02|03|04|05|06|99)-\* \//);
  });

  it('locks the two-gate direct Vercel deployment contract', () => {
    expect(normalizedAgents).toContain('application `verify` job');
    expect(normalizedAgents).toContain('isolated Fresh `database-proof` job');
    expect(normalizedAgents).toContain('before merge');
    expect(normalizedAgents).toContain(
      '`qq314134306/cinnabar` is the canonical source repository',
    );
    expect(normalizedAgents).toContain(
      "Vercel reads that repository's `main` branch directly",
    );
    expect(normalizedAgents).toContain(
      'There is no deployment mirror in the current architecture',
    );
    expect(normalizedAgents).toContain(
      'branch protection and required pull-request checks',
    );
    expect(normalizedAgents).not.toContain('ZWKNOWS_SYNC_TOKEN');
    expect(normalizedAgents).not.toContain('force-with-lease');
    expect(normalizedAgents).toContain(
      'Workflow configuration and local contract tests are not evidence',
    );
    expect(normalizedAgents).toContain('hosted GitHub Actions run succeeded');
  });
});
