import React, { useEffect, useRef, useState } from 'react'
import { MessageSquare, Mic, ListChecks, Brain, FileText, Github, Code2, Settings, Send, Plus, Trash2, Search, Download, Square, Check } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'
const call = async (p, o) => {
  const r = await fetch(API + p, o)
  const d = r.status === 204 ? null : await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || 'Request failed (' + r.status + ')')
  return d
}
const post = (p, b) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
const VIEWS = [['chat', 'Chat', MessageSquare], ['voice', 'Voice mode', Mic], ['tasks', 'Tasks', ListChecks], ['memory', 'Memory', Brain], ['docs', 'Documents', FileText], ['github', 'GitHub', Github], ['dev', 'Dev tools', Code2], ['settings', 'Settings', Settings]]
const LABEL = { idle: 'Ready', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }

const Robot = ({ s, size = 190 }) => (
  <div className={'robot ' + s} style={{ width: size, height: size, margin: size * 0.1 }}>
    <i className="ring" /><i className="ring r2" />
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <defs><linearGradient id="rh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F0F9FF" /><stop offset=".5" stopColor="#7DD3FC" /><stop offset="1" stopColor="#0369A1" /></linearGradient></defs>
      <rect x="82" y="148" width="36" height="30" rx="6" fill="#0B2236" stroke="#7DD3FC" strokeOpacity=".6" />
      <path d="M64 178h72" stroke="#7DD3FC" strokeOpacity=".5" strokeWidth="3" strokeLinecap="round" />
      <path d="M100 30V14" stroke="#E0F2FE" strokeWidth="3" /><circle cx="100" cy="12" r="5" fill="#8FE3FF" />
      <circle cx="36" cy="100" r="12" fill="#0B2236" stroke="#8FE3FF" strokeWidth="2" /><circle cx="164" cy="100" r="12" fill="#0B2236" stroke="#8FE3FF" strokeWidth="2" />
      <rect x="40" y="30" width="120" height="124" rx="48" fill="url(#rh)" stroke="rgba(255,255,255,.55)" />
      <rect x="56" y="70" width="88" height="42" rx="21" fill="#07121A" stroke="#BDEEFF" strokeWidth="2" />
      <g className="eyes"><ellipse cx="80" cy="91" rx="10" ry="6" fill="#DFF7FF" /><ellipse cx="120" cy="91" rx="10" ry="6" fill="#DFF7FF" /></g>
      <rect x="76" y="128" width="48" height="4" rx="2" fill="#0B2236" fillOpacity=".6" />
      <ellipse cx="78" cy="48" rx="26" ry="10" fill="#fff" fillOpacity=".35" />
    </svg>
  </div>
)

function Msg({ m }) {
  const parts = m.content.split(/```(?:\w+)?\n?/)
  return (
    <div className={'msg ' + m.role}>
      {parts.map((p, i) => (i % 2 ? <pre key={i}>{p}</pre> : p.trim() && <p key={i}>{p}</p>))}
      {m.steps?.length > 0 && <div className="steps">{m.steps.map((s, i) => <span key={i}>✓ {s}</span>)}</div>}
    </div>
  )
}

export default function App() {
  const [view, setView] = useState('chat')
  const [msgs, setMsgs] = useState([])
  const [convs, setConvs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [bot, setBot] = useState('idle')
  const [models, setModels] = useState({ models: [], reachable: false })
  const [model, setModel] = useState(localStorage.getItem('j_model') || '')
  const [speakOn, setSpeakOn] = useState(localStorage.getItem('j_speak') === '1')
  const [palette, setPalette] = useState(false)
  const [toast, setToast] = useState('')
  const [install, setInstall] = useState(null)
  const [voiceOn, setVoiceOn] = useState(false)
  const [heard, setHeard] = useState('')
  const [last, setLast] = useState('')
  const cid = useRef(''), S = useRef({}), loop = useRef(false), rec = useRef(null), end = useRef(null)
  S.current = { model, speakOn }
  const say = t => { setToast(t); setTimeout(() => setToast(''), 3500) }
  const loadConvs = () => call('/conversations/').then(setConvs).catch(() => {})

  useEffect(() => {
    loadConvs()
    call('/models/').then(d => { setModels(d); setModel(m => m || d.default) }).catch(() => {})
    const k = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(p => !p) } if (e.key === 'Escape') setPalette(false) }
    const b = e => { e.preventDefault(); setInstall(e) }
    window.addEventListener('keydown', k); window.addEventListener('beforeinstallprompt', b)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('beforeinstallprompt', b) }
  }, [])
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const speak = t => new Promise(res => {
    if (!window.speechSynthesis) return res()
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t.replace(/```[\s\S]*?```/g, ' code block '))
    u.onstart = () => setBot('speaking'); u.onend = u.onerror = () => { setBot('idle'); res() }
    speechSynthesis.speak(u)
  })
  const listen = () => new Promise((res, rej) => {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!R) { say('Voice input needs Chrome or Edge.'); return rej() }
    const r = new R(); r.lang = 'en-IN'; rec.current = r
    r.onstart = () => setBot('listening'); r.onresult = e => res(e.results[0][0].transcript)
    r.onerror = () => rej(); r.onend = () => setBot(b => (b === 'listening' ? 'idle' : b)); r.start()
  })

  async function send(text, speakReply) {
    text = text.trim(); if (!text) return ''
    setMsgs(m => [...m, { role: 'user', content: text }]); setBusy(true); setBot('thinking')
    let reply
    try {
      const d = await post('/chat/', { message: text, conversation_id: cid.current, model: S.current.model })
      cid.current = d.conversation_id; reply = d.reply
      setMsgs(m => [...m, { role: 'assistant', content: reply, steps: d.steps }]); loadConvs()
    } catch (e) {
      reply = 'I could not reach the JARVIS backend. Start the Django server and try again.'
      setMsgs(m => [...m, { role: 'assistant', content: reply }])
    }
    setBusy(false); setBot('idle'); setLast(reply)
    if (S.current.speakOn && !speakReply) speak(reply)
    return reply
  }
  async function voiceLoop() {
    loop.current = true; setVoiceOn(true)
    while (loop.current) {
      try { const t = await listen(); setHeard(t); const r = await send(t, true); if (loop.current && r) await speak(r) } catch { break }
    }
    stopVoice()
  }
  function stopVoice() { loop.current = false; setVoiceOn(false); rec.current?.abort(); window.speechSynthesis?.cancel(); setBot('idle') }
  const newChat = () => { cid.current = ''; setMsgs([]); setView('chat') }
  const open = async id => { const d = await call('/conversations/' + id + '/'); cid.current = id; setMsgs(d); setView('chat') }
  const go = v => { if (v !== 'voice') stopVoice(); setView(v) }
  const submit = e => { e?.preventDefault(); const t = input; setInput(''); send(t) }

  const actions = [...VIEWS.map(([k, l]) => ({ l: 'Open ' + l, f: () => go(k) })), { l: 'New chat', f: newChat }, { l: 'Search the web…', f: () => { setView('chat'); setInput('/search ') } }]
  const Composer = (
    <form className="bar" onSubmit={submit}>
      <button type="button" className="ic btn" aria-label="Voice mode" onClick={() => go('voice')}><Mic size={20} /></button>
      <input className="in" aria-label="Message JARVIS" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask anything · /task · /remember · /search" />
      <button className="ic btn" aria-label="Send" disabled={busy}><Send size={20} /></button>
    </form>
  )

  return (
    <div className="app">
      <nav className="g rail" aria-label="Main">
        {VIEWS.map(([k, l, I]) => <button key={k} className={'rb' + (view === k ? ' on' : '')} aria-label={l} title={l} onClick={() => go(k)}><I size={20} /></button>)}
      </nav>
      <div className="main">
        <div className="top">
          <h1 className="brand">JARVIS</h1>
          <button className="chip" onClick={() => setPalette(true)}><Search size={16} />Search · Ctrl+K</button>
          <span className="pill">Model: <b>{model || '…'}</b> {models.reachable ? '· online' : '· offline'}</span>
          {install && <button className="btn" onClick={() => install.prompt()}><Download size={16} />Install app</button>}
        </div>
        <div className="content">
          {view === 'chat' && <>
            <div className="g chat">
              <div className="msgs">
                {msgs.length === 0 && <div className="hero">
                  <Robot s={bot} /><h2>Hi, I'm JARVIS.</h2><div className="mut">{LABEL[bot]} Ask me anything, or try a prompt.</div>
                  <div className="row" style={{ justifyContent: 'center' }}>{['Plan my day', '/search latest AI news', 'Explain Django REST framework', '/task Review portfolio'].map(p => <button key={p} className="chip" onClick={() => send(p)}>{p}</button>)}</div>
                </div>}
                {msgs.map((m, i) => <Msg key={i} m={m} />)}
                {busy && <div className="msg"><p>Thinking…</p></div>}
                <div ref={end} />
              </div>
              {Composer}
            </div>
            <aside className="g side">
              <button className="btn" onClick={newChat}><Plus size={16} />New chat</button>
              {convs.length === 0 && <div className="mut">No saved conversations yet.</div>}
              {convs.map(c => <div key={c.conversation_id} className="cv"><span role="button" tabIndex={0} onClick={() => open(c.conversation_id)}>{c.title}</span>
                <button className="x" aria-label="Delete conversation" onClick={async () => { await call('/conversations/' + c.conversation_id + '/', { method: 'DELETE' }); if (cid.current === c.conversation_id) newChat(); loadConvs() }}><Trash2 size={15} /></button></div>)}
            </aside>
          </>}
          {view === 'voice' && <div className="g page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center' }}>
            <Robot s={bot} size={260} /><h2>{LABEL[bot]}</h2>
            {bot !== 'idle' && <div className="wave">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(i => <b key={i} style={{ height: 14 + ((i * 7) % 30), animationDelay: i * 0.08 + 's' }} />)}</div>}
            <div className="g" style={{ maxWidth: 560, width: '100%' }}>
              <div className="mut">You</div><div>{heard || 'Press the mic and speak.'}</div>
              <div className="mut" style={{ marginTop: 10 }}>JARVIS</div><div>{last || '—'}</div>
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              {!voiceOn ? <button className="btn" onClick={voiceLoop}><Mic size={18} />Start hands-free</button> : <button className="btn" onClick={stopVoice}><Square size={18} />Stop</button>}
              <button className="chip" onClick={() => window.speechSynthesis?.cancel()}>Interrupt</button>
            </div>
            <div className="mut">Uses your browser's free speech tools. Chrome or Edge works best.</div>
          </div>}
          {view === 'tasks' && <Tasks model={model} say={say} />}
          {view === 'memory' && <Memory say={say} />}
          {view === 'docs' && <Docs say={say} />}
          {view === 'github' && <Gh model={model} say={say} />}
          {view === 'dev' && <Dev model={model} say={say} />}
          {view === 'settings' && <div className="g page"><h2>Settings</h2>
            <div className="row" style={{ marginTop: 16 }}><label htmlFor="mdl">Model</label>
              <select id="mdl" className="in" style={{ maxWidth: 320 }} value={model} onChange={e => { setModel(e.target.value); localStorage.setItem('j_model', e.target.value) }}>{(models.models.length ? models.models : [model]).map(m => <option key={m}>{m}</option>)}</select></div>
            {!models.reachable && <p className="mut">Ollama was not found. Start it, then reload this page to list your models.</p>}
            <label className="row" style={{ marginTop: 16 }}><input type="checkbox" checked={speakOn} onChange={e => { setSpeakOn(e.target.checked); localStorage.setItem('j_speak', e.target.checked ? '1' : '0') }} />Read replies aloud in chat</label>
            <div className="row" style={{ marginTop: 20 }}><button className="chip" onClick={async () => { await call('/conversations/', { method: 'DELETE' }); newChat(); loadConvs(); say('All conversations deleted.') }}>Delete all conversations</button></div>
          </div>}
        </div>
      </div>
      {palette && <div className="modal" onClick={() => setPalette(false)}><div className="g" onClick={e => e.stopPropagation()}>
        <PaletteList actions={actions} close={() => setPalette(false)} /></div></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

function PaletteList({ actions, close }) {
  const [q, setQ] = useState('')
  const list = actions.filter(a => a.l.toLowerCase().includes(q.toLowerCase()))
  return <>
    <input autoFocus className="in" aria-label="Command" placeholder="Type a command…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && list[0]) { list[0].f(); close() } }} />
    {list.map(a => <button key={a.l} className="cv" onClick={() => { a.f(); close() }}><span>{a.l}</span></button>)}
  </>
}

function useList(path) {
  const [items, setItems] = useState([]), [err, setErr] = useState('')
  const load = () => call(path).then(d => { setItems(d); setErr('') }).catch(e => setErr(e.message))
  useEffect(() => { load() }, [])
  return [items, load, err]
}

function Tasks({ model, say }) {
  const [items, load, err] = useList('/tasks/'), [t, setT] = useState(''), [b, setB] = useState(false)
  const add = async e => { e.preventDefault(); if (!t.trim()) return; await post('/tasks/', { title: t }).catch(x => say(x.message)); setT(''); load() }
  const plan = async () => { if (!t.trim()) return say('Type a goal first, then press AI breakdown.'); setB(true); try { await post('/tasks/breakdown/', { goal: t, model }); setT('') } catch (x) { say(x.message) } setB(false); load() }
  return <div className="g page"><h2>Tasks</h2><p className="mut">{items.filter(i => !i.completed).length} open · {items.filter(i => i.completed).length} done · saved in your local database</p>
    <form className="row" onSubmit={add}><input className="in" style={{ flex: 1 }} aria-label="New task" value={t} onChange={e => setT(e.target.value)} placeholder="Add a task, or type a goal and press AI breakdown" />
      <button className="btn">Add</button><button type="button" className="chip" disabled={b} onClick={plan}>{b ? 'Planning…' : 'AI breakdown'}</button></form>
    {err && <p className="mut">{err}</p>}
    {items.map(i => <div key={i.id} className={'tk' + (i.completed ? ' done' : '')}>
      <button className="ck" aria-label="Toggle done" onClick={async () => { await call('/tasks/' + i.id + '/', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: !i.completed }) }); load() }}>{i.completed && <Check size={14} />}</button>
      <span>{i.title}</span><button className="x" aria-label="Delete task" onClick={async () => { await call('/tasks/' + i.id + '/', { method: 'DELETE' }); load() }}><Trash2 size={16} /></button></div>)}
  </div>
}

function Memory({ say }) {
  const [items, load] = useList('/memory/'), [f, setF] = useState('')
  return <div className="g page"><h2>Memory</h2><p className="mut">Facts JARVIS uses in every chat. You control them. Tip: say "remember that…" in chat.</p>
    <form className="row" onSubmit={async e => { e.preventDefault(); if (!f.trim()) return; await post('/memory/', { fact: f }).catch(x => say(x.message)); setF(''); load() }}>
      <input className="in" style={{ flex: 1 }} aria-label="New memory" value={f} onChange={e => setF(e.target.value)} placeholder="e.g. I prefer short answers" /><button className="btn">Save</button></form>
    <div className="grid">{items.map(i => <div className="item" key={i.id}><div>{i.fact}</div><button className="x" aria-label="Delete memory" onClick={async () => { await call('/memory/' + i.id + '/', { method: 'DELETE' }); load() }}><Trash2 size={16} /></button></div>)}</div>
    {items.length === 0 && <p className="mut">Nothing saved yet.</p>}</div>
}

function Docs({ say }) {
  const [items, load] = useList('/documents/'), [up, setUp] = useState(false)
  const upload = async e => {
    const file = e.target.files[0]; if (!file) return; setUp(true)
    const fd = new FormData(); fd.append('file', file)
    try { await call('/documents/', { method: 'POST', body: fd }); say('Document added.') } catch (x) { say(x.message) }
    setUp(false); e.target.value = ''; load()
  }
  return <div className="g page"><h2>Documents</h2><p className="mut">Upload .txt, .md or .pdf files. JARVIS searches them automatically when you ask a related question in chat.</p>
    <label className="btn" style={{ cursor: 'pointer' }}>{up ? 'Reading…' : 'Upload a file'}<input type="file" accept=".txt,.md,.pdf" hidden onChange={upload} /></label>
    <div className="grid">{items.map(i => <div className="item" key={i.id}><div>{i.name}</div><div className="mut">{i.chars.toLocaleString()} characters indexed</div>
      <button className="x" aria-label="Delete document" onClick={async () => { await call('/documents/' + i.id + '/', { method: 'DELETE' }); load() }}><Trash2 size={16} /></button></div>)}</div>
    {items.length === 0 && <p className="mut">No documents yet.</p>}</div>
}

function Gh({ model, say }) {
  const [u, setU] = useState(localStorage.getItem('j_gh') || ''), [repos, setRepos] = useState([]), [out, setOut] = useState(''), [b, setB] = useState('')
  const find = async e => { e.preventDefault(); localStorage.setItem('j_gh', u); try { setRepos(await call('/github/' + u.trim() + '/')) } catch (x) { say(x.message) } }
  const analyze = async r => { setB(r); setOut(''); try { const d = await post('/github/', { user: u.trim(), repo: r, model }); setOut(d.reply) } catch (x) { say(x.message) } setB('') }
  return <div className="g page"><h2>GitHub assistant</h2><p className="mut">Reads public repositories with GitHub's free API.</p>
    <form className="row" onSubmit={find}><input className="in" style={{ flex: 1 }} aria-label="GitHub username" value={u} onChange={e => setU(e.target.value)} placeholder="GitHub username" /><button className="btn">Load repos</button></form>
    <div className="grid">{repos.map(r => <div className="item" key={r.name}><b>{r.name}</b><div className="mut">{r.description || 'No description'}</div><div className="mut">{r.language || '—'} · ★ {r.stars}</div>
      <button className="chip" disabled={!!b} onClick={() => analyze(r.name)}>{b === r.name ? 'Analyzing…' : 'Analyze'}</button></div>)}</div>
    {out && <div className="msg" style={{ marginTop: 14, maxWidth: '100%' }}><Msg m={{ role: 'assistant', content: out }} /></div>}</div>
}

function Dev({ model, say }) {
  const [mode, setMode] = useState('Explain'), [code, setCode] = useState(''), [out, setOut] = useState(''), [b, setB] = useState(false)
  const run = async () => {
    if (!code.trim()) return say('Paste some code first.'); setB(true); setOut('')
    const ask = { Explain: 'Explain what this code does, step by step.', Debug: 'Find bugs in this code and show the fixed version.', Refactor: 'Refactor this code for clarity and show the result.', 'Write tests': 'Write unit tests for this code.' }[mode]
    try { setOut((await post('/chat/', { message: ask + '\n\n' + code, save: false, model })).reply) } catch (x) { say(x.message) }
    setB(false)
  }
  return <div className="g page"><h2>Dev tools</h2>
    <div className="row" style={{ margin: '12px 0' }}>{['Explain', 'Debug', 'Refactor', 'Write tests'].map(m => <button key={m} className={'chip' + (mode === m ? ' on' : '')} style={mode === m ? { background: 'var(--sky)', color: '#04121F' } : {}} onClick={() => setMode(m)}>{m}</button>)}</div>
    <textarea className="in" aria-label="Code" rows={10} value={code} onChange={e => setCode(e.target.value)} placeholder="Paste code here" />
    <div className="row" style={{ margin: '12px 0' }}><button className="btn" disabled={b} onClick={run}>{b ? 'Working…' : 'Run'}</button></div>
    {out && <Msg m={{ role: 'assistant', content: out }} />}</div>
}
