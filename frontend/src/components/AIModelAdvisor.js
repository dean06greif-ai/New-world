import React, { useEffect, useRef, useState } from 'react';
import { ChatCircleText, PaperPlaneRight, Cpu } from '@phosphor-icons/react';
import { authHeaders } from '../auth';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const WEIGHT_LABEL = { 1: 'leicht', 2: 'mittel', 3: 'stark' };

/**
 * Modell-Berater im KI-Team-Reiter: zeigt alle verfügbaren KIs (inkl. neu
 * entdeckter Modelle) und bietet einen kleinen Chat, in dem eine KI neutral
 * berät, welches Modell für welche Rolle bzw. als Fallback sinnvoll ist –
 * inklusive Hinterfragen des eigenen Haupt-Modells.
 */
const AIModelAdvisor = () => {
  const [catalog, setCatalog] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    fetch(`${API_URL}/api/ai/models/catalog`).then(r => r.json())
      .then(d => setCatalog(d)).catch(() => {});
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const history = messages.slice(-10);
    setMessages(m => [...m, { role: 'user', text }, { role: 'assistant', text: '' }]);
    try {
      const res = await fetch(`${API_URL}/api/ai/team/advisor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ message: text, history }),
      });
      if (res.status === 401) throw new Error('Admin-Login erforderlich (Schloss oben rechts)');
      if (!res.ok) throw new Error('Berater nicht erreichbar');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim();
          if (!line) continue;
          try {
            const d = JSON.parse(line);
            if (d.t) {
              setMessages(m => {
                const copy = [...m];
                copy[copy.length - 1] = { role: 'assistant', text: copy[copy.length - 1].text + d.t };
                return copy;
              });
            }
            if (d.error) throw new Error(d.error);
          } catch (err) { if (err.message && !err.message.includes('JSON')) throw err; }
        }
      }
    } catch (e) {
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = { role: 'assistant', text: `⚠️ ${e.message}` };
        return copy;
      });
    } finally { setBusy(false); }
  };

  const builtin = catalog?.builtin || {};
  const discovered = catalog?.discovered || [];
  const backups = catalog?.backup_keys || {};
  const providers = catalog?.providers || {};
  const weights = catalog?.weights || {};

  return (
    <div className="ai-model-advisor" data-testid="ai-model-advisor">
      <div className="ai-supervisor-head">
        <span className="ai-supervisor-title">
          <ChatCircleText size={14} weight="fill" /> Modell-Berater – verfügbare KIs &amp; Beratung
        </span>
      </div>
      <div className="ai-team-hint">
        Alle zur Verfügung stehenden KIs auf einen Blick. Der Berater (läuft auf dem
        Haupt-Modell) gibt neutrale Ratschläge, welches Modell für welche Rolle bzw. als
        Fallback passt – er kennt Tages-Limits, Token-Budgets und Kosten und hinterfragt
        dabei ausdrücklich auch das Haupt-Modell selbst.
      </div>
      {catalog && (
        <div className="ai-advisor-catalog" data-testid="ai-advisor-catalog">
          {Object.entries(builtin).map(([prov, models]) => (
            <div key={prov} className="ai-advisor-provider">
              <span className={`ai-advisor-prov-name ${providers[prov] ? '' : 'nokey'}`}>
                <Cpu size={11} weight="bold" /> {prov}
                <em>{providers[prov] ? `${1 + (backups[prov] || 0)} Key(s)` : 'kein Key'}</em>
              </span>
              <div className="ai-advisor-models">
                {models.map(m => (
                  <span key={m} className={`ai-advisor-chip w${weights[m] || 2}`}
                    title={`Stärke: ${WEIGHT_LABEL[weights[m] || 2]}`}>{m}</span>
                ))}
                {discovered.filter(d => d.provider === prov).map(d => (
                  <span key={d.model} className="ai-advisor-chip new"
                    title="Vom Modell-Wächter neu entdeckt – bereits auswählbar"
                    data-testid={`ai-advisor-new-${d.model}`}>NEU · {d.model}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="ai-advisor-chat" data-testid="ai-advisor-chat">
        <div className="ai-advisor-msgs" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="ai-learn-empty">
              Frag z.B.: „Welches Modell ist das beste Haupt-Modell?“ oder
              „Welche Fallbacks passen zum Trade-Manager?“
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`ai-advisor-msg ${m.role}`}
              data-testid={`ai-advisor-msg-${m.role}`}>
              {m.text || (busy && i === messages.length - 1 ? '…' : '')}
            </div>
          ))}
        </div>
        <div className="ai-advisor-input-row">
          <input type="text" value={input} data-no-select="true"
            placeholder="Frage zur Modellwahl stellen…"
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            disabled={busy}
            data-testid="ai-advisor-input" />
          <button className="ai-action-btn" onClick={send} disabled={busy || !input.trim()}
            data-testid="ai-advisor-send-btn">
            <PaperPlaneRight size={13} weight="bold" /> {busy ? '…' : 'Senden'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIModelAdvisor;
