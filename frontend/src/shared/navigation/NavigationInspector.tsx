import { type CSSProperties, useEffect, useState } from 'react';

import { useNavigationStore } from './hooks';
import type { NavigationSnapshot } from './store';

const panelStyle: CSSProperties = {
  position: 'fixed',
  right: '0.5rem',
  bottom: '0.5rem',
  zIndex: 2147483647,
  maxWidth: '22rem',
  maxHeight: '50vh',
  overflow: 'auto',
  margin: 0,
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  background: 'rgba(0, 0, 0, 0.85)',
  color: '#9fe870',
  font: '12px/1.4 ui-monospace, monospace',
  whiteSpace: 'pre-wrap',
  pointerEvents: 'none',
};

function describe(snapshot: NavigationSnapshot): string {
  const lines = [
    `active: ${snapshot.activeId ?? '—'}${snapshot.part ? ` (${snapshot.part})` : ''}`,
    `scopes: ${snapshot.scopes.join(' › ') || '—'}`,
    `pending: ${snapshot.pending ? `${snapshot.pending.groupId} (${snapshot.pending.edge})` : '—'}`,
    `geometry: ${snapshot.geometry.join(', ') || '—'}`,
  ];
  if (snapshot.last) {
    const { key, resolution } = snapshot.last;
    const target = resolution.type === 'move' ? ` → ${resolution.targetId}` : '';
    lines.push(`last: ${key} ${resolution.type}${target}`, `  ${resolution.reason}`);
  }
  lines.push('remembered:');
  for (const [group, leaf] of Object.entries(snapshot.remembered))
    lines.push(`  ${group}: ${leaf}`);
  lines.push('tree:');
  const byParent = new Map<string | null, NavigationSnapshot['nodes'][number][]>();
  for (const node of snapshot.nodes) {
    byParent.set(node.parent, [...(byParent.get(node.parent) ?? []), node]);
  }
  const walk = (parent: string | null, depth: number) => {
    for (const node of byParent.get(parent) ?? []) {
      const kind = node.kind === 'leaf' ? '' : ` [${node.kind} ${node.layout ?? 'vertical'}]`;
      const marker = node.id === snapshot.activeId ? ' ●' : '';
      lines.push(`${'  '.repeat(depth + 1)}${node.id}${kind}${marker}`);
      walk(node.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.join('\n');
}

/**
 * Development-only overlay: the active ID and part, the scope stack, the last key's resolution and
 * its reason, each group's remembered leaf and the registered tree. Never rendered in production.
 */
export function NavigationInspector() {
  const store = useNavigationStore();
  const [text, setText] = useState(() => describe(store.snapshot()));
  useEffect(() => {
    const refresh = () => setText(describe(store.snapshot()));
    refresh();
    return store.subscribeAll(refresh);
  }, [store]);
  if (!import.meta.env.DEV) return null;
  return (
    <pre style={panelStyle} aria-hidden="true">
      {text}
    </pre>
  );
}
