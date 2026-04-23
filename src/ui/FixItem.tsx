import type { Fix } from '../core/types';
import { send } from './bridge';

type Props = {
  fix: Fix;
  checked: boolean;
  onToggle: (id: string) => void;
};

export function FixItem({ fix, checked, onToggle }: Props) {
  function jumpToNode() {
    send({ type: 'jump-to-node', nodeId: fix.nodeId });
  }

  function handleRowClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
    jumpToNode();
  }

  function handleRowKey(e: React.KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
    if (e.key === 'Enter') jumpToNode();
  }

  return (
    <li
      className="fix-item"
      onClick={handleRowClick}
      onKeyDown={handleRowKey}
      title="Click to select and zoom to this layer in Figma"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(fix.id)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
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
      return `${fix.nodeName} — reorder ${fix.newChildOrder.length} children`;
  }
}
