import { useState } from 'react';
import type { Fix } from '../core/types';
import { FixItem } from './FixItem';

type Group = { label: string; key: Fix['type'] };
const GROUPS: Group[] = [
  { key: 'rename', label: 'Renames' },
  { key: 'autolayout', label: 'Auto Layout' },
  { key: 'spacing', label: 'Spacing' },
  { key: 'reorder', label: 'Reorder' },
];

type Props = {
  fixes: Fix[];
  checkedIds: Set<string>;
  onToggle: (id: string) => void;
};

export function FixList({ fixes, checkedIds, onToggle }: Props) {
  const [collapsed, setCollapsed] = useState<Set<Fix['type']>>(new Set());

  function toggleGroup(key: Fix['type']) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const nonEmpty = GROUPS.filter((g) => fixes.some((f) => f.type === g.key));

  if (nonEmpty.length === 0) {
    return <p className="hint" style={{ padding: '16px 0' }}>No fixes found.</p>;
  }

  return (
    <div className="fix-list">
      {nonEmpty.map(({ key, label }) => {
        const group = fixes.filter((f) => f.type === key);
        const isCollapsed = collapsed.has(key);
        const checkedCount = group.filter((f) => checkedIds.has(f.id)).length;

        return (
          <section key={key} className="fix-group">
            <button
              className="fix-group-header"
              onClick={() => toggleGroup(key)}
              aria-expanded={!isCollapsed}
            >
              <span className="chevron">{isCollapsed ? '▶' : '▾'}</span>
              <span className="group-label">{label}</span>
              <span className="group-count">
                {checkedCount}/{group.length}
              </span>
            </button>
            {!isCollapsed && (
              <ul className="fix-group-items">
                {group.map((fix) => (
                  <FixItem
                    key={fix.id}
                    fix={fix}
                    checked={checkedIds.has(fix.id)}
                    onToggle={onToggle}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
