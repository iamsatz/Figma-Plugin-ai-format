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
  namingInProgress?: boolean;
  appliedIds?: Set<string>;
  failedIds?: Set<string>;
};

export function FixList({ fixes, checkedIds, onToggle, namingInProgress, appliedIds, failedIds }: Props) {
  const [collapsed, setCollapsed] = useState<Set<Fix['type']>>(new Set());
  const auditMode = appliedIds !== undefined;

  function toggleGroup(key: Fix['type']) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Reserve the Renames slot while naming is still in flight so the list
  // doesn't shift when rename fixes arrive.
  const visible = GROUPS.filter((g) =>
    fixes.some((f) => f.type === g.key) || (g.key === 'rename' && namingInProgress),
  );

  if (visible.length === 0) {
    return null;
  }

  return (
    <div className="fix-list">
      {visible.map(({ key, label }) => {
        const group = fixes.filter((f) => f.type === key);
        const isCollapsed = collapsed.has(key);
        const pendingCount = auditMode
          ? group.filter((f) => appliedIds!.has(f.id)).length
          : group.filter((f) => checkedIds.has(f.id)).length;
        const showCount = group.length > 0;

        return (
          <section key={key} className="fix-group">
            <button
              className="fix-group-header"
              onClick={() => toggleGroup(key)}
              aria-expanded={!isCollapsed}
            >
              <span className="chevron">{isCollapsed ? '▶' : '▾'}</span>
              <span className="group-label">{label}</span>
              {showCount && (
                <span className="group-count">{pendingCount}/{group.length}</span>
              )}
            </button>
            {!isCollapsed && (
              <ul className="fix-group-items">
                {group.length === 0 && namingInProgress ? (
                  <li className="fix-item-placeholder">Naming layers…</li>
                ) : (
                  group.map((fix) => (
                    <FixItem
                      key={fix.id}
                      fix={fix}
                      checked={checkedIds.has(fix.id)}
                      onToggle={onToggle}
                      status={
                        appliedIds?.has(fix.id)
                          ? 'applied'
                          : failedIds?.has(fix.id)
                          ? 'failed'
                          : auditMode
                          ? 'skipped'
                          : undefined
                      }
                    />
                  ))
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
