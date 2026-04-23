import { useEffect, useState } from 'react';
import { send, subscribe } from './bridge';
import { SettingsPanel } from './SettingsPanel';
import { MainPanel } from './MainPanel';
import iconSvg from '../../assets/icon.svg';
import type { Settings } from '../core/types';

type Tab = 'main' | 'settings';

export function App() {
  const [tab, setTab] = useState<Tab>('main');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'settings') setSettings(msg.payload);
      else if (msg.type === 'settings-saved') flashToast('Settings saved');
      else if (msg.type === 'pong') console.log('[layercraft] pong from sandbox');
      else if (msg.type === 'error') flashToast(msg.message);
    });
    send({ type: 'get-settings' });
    return unsub;
  }, []);

  function flashToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2000);
  }

  function handleSave(next: Settings) {
    setSettings(next);
    send({ type: 'save-settings', payload: next });
  }

  return (
    <div className="app">
      <header className="header">
        <span className="logo" dangerouslySetInnerHTML={{ __html: iconSvg }} />
        <h1>Layercraft</h1>
      </header>

      <nav className="tabs">
        <button className={tab === 'main' ? 'active' : ''} onClick={() => setTab('main')}>
          Main
        </button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </nav>

      <main className="panel">
        {tab === 'main' ? (
          <MainPanel hasApiKey={Boolean(settings?.aiApiKey)} onGoToSettings={() => setTab('settings')} />
        ) : settings ? (
          <div className="settings-scroll">
            <SettingsPanel settings={settings} onSave={handleSave} />
          </div>
        ) : (
          <div className="empty">Loading settings…</div>
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
