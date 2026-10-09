import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';
const policy=readFileSync('src/uiSelectionPolicy.css','utf8');
it('scopes non-selection to semantic controls and chrome, with explicit content escapes',()=>{
  const blocks=[...policy.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
  const suppressed=blocks.filter(([, ,body])=>/user-select:\s*none/.test(body));
  expect(suppressed).toHaveLength(1);
  expect(suppressed[0][1]).toContain('button');expect(suppressed[0][1]).toContain('.rook-ui');
  expect(suppressed[0][1]).not.toMatch(/(?:^|[,\s(])(?:\*|body|html|#root|\.app-shell)(?:[,\s)]|$)/);
  expect(policy).toMatch(/:where\(input, textarea,[\s\S]+?user-select:\s*text/);
  expect(policy).toContain('.coach-message p');expect(policy).toContain('-webkit-touch-callout: default');
});
it('leaves keyboard focus rules intact and removes the navigation tile layer',()=>{
  const feedback=readFileSync('src/exerciseRowFeedback.css','utf8');
  const base=readFileSync('src/styles.css','utf8');
  expect(feedback).not.toContain('::before');expect(feedback).not.toMatch(/outline:\s*none/);
  expect(feedback).toContain('opacity: var(--rook-press-opacity,.84)');expect(feedback).not.toMatch(/scale\(/);
  expect(base).toContain('button:focus-visible');
});
