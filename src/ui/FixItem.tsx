import type { Fix } from '../core/types';
import { send } from './bridge';

type Props = {
  fix: Fix;
  checked: boolean;
  onToggle: (id: string) => void;
};

export function FixItem({ fix, checked, onToggle }: Props) {
  function handleRowClick(e: React.MouseEvent) {
    // Checkbox click is handled by its own onChange — don't double-toggle.
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
    send({ type: 'jump-to-node', nodeId: fix.nodeId });
  }

  return (
    <li className="fix-item" onClick={handleRowClick} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') send({ type: 'jump-to-node', nodeId: fix.nodeId }); }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(fix.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`Include fix: ${label(fix)}`}
      />
      <span className="fix-label">{label(fix)}</span>
      <span className={`badge badge-${fix.confidence}`}>{fix.confidence}</span>
    </li>
  );
}

function label(fix: Fix): string {
  switch (fix.type) {
    case 'rename':
      return `${fix.oldName} → ${fix.newName}`;
    case 'autolayout':
      return `${fix.nodeName} — ${fix.direction.toLowerCase()}, ${fix.itemSpacing}px gap`;
    case 'spacing': {
      const fieldLabel: Record<typeof fix.field, string> = {
        itemSpacing: 'gap',
        paddingTop: 'pad-top',
        paddingRight: 'pad-right',
        paddingBottom: 'pad-bottom',
        paddingLeft: 'pad-left',
      };
      return `${fix.nodeName} · ${fieldLabel[fix.field]}: ${Math.round(fix.oldValue)} → ${fix.newValue}`;
    }
    case 'reorder':
      return `${fix.nodeName} — reorder children`;
  }
}
