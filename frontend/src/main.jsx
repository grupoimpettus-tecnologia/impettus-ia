import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, AlertCircle, Bell, BookOpen, Brain, Building2, ChevronRight,
  FileText, Folder, HelpCircle, History, Lock, LogOut, MapPin, Megaphone,
  MessageSquare, Package, Plus, Quote, ScrollText, Search, Send, Settings,
  ShieldCheck, Star, Store, Trash2, TrendingUp, Upload, UserCheck, Users,
  X, Zap, LayoutDashboard,
} from 'lucide-react';
import './styles.css';

const API        = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
const CATEGORIES = ['Contratos','Financeiro','Fornecedores','Operacional','RH','Marketing','TI','Franqueados','Treinamentos','Outros'];
const ROLES = [
  'Admin', 'Presidência', 'Diretoria', 'BI', 'P&D', 'Marketing',
  'Expansão', 'GGC', 'Supply', 'Operações', 'Treinamento', 'Comercial',
  'Delivery', 'Projetos', 'Tecnologia', 'Financeiro', 'TI',
  'Operação', 'Franqueado',
];

// ── Configuração visual das marcas do Grupo Impettus ─────────────────────────
const BRAND_CFG = {
  'Espetto Carioca':   { color: '#f5a020', bg: 'rgba(245,160,32,.14)',  logo: '/brands/espetto-carioca.png',  Icon: Zap,         tagline: 'Espetos irresistíveis' },
  'Buteco Seu Rufino': { color: '#1c3a6a', bg: 'rgba(28,58,106,.16)',   logo: '/brands/buteco-seu-rufino.png', Icon: Store,       tagline: 'Boteco raiz, chope gelado' },
  'Mané':              { color: '#d41f1f', bg: 'rgba(212,31,31,.14)',   logo: '/brands/mane.png',              Icon: Package,     tagline: 'Um Boteco F*#@' },
  'Sirène':            { color: '#c9960a', bg: 'rgba(201,150,10,.14)',  logo: '/brands/sirene.png',            Icon: Star,        tagline: 'Frutos do mar & requinte' },
  'Bendito':           { color: '#6b2c0a', bg: 'rgba(107,44,10,.16)',   logo: '/brands/bendito.png',           Icon: ShieldCheck, tagline: 'Momento Bendito' },
};

const CAT_CFG = {
  'Financeiro':   { Icon: FileText,  color: '#ff7a18', bg: 'rgba(255,122,24,.15)' },
  'Contratos':    { Icon: FileText,  color: '#ff7a18', bg: 'rgba(255,122,24,.15)' },
  'Fornecedores': { Icon: Package,   color: '#22d3ee', bg: 'rgba(34,211,238,.13)' },
  'Operacional':  { Icon: Settings,  color: '#fb923c', bg: 'rgba(251,146,60,.15)' },
  'RH':           { Icon: Users,     color: '#f472b6', bg: 'rgba(244,114,182,.13)' },
  'Marketing':    { Icon: Megaphone, color: '#fb923c', bg: 'rgba(251,146,60,.15)' },
  'TI':           { Icon: Settings,  color: '#818cf8', bg: 'rgba(129,140,248,.13)' },
  'Franqueados':  { Icon: Building2, color: '#34d399', bg: 'rgba(52,211,153,.13)' },
  'Treinamentos': { Icon: BookOpen,  color: '#fbbf24', bg: 'rgba(251,191,36,.13)'  },
  'Outros':       { Icon: Folder,    color: '#94a3b8', bg: 'rgba(148,163,184,.13)' },
};

// ── API helper com Bearer token ───────────────────────────────────────────────
async function api(url, options = {}) {
  const token   = localStorage.getItem('impettus_token');
  const headers = { ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const r = await fetch(url, { ...options, headers });
  if (r.status === 401) { localStorage.clear(); window.location.reload(); }
  return r;
}

// Páginas acessíveis por usuários comuns
const USER_PAGES = ['chat', 'activity', 'history'];

// ── App ───────────────────────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState(localStorage.getItem('impettus_token'));
  const [user,  setUser]  = useState(() => { try { return JSON.parse(localStorage.getItem('impettus_user') || 'null'); } catch { return null; } });
  const [page,  setPage]  = useState(() => {
    try {
      const u = JSON.parse(localStorage.getItem('impettus_user') || 'null');
      return u?.role === 'Admin' ? 'dashboard' : 'chat';
    } catch { return 'chat'; }
  });
  const [stats,       setStats]       = useState(null);
  const [notifCount,  setNotifCount]  = useState(0);
  const [activeBrand,    setActiveBrand]    = useState(null);         // marca selecionada
  const [activeMarcaTab, setActiveMarcaTab] = useState('overview');   // aba inicial da MarcaPage
  const [bgImport,       setBgImport]       = useState(null);         // importação background

  const isAdmin = user?.role === 'Admin';

  const loadStats = useCallback(async () => {
    try { const r = await api(`${API}/stats`); if (r.ok) setStats(await r.json()); } catch {}
  }, []);

  const loadNotifCount = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const r = await api(`${API}/notifications/count`);
      if (r.ok) { const d = await r.json(); setNotifCount(d.count || 0); }
    } catch {}
  }, [isAdmin]);

  useEffect(() => { if (token) { loadStats(); loadNotifCount(); } }, [token, loadStats, loadNotifCount]);

  function handleLogin(tok, userData) {
    localStorage.setItem('impettus_token', tok);
    localStorage.setItem('impettus_user',  JSON.stringify(userData));
    setToken(tok);
    setUser(userData);
    // Redireciona para o destino correto conforme o perfil
    setPage(userData.role === 'Admin' ? 'dashboard' : 'chat');
  }

  function handleLogout() {
    localStorage.clear();
    setToken(null);
    setUser(null);
    setPage('chat');
  }

  // navigate(page) ou navigate('marca', brandObj, tab?)
  function navigate(pg, data = null, tab = null) {
    if (pg === 'marca' && data) setActiveBrand(data);
    if (pg === 'marca') setActiveMarcaTab(tab || 'overview');
    setPage(pg);
  }

  // Importação em background — sobrevive à navegação
  async function startBgImport(brand, files, category) {
    const VALID_EXT = /\.(pdf|docx|xlsx|xlsm|csv|txt|md)$/i;
    const valid = files.filter(f => VALID_EXT.test(f.name));
    if (!valid.length) return;
    setBgImport({ brandId: brand.id, brandName: brand.name, done: 0, total: valid.length, current: '', active: true });
    let done = 0;
    for (const f of valid) {
      setBgImport(s => s ? { ...s, current: f.name } : s);
      try {
        const fd = new FormData();
        fd.append('file',     f);
        fd.append('category', category);
        fd.append('brand_id', brand.id);
        await api(`${API}/documents/upload`, { method: 'POST', body: fd });
      } catch {}
      done++;
      setBgImport(s => s ? { ...s, done } : s);
    }
    setBgImport(s => s ? { ...s, active: false, current: 'Concluído!' } : s);
    setTimeout(() => setBgImport(null), 8000);
  }

  // Importação inteligente de rede de lojas — lê estrutura de pastas
  // storeMap: { [storeName|'_root']: { [category]: File[] } }
  async function startSmartImport(brand, storeMap) {
    const VALID_EXT = /\.(pdf|docx|xlsx|xlsm|csv|txt|md)$/i;
    const total = Object.values(storeMap).reduce(
      (acc, cats) => acc + Object.values(cats).reduce(
        (a, files) => a + files.filter(f => VALID_EXT.test(f.name)).length, 0
      ), 0
    );
    if (!total) return;

    setBgImport({ brandId: brand.id, brandName: brand.name, done: 0, total, current: '', active: true });
    let done = 0;
    const storeCache = {};  // name → id

    for (const [storeName, categories] of Object.entries(storeMap)) {
      // Resolve store_id (cria loja se não existir)
      let storeId = null;
      if (storeName !== '_root') {
        try {
          if (storeCache[storeName]) {
            storeId = storeCache[storeName];
          } else {
            const sr = await api(`${API}/stores/ensure`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: storeName, brand_id: brand.id }),
            });
            if (sr.ok) { const sd = await sr.json(); storeId = sd.store?.id; storeCache[storeName] = storeId; }
          }
        } catch {}
      }

      for (const [category, files] of Object.entries(categories)) {
        const valid = files.filter(f => VALID_EXT.test(f.name));
        for (const f of valid) {
          const label = storeName !== '_root' ? `${storeName} / ${f.name}` : f.name;
          setBgImport(s => s ? { ...s, current: label } : s);
          try {
            const fd = new FormData();
            fd.append('file',     f);
            fd.append('category', category);
            fd.append('brand_id', brand.id);
            if (storeId) fd.append('store_id', storeId);
            await api(`${API}/documents/upload`, { method: 'POST', body: fd });
          } catch {}
          done++;
          setBgImport(s => s ? { ...s, done } : s);
        }
      }
    }
    setBgImport(s => s ? { ...s, active: false, current: 'Concluído!' } : s);
    setTimeout(() => setBgImport(null), 8000);
  }

  // Proteção de rota: usuário comum que tente acessar página restrita vai para chat
  const safePage = (!isAdmin && !USER_PAGES.includes(page)) ? 'chat' : page;

  if (!token) return <Login onLogin={handleLogin} />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-logo">
          <Zap size={20} fill="#ff9f1c" stroke="none" className="logo-bolt"/>
          <div className="logo-text-block">
            <span className="logo-name">IMPETTUS</span>
            <span className="logo-tag"><em>be</em> unstoppable</span>
          </div>
        </div>

        {/* ── Itens exclusivos do Admin ── */}
        {isAdmin && (
          <NavBtn active={safePage==='dashboard'} onClick={()=>setPage('dashboard')} icon={<LayoutDashboard/>}>Dashboard</NavBtn>
        )}

        {isAdmin && (
          <>
            <div className="nav-title">CONHECIMENTO</div>
            <NavBtn active={safePage==='grupo'}       onClick={()=>setPage('grupo')}       icon={<LayoutDashboard/>}>Grupo Impettus</NavBtn>
            <NavBtn active={safePage==='marcas'}      onClick={()=>setPage('marcas')}      icon={<Building2/>}>Marcas</NavBtn>
            <NavBtn active={safePage==='documents'}   onClick={()=>setPage('documents')}   icon={<FileText/>}>Documentos</NavBtn>
            <NavBtn active={safePage==='categories'}  onClick={()=>setPage('categories')}  icon={<Folder/>}>Categorias</NavBtn>
            <NavBtn active={safePage==='sources'}     onClick={()=>setPage('sources')}     icon={<Quote/>}>Fontes citadas</NavBtn>
            <NavBtn active={safePage==='faq'}         onClick={()=>setPage('faq')}         icon={<HelpCircle/>}>Perguntas frequentes</NavBtn>
          </>
        )}

        {/* ── Itens acessíveis a todos os perfis ── */}
        <div className="nav-title">IA &amp; CONVERSAS</div>
        <NavBtn active={safePage==='chat'}     onClick={()=>setPage('chat')}     icon={<MessageSquare/>}>Nova conversa</NavBtn>
        <NavBtn active={safePage==='activity'} onClick={()=>setPage('activity')} icon={<Activity/>}>Atividade recente</NavBtn>
        <NavBtn active={safePage==='history'}  onClick={()=>setPage('history')}  icon={<History/>}>Histórico de conversas</NavBtn>

        {/* ── Administração — Admin only ── */}
        {isAdmin && (
          <>
            <div className="nav-title">ADMINISTRAÇÃO</div>
            <NavBtn active={safePage==='unanswered'}  onClick={()=>setPage('unanswered')}  icon={<AlertCircle/>} badge={notifCount}>Sem resposta</NavBtn>
            <NavBtn active={safePage==='users'}       onClick={()=>setPage('users')}       icon={<Users/>}>Usuários</NavBtn>
            <NavBtn active={safePage==='departments'} onClick={()=>setPage('departments')} icon={<Building2/>}>Departamentos</NavBtn>
            <NavBtn active={safePage==='settings'}    onClick={()=>setPage('settings')}    icon={<Settings/>}>Configurações</NavBtn>
            <NavBtn active={safePage==='logs'}        onClick={()=>setPage('logs')}        icon={<ScrollText/>}>Logs do sistema</NavBtn>
          </>
        )}

        {isAdmin && (
          <div className="version-card">
            <div className="app-icon"><Brain size={25}/></div>
            <div>
              <b>Impettus IA</b>
              <span>V11.0</span>
              <small>Plataforma corporativa multidepartamental</small>
            </div>
          </div>
        )}

        <div className="user-card" style={!isAdmin ? { marginTop: 'auto' } : {}}>
          <div className="avatar">{(user?.name || 'A')[0].toUpperCase()}</div>
          <div className="user-info">
            <b>{user?.name || 'Administrador'}</b>
            <span>{user?.email || 'admin@impettus.local'}</span>
          </div>
          {isAdmin && <ChevronRight size={15} className="user-chevron"/>}
        </div>

        <button className="exit" onClick={handleLogout}><LogOut size={18}/> Sair</button>
      </aside>

      <main className="main">
        <Topbar
          userName={user?.name || 'Administrador'}
          role={user?.role}
          isAdmin={isAdmin}
          notifCount={notifCount}
          onNotifRead={loadNotifCount}
          onNavigate={setPage}
        />

        {/* ── Toast de importação em background ── */}
        {bgImport && (
          <div className={`bg-import-toast${bgImport.active ? '' : ' done'}`}>
            <div className="bg-import-header">
              <Upload size={13}/>
              <span className="bg-import-brand">{bgImport.brandName}</span>
              <span className="bg-import-count">{bgImport.done}/{bgImport.total}</span>
              {!bgImport.active && (
                <button className="bg-import-close" onClick={() => setBgImport(null)}>✕</button>
              )}
            </div>
            <div className="bg-import-track">
              <div className="bg-import-bar" style={{ width:`${bgImport.total ? (bgImport.done/bgImport.total)*100 : 0}%` }}/>
            </div>
            <p className="bg-import-label">{bgImport.active ? bgImport.current : '✓ Importação concluída!'}</p>
          </div>
        )}

        {/* ── Páginas Admin ── */}
        {isAdmin && safePage==='dashboard'   && <Dashboard stats={stats} setPage={navigate} />}
        {isAdmin && safePage==='grupo'       && <GrupoPage onNavigate={navigate} />}
        {isAdmin && safePage==='marca'       && <MarcaPage brand={activeBrand} initialTab={activeMarcaTab} bgImport={bgImport?.brandId===activeBrand?.id ? bgImport : null} onStartImport={startBgImport} onStartSmartImport={startSmartImport} onNavigate={navigate} />}
        {isAdmin && safePage==='marcas'      && <MarcasPage onNavigate={navigate} />}
        {isAdmin && safePage==='documents'   && <Documents onChange={loadStats} />}
        {isAdmin && safePage==='categories'  && <Categories />}
        {isAdmin && safePage==='sources'     && <Sources />}
        {isAdmin && safePage==='faq'         && <Faq user={user} />}
        {isAdmin && safePage==='unanswered'  && <UnansweredPage onNavigate={setPage} onNotifRead={loadNotifCount} />}
        {isAdmin && safePage==='users'       && <UsersPage user={user} />}
        {isAdmin && safePage==='departments' && <DepartmentsPage user={user} />}
        {isAdmin && safePage==='settings'    && <SettingsPage />}
        {isAdmin && safePage==='logs'        && <SystemLogs />}

        {/* ── Páginas comuns (todos os perfis) ── */}
        {safePage==='chat'     && <Chat />}
        {safePage==='activity' && <ActivityPage />}
        {safePage==='history'  && <ConvHistory user={user} isAdmin={isAdmin} />}
      </main>
    </div>
  );
}

function NavBtn({ active, icon, children, onClick, badge }) {
  return (
    <button className={`nav-btn ${active ? 'active' : ''}`} onClick={onClick}>
      {React.cloneElement(icon, { size: 16 })}
      <span style={{ flex: 1 }}>{children}</span>
      {badge > 0 && <b className="nav-badge">{badge > 99 ? '99+' : badge}</b>}
    </button>
  );
}

// ── Topbar ────────────────────────────────────────────────────────────────────
const ROLE_LABEL = {
  Admin:       { label: 'Administrador', color: '#ff7a18' },
  'Presidência':{ label: 'Presidência',  color: '#e879f9' },
  Diretoria:   { label: 'Diretoria',     color: '#818cf8' },
  BI:          { label: 'BI',            color: '#38bdf8' },
  'P&D':       { label: 'P&D',           color: '#a3e635' },
  Marketing:   { label: 'Marketing',     color: '#fb923c' },
  'Expansão':  { label: 'Expansão',      color: '#4ade80' },
  GGC:         { label: 'GGC',           color: '#f43f5e' },
  Supply:      { label: 'Supply',        color: '#06b6d4' },
  'Operações': { label: 'Operações',     color: '#34d399' },
  Treinamento: { label: 'Treinamento',   color: '#fbbf24' },
  Comercial:   { label: 'Comercial',     color: '#fd7c00' },
  Delivery:    { label: 'Delivery',      color: '#10b981' },
  Projetos:    { label: 'Projetos',      color: '#8b5cf6' },
  Tecnologia:  { label: 'Tecnologia',    color: '#f472b6' },
  Financeiro:  { label: 'Financeiro',    color: '#22d3ee' },
  TI:          { label: 'TI',            color: '#c084fc' },
  'Operação':  { label: 'Operação',      color: '#34d399' },
  Franqueado:  { label: 'Franqueado',    color: '#fbbf24' },
};

function Topbar({ userName, role, isAdmin, notifCount, onNotifRead, onNavigate }) {
  const [showPanel, setShowPanel] = useState(false);
  const rl = ROLE_LABEL[role] || { label: role || 'Usuário', color: '#9fb0c8' };

  function togglePanel() { setShowPanel(s => !s); }
  function closePanel()  { setShowPanel(false); }

  return (
    <div className="topbar">
      <div>
        <h1>Olá, {userName}! 👋</h1>
        <p>
          <span className="role-badge" style={{ background: `${rl.color}22`, color: rl.color, border: `1px solid ${rl.color}55` }}>
            {rl.label}
          </span>
          {isAdmin
            ? ' Aqui está o resumo da atividade do Impettus IA.'
            : ' Bem-vindo ao Impettus IA. Use o chat para consultar a base de conhecimento.'}
        </p>
      </div>
      <div className="top-actions">
        {isAdmin && (
          <label className="search">
            <Search size={18}/>
            <input placeholder="Buscar documentos, categorias..." />
          </label>
        )}
        {isAdmin && (
          <div className="bell" onClick={togglePanel} style={{ cursor: 'pointer' }}>
            <Bell size={20}/>
            {notifCount > 0 && <span>{notifCount > 99 ? '99+' : notifCount}</span>}
            {showPanel && (
              <NotificationsPanel
                onClose={closePanel}
                onNotifRead={() => { onNotifRead?.(); }}
                onNavigate={p => { onNavigate?.(p); closePanel(); }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Painel de Notificações (preview compacto) ─────────────────────────────────
function NotificationsPanel({ onClose, onNotifRead, onNavigate }) {
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`${API}/notifications`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setNotifs(d.notifications || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
    const handler = e => {
      if (!e.target.closest('.notif-dropdown') && !e.target.closest('.bell')) onClose();
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, []);

  const unread  = notifs.filter(n => !n.read);
  const preview = unread.slice(0, 4);

  function fmt(ts) {
    const d = new Date(ts);
    return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  return (
    <div className="notif-dropdown" onClick={e => e.stopPropagation()}>
      <div className="notif-header">
        <div className="notif-header-left">
          <Bell size={14}/> Sem resposta
          {unread.length > 0 && <b className="notif-badge">{unread.length}</b>}
        </div>
        <button className="notif-action-btn" onClick={onClose}><X size={13}/></button>
      </div>

      {loading && <p className="notif-empty">Carregando…</p>}

      {!loading && unread.length === 0 && (
        <p className="notif-empty">✅ Nenhuma pergunta não respondida.</p>
      )}

      {!loading && preview.length > 0 && (
        <div className="notif-list">
          {preview.map(n => (
            <div key={n.id} className="notif-item">
              <div className="notif-question">
                <span className="notif-dot"/>
                <span>"{n.question.length > 90 ? n.question.slice(0, 90) + '…' : n.question}"</span>
              </div>
              <div className="notif-meta">
                <span>{n.asked_by}</span>
                <span>{fmt(n.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="notif-footer">
        <button
          className="notif-btn-ver-todas"
          onClick={() => { onNavigate('unanswered'); onClose(); }}
        >
          <AlertCircle size={13}/>
          {unread.length > 0
            ? `Gerenciar ${unread.length} pergunta${unread.length > 1 ? 's' : ''} →`
            : 'Ver histórico →'}
        </button>
      </div>
    </div>
  );
}

// ── Página: Perguntas sem resposta ────────────────────────────────────────────
function UnansweredPage({ onNavigate, onNotifRead }) {
  const [notifs,  setNotifs]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('unread');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`${API}/notifications`);
      if (r.ok) { const d = await r.json(); setNotifs(d.notifications || []); }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function markRead(id) {
    await api(`${API}/notifications/${id}/read`, { method: 'PATCH' });
    setNotifs(n => n.map(x => x.id === id ? { ...x, read: true } : x));
    onNotifRead?.();
  }

  async function remove(id) {
    await api(`${API}/notifications/${id}`, { method: 'DELETE' });
    setNotifs(n => n.filter(x => x.id !== id));
    onNotifRead?.();
  }

  async function markAllRead() {
    await api(`${API}/notifications/read-all`, { method: 'POST' });
    setNotifs(n => n.map(x => ({ ...x, read: true })));
    onNotifRead?.();
  }

  const unreadCount = notifs.filter(n => !n.read).length;
  const filtered = notifs.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'read')   return  n.read;
    return true;
  });

  function fmt(ts) {
    const d = new Date(ts);
    return isNaN(d) ? '—' : d.toLocaleString('pt-BR');
  }

  const FILTERS = [
    { key: 'unread', label: 'Não lidas', count: notifs.filter(n => !n.read).length },
    { key: 'all',    label: 'Todas',     count: notifs.length },
    { key: 'read',   label: 'Lidas',     count: notifs.filter(n =>  n.read).length },
  ];

  return (
    <div>
      {/* Header */}
      <div className="panel-header" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle size={22} color="var(--orange)"/>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Perguntas sem resposta</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
              Perguntas que a IA não conseguiu responder — alimente a base de conhecimento
            </p>
          </div>
          {unreadCount > 0 && (
            <span className="unanswered-count-badge">{unreadCount} não lidas</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button className="btn-add" onClick={markAllRead}>
            <UserCheck size={14}/> Marcar todas lidas
          </button>
        )}
      </div>

      {/* Filtros */}
      <div className="unanswered-filters">
        {FILTERS.map(tab => (
          <button
            key={tab.key}
            className={`unanswered-filter-btn${filter === tab.key ? ' active' : ''}`}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label}
            <span className="unanswered-filter-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading && <p style={{ color: 'var(--muted)', padding: '20px 0' }}>Carregando…</p>}

      {!loading && filtered.length === 0 && (
        <div className="unanswered-empty">
          <AlertCircle size={36} color="var(--muted)"/>
          <p>{filter === 'unread' ? '✅ Nenhuma pergunta não lida no momento!' : 'Nenhuma pergunta encontrada.'}</p>
        </div>
      )}

      <div className="unanswered-list">
        {filtered.map(n => (
          <div key={n.id} className={`unanswered-card${n.read ? ' read' : ''}`}>

            {/* Pergunta */}
            <div className="unanswered-card-top">
              {!n.read && <span className="notif-dot" style={{ marginTop: 3, flexShrink: 0 }}/>}
              <div className="unanswered-q-wrap">
                <HelpCircle size={15} color="var(--orange)" style={{ flexShrink: 0, marginTop: 1 }}/>
                <p className="unanswered-q-text">"{n.question}"</p>
              </div>
            </div>

            {/* Meta */}
            <div className="unanswered-meta">
              <span><Users size={11}/> {n.asked_by}{n.asked_by_email ? ` · ${n.asked_by_email}` : ''}</span>
              <span>{fmt(n.created_at)}</span>
            </div>

            {/* Ações */}
            <div className="unanswered-actions">
              <button
                className="unanswered-btn-docs"
                onClick={() => { markRead(n.id); onNavigate('documents'); }}
                title="Ir para Documentos e adicionar material que responda esta pergunta"
              >
                <Upload size={13}/> Adicionar documento
              </button>
              <button
                className="unanswered-btn-faq"
                onClick={() => { markRead(n.id); onNavigate('faq'); }}
                title="Criar uma FAQ com a resposta para esta pergunta"
              >
                <HelpCircle size={13}/> Criar FAQ
              </button>
              {!n.read && (
                <button className="notif-btn-read" onClick={() => markRead(n.id)} title="Marcar como lida">
                  <UserCheck size={14}/>
                </button>
              )}
              <button className="notif-btn-del" onClick={() => remove(n.id)} title="Remover">
                <Trash2 size={14}/>
              </button>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}

// ── Página: Grupo Impettus (Holding) ─────────────────────────────────────────
function GrupoPage({ onNavigate }) {
  const [stats,  setStats]  = useState(null);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [rs, rb] = await Promise.all([
          api(`${API}/stats`),
          api(`${API}/brands/stats`),
        ]);
        if (!alive) return;
        if (rs.ok) { const d = await rs.json(); if (alive) setStats(d); }
        if (rb.ok) { const d = await rb.json(); if (alive) setBrands(d.brands || []); }
      } catch (_) {}
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  const totalStores = brands.reduce((a, b) => a + (b.stats?.stores || 0), 0);
  const totalUsers  = brands.reduce((a, b) => a + (b.stats?.users  || 0), 0);

  return (
    <section className="grupo-page">

      {/* ── Hero ── */}
      <div className="grupo-hero">
        <img src="/impettus-logo.jpeg" alt="Grupo Impettus" className="grupo-hero-logo" />
        <div className="grupo-hero-text">
          <h1 className="grupo-hero-title">Grupo Impettus</h1>
          <p className="grupo-hero-sub">A maior holding de bares e butecos do Brasil</p>
          <p className="grupo-hero-tagline"><span className="grupo-be">be</span> unstoppable</p>
        </div>
      </div>

      {/* ── KPIs da Holding ── */}
      <div className="grupo-kpis">
        {[
          { label: 'Marcas',        value: brands.length || 5,           icon: <Building2 size={20}/>,      color: '#f5a020' },
          { label: 'Lojas',         value: totalStores,                   icon: <Store size={20}/>,          color: '#35d07f' },
          { label: 'Usuários',      value: totalUsers,                    icon: <Users size={20}/>,          color: '#60a5fa' },
          { label: 'Documentos',    value: stats?.documents   || 0,       icon: <FileText size={20}/>,       color: '#a78bfa' },
          { label: 'Conversas',     value: stats?.conversations || 0,     icon: <MessageSquare size={20}/>,  color: '#f87171' },
          { label: 'Base de Conhecimento', value: stats?.chunks || 0,     icon: <Search size={20}/>,         color: '#fbbf24' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} className="grupo-kpi" style={{ '--kpi-color': color }}>
            <div className="grupo-kpi-icon">{icon}</div>
            <b className="grupo-kpi-value">{loading ? '…' : value.toLocaleString('pt-BR')}</b>
            <span className="grupo-kpi-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Portfólio de Marcas ── */}
      <div className="grupo-section">
        <div className="grupo-section-header">
          <h2 className="grupo-section-title"><Building2 size={18}/> Portfólio de Marcas</h2>
          <span className="grupo-section-hint">Clique em uma marca para abrir o portal</span>
        </div>

        <div className="grupo-brands-grid">
          {brands.map(brand => {
            const cfg = BRAND_CFG[brand.name] || { color: '#9fb0c8', bg: 'rgba(159,176,200,.12)', Icon: Building2 };
            const s   = brand.stats || {};
            return (
              <button key={brand.id} className="grupo-brand-card grupo-brand-btn"
                   style={{ '--brand-color': cfg.color, '--brand-bg': cfg.bg }}
                   onClick={() => onNavigate('marca', brand)}>
                <div className="grupo-brand-logo-wrap">
                  {cfg.logo
                    ? <img src={cfg.logo} alt={brand.name} className="grupo-brand-logo"
                           onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }}/>
                    : null}
                  <span style={{ display: cfg.logo ? 'none' : 'flex' }}>
                    <cfg.Icon size={24} color={cfg.color}/>
                  </span>
                </div>
                <div className="grupo-brand-info">
                  <strong className="grupo-brand-name">{brand.name}</strong>
                  <span className="grupo-brand-tagline">{cfg.tagline || ''}</span>
                </div>
                <div className="grupo-brand-numbers">
                  <span title="Lojas"><Store size={11}/> {s.stores || 0}</span>
                  <span title="Usuários"><Users size={11}/> {s.users || 0}</span>
                  <span title="Documentos"><FileText size={11}/> {s.documents || 0}</span>
                </div>
                <ChevronRight size={16} className="grupo-brand-arrow"/>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Identidade ── */}
      <div className="grupo-identity">
        <div className="grupo-identity-card">
          <h3><Zap size={16} color="#f5a020"/> Missão</h3>
          <p>Democratizar experiências gastronômicas autênticas em todo o Brasil, levando o melhor do boteco, da praticidade e do sabor para cada franqueado e cliente.</p>
        </div>
        <div className="grupo-identity-card">
          <h3><TrendingUp size={16} color="#35d07f"/> Visão</h3>
          <p>Ser a maior e mais reconhecida holding de bares e butecos do Brasil até 2030, com presença em todas as regiões do país.</p>
        </div>
        <div className="grupo-identity-card">
          <h3><ShieldCheck size={16} color="#60a5fa"/> Valores</h3>
          <p>Autenticidade, inovação, excelência operacional, respeito às pessoas e paixão pelo que fazemos.</p>
        </div>
      </div>

    </section>
  );
}


// ── Página: Portal da Marca ──────────────────────────────────────────────────
function MarcaPage({ brand, initialTab = 'overview', bgImport, onStartImport, onStartSmartImport, onNavigate }) {
  const [tab,    setTab]    = useState(initialTab);
  const [docs,   setDocs]   = useState([]);
  const [users,  setUsers]  = useState([]);
  const [faqs,   setFaqs]   = useState([]);
  const [stores, setStores] = useState([]);
  const [stats,  setStats]  = useState(null);
  const [newStoreName,   setNewStoreName]   = useState('');
  const [creatingStore,  setCreatingStore]  = useState(false);
  const [autoLinking,    setAutoLinking]    = useState(false);
  const [autoLinkResult, setAutoLinkResult] = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadForm, setUploadForm] = useState({ title:'', category:'Outros', file:null });
  const [showUpload, setShowUpload] = useState(false);
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderCat,   setFolderCat]   = useState('Outros');
  const [showFolder,  setShowFolder]  = useState(false);
  // Smart import (rede de lojas)
  const [smartFiles,   setSmartFiles]   = useState([]);
  const [smartPreview, setSmartPreview] = useState(null);  // storeMap parseado
  const [showSmart,    setShowSmart]    = useState(false);
  const VALID_EXT = /\.(pdf|docx|xlsx|xlsm|csv|txt|md)$/i;

  const cfg = brand ? (BRAND_CFG[brand.name] || { color:'#9fb0c8', bg:'rgba(159,176,200,.12)', Icon:Building2, tagline:'' }) : {};

  useEffect(() => {
    if (!brand) return;
    // Carrega dados da marca em paralelo
    Promise.all([
      api(`${API}/documents`),
      api(`${API}/users`),
      api(`${API}/faqs`),
      api(`${API}/brands/${brand.id}/stats`),
      api(`${API}/stores?brand_id=${brand.id}`),
    ]).then(async ([rd, ru, rf, rs, rst]) => {
      if (rd.ok)  { const d = await rd.json();  setDocs((d.documents||[]).filter(x => x.brand_id === brand.id)); }
      if (ru.ok)  { const d = await ru.json();  setUsers((d.users||[]).filter(x => x.brand_id === brand.id)); }
      if (rf.ok)  { const d = await rf.json();  setFaqs((d.faqs||[]).filter(x => x.brand_id === brand.id)); }
      if (rs.ok)  { const d = await rs.json();  setStats(d.stats || d); }
      if (rst.ok) { const d = await rst.json(); setStores(d.stores || []); }
    });
  }, [brand?.id]);

  // Recarrega docs quando a importação em background desta marca concluir
  useEffect(() => {
    if (bgImport && !bgImport.active && bgImport.brandId === brand?.id) {
      api(`${API}/documents`).then(async rd => {
        if (rd.ok) { const d = await rd.json(); setDocs((d.documents||[]).filter(x => x.brand_id === brand.id)); }
      });
    }
  }, [bgImport?.active, bgImport?.brandId]);

  async function uploadDoc(e) {
    e.preventDefault();
    if (!uploadForm.file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file',     uploadForm.file);
    fd.append('title',    uploadForm.title || uploadForm.file.name);
    fd.append('category', uploadForm.category);
    fd.append('brand_id', brand.id);
    const r = await api(`${API}/documents/upload`, { method:'POST', body: fd });
    if (r.ok) {
      setShowUpload(false);
      setUploadForm({ title:'', category:'Outros', file:null });
      const rd = await api(`${API}/documents`);
      if (rd.ok) { const d = await rd.json(); setDocs((d.documents||[]).filter(x => x.brand_id === brand.id)); }
    }
    setUploading(false);
  }

  async function deleteDoc(id) {
    await api(`${API}/documents/${id}`, { method:'DELETE' });
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  async function autoLinkStores() {
    setAutoLinking(true);
    setAutoLinkResult(null);
    const r = await api(`${API}/brands/${brand.id}/auto-link-stores`, { method:'POST' });
    if (r.ok) {
      const d = await r.json();
      setAutoLinkResult(d);
      // Recarrega docs e stats
      const [rd, rs, rst] = await Promise.all([
        api(`${API}/documents`),
        api(`${API}/brands/${brand.id}/stats`),
        api(`${API}/stores?brand_id=${brand.id}`),
      ]);
      if (rd.ok)  { const data = await rd.json();  setDocs((data.documents||[]).filter(x => x.brand_id === brand.id)); }
      if (rs.ok)  { const data = await rs.json();  setStats(data.stats || data); }
      if (rst.ok) { const data = await rst.json(); setStores(data.stores || []); }
    }
    setAutoLinking(false);
  }

  async function createStore(e) {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    setCreatingStore(true);
    const r = await api(`${API}/stores`, {
      method:  'POST',
      headers: { 'Content-Type':'application/json' },
      body:    JSON.stringify({ name: newStoreName.trim().toUpperCase(), brand_id: brand.id }),
    });
    if (r.ok) {
      setNewStoreName('');
      const [rst, rs] = await Promise.all([
        api(`${API}/stores?brand_id=${brand.id}`),
        api(`${API}/brands/${brand.id}/stats`),
      ]);
      if (rst.ok) { const d = await rst.json(); setStores(d.stores || []); }
      if (rs.ok)  { const d = await rs.json();  setStats(d.stats || d); }
    }
    setCreatingStore(false);
  }

  async function deleteStore(storeId) {
    await api(`${API}/stores/${storeId}`, { method:'DELETE' });
    setStores(prev => prev.filter(s => s.id !== storeId));
    // Recarrega docs — store_id pode ter mudado
    const rd = await api(`${API}/documents`);
    if (rd.ok) { const d = await rd.json(); setDocs((d.documents||[]).filter(x => x.brand_id === brand.id)); }
    const rs = await api(`${API}/brands/${brand.id}/stats`);
    if (rs.ok) { const d = await rs.json(); setStats(d.stats || d); }
  }

  // Parse da estrutura de pastas para smart import
  // Nível 1 = loja, Nível 2 = categoria, demais = flat na categoria do nível 2
  function parseSmartFiles(files) {
    const map = {};   // { storeName: { category: File[] } }
    const CATEGORIES_LOWER = CATEGORIES.map(c => c.toLowerCase());

    for (const f of files) {
      if (!VALID_EXT.test(f.name)) continue;
      const parts = (f.webkitRelativePath || f.name).split('/');
      // parts[0] = pasta raiz selecionada (ignorar)
      // parts[1] = loja | arquivo direto na raiz
      // parts[2] = categoria | arquivo direto na loja
      // parts[3+] = arquivo (flat na categoria)

      let storeName, category;

      if (parts.length <= 2) {
        // Arquivo na raiz da pasta selecionada → nível marca
        storeName = '_root';
        category  = 'Outros';
      } else if (parts.length === 3) {
        // pasta/LOJA/arquivo.pdf
        storeName = parts[1].trim().toUpperCase();
        category  = 'Outros';
      } else {
        // pasta/LOJA/CATEGORIA/arquivo.pdf (ou mais profundo)
        storeName = parts[1].trim().toUpperCase();
        const rawCat = parts[2].trim();
        // Tenta casar com categoria existente (case-insensitive)
        const match = CATEGORIES.find(c => c.toLowerCase() === rawCat.toLowerCase())
          || CATEGORIES.find(c => rawCat.toLowerCase().includes(c.toLowerCase()));
        category = match || 'Outros';
      }

      if (!map[storeName]) map[storeName] = {};
      if (!map[storeName][category]) map[storeName][category] = [];
      map[storeName][category].push(f);
    }
    return map;
  }


  if (!brand) return (
    <section className="panel">
      <p className="muted">Nenhuma marca selecionada. <button className="link-btn" onClick={() => onNavigate('grupo')}>Voltar ao Grupo</button></p>
    </section>
  );

  const s = stats || brand.stats || {};

  return (
    <section className="marca-page" style={{ '--brand-color': cfg.color, '--brand-bg': cfg.bg }}>

      {/* ── Hero da Marca ── */}
      <div className="marca-page-hero">
        <button className="marca-page-back" onClick={() => onNavigate('grupo')}>
          <ChevronRight size={14} style={{ transform:'rotate(180deg)' }}/> Grupo Impettus
        </button>
        <div className="marca-page-hero-inner">
          <div className="marca-page-logo-wrap">
            {cfg.logo
              ? <img src={cfg.logo} alt={brand.name} className="marca-page-logo"
                     onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }}/>
              : null}
            <span style={{ display: cfg.logo ? 'none' : 'flex' }}><cfg.Icon size={36} color={cfg.color}/></span>
          </div>
          <div className="marca-page-hero-text">
            <h1 className="marca-page-title">{brand.name}</h1>
            <p className="marca-page-tagline">{cfg.tagline}</p>
          </div>
        </div>
        {/* Mini KPIs */}
        <div className="marca-page-minikpis">
          {[
            { label:'Docs',       value: s.documents    || 0, icon: <FileText size={13}/>    },
            { label:'Usuários',   value: s.users        || 0, icon: <Users size={13}/>       },
            { label:'Lojas',      value: s.stores       || 0, icon: <Store size={13}/>       },
            { label:'Conversas',  value: s.conversations|| 0, icon: <MessageSquare size={13}/>},
            { label:'Chunks',     value: s.chunks       || 0, icon: <Search size={13}/>      },
          ].map(k => (
            <div key={k.label} className="marca-page-minikpi">
              {k.icon}<b>{k.value}</b><span>{k.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="marca-page-tabs">
        {[
          { id:'overview',   label:'Visão Geral',  icon:<LayoutDashboard size={14}/> },
          { id:'documents',  label:'Documentos',   icon:<FileText size={14}/>,        badge: s.documents || docs.length },
          { id:'stores',     label:'Lojas',        icon:<Store size={14}/>,           badge: s.stores    || stores.length },
          { id:'users',      label:'Usuários',     icon:<Users size={14}/>,           badge: users.length },
          { id:'faq',        label:'FAQ',          icon:<HelpCircle size={14}/>,      badge: faqs.length  },
        ].map(t => (
          <button key={t.id} className={`marca-tab-btn${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
            {t.badge > 0 && <b className="marca-tab-badge">{t.badge}</b>}
          </button>
        ))}
      </div>

      {/* ── Conteúdo das Abas ── */}
      <div className="marca-page-content">

        {/* Visão Geral */}
        {tab === 'overview' && (
          <div className="marca-overview">
            <div className="marca-overview-grid">
              {[
                { label:'Documentos na base',   value: s.documents    ||0, color:'#a78bfa', icon:<FileText size={22}/>     },
                { label:'Usuários ativos',       value: s.users        ||0, color:'#60a5fa', icon:<Users size={22}/>        },
                { label:'Lojas',                 value: s.stores       ||0, color:'#35d07f', icon:<Store size={22}/>        },
                { label:'Conversas com a IA',    value: s.conversations||0, color:'#f87171', icon:<MessageSquare size={22}/>},
                { label:'Chunks indexados',      value: s.chunks       ||0, color:'#fbbf24', icon:<Search size={22}/>       },
              ].map(k => (
                <div key={k.label} className="marca-overview-card" style={{ '--ov-color': k.color }}>
                  <div className="marca-overview-icon">{k.icon}</div>
                  <b className="marca-overview-val">{k.value.toLocaleString('pt-BR')}</b>
                  <span className="marca-overview-label">{k.label}</span>
                </div>
              ))}
            </div>
            <div className="marca-overview-actions">
              <button className="marca-ov-btn" onClick={() => setTab('documents')}>
                <Upload size={14}/> Enviar documento
              </button>
              <button className="marca-ov-btn secondary" onClick={() => setTab('users')}>
                <Users size={14}/> Gerenciar usuários
              </button>
              <button className="marca-ov-btn secondary" onClick={() => onNavigate('chat')}>
                <MessageSquare size={14}/> Conversar com a IA
              </button>
            </div>
          </div>
        )}

        {/* Documentos */}
        {tab === 'documents' && (
          <div className="marca-tab-section">
            <div className="panel-header" style={{ marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15 }}><FileText size={15}/> Documentos — {brand.name}</h3>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn-add" onClick={() => { setShowUpload(s => !s); setShowFolder(false); setShowSmart(false); }}>
                  <Plus size={14}/> Enviar arquivo
                </button>
                <button className="btn-add" style={{ background:'var(--surface2)' }}
                  onClick={() => { setShowFolder(s => !s); setShowUpload(false); setShowSmart(false); }}>
                  <Folder size={14}/> Importar pasta
                </button>
                <button className="btn-add" style={{ background:'linear-gradient(135deg,#1e3a5f,#2a4f7a)' }}
                  onClick={() => { setShowSmart(s => !s); setShowUpload(false); setShowFolder(false); setSmartPreview(null); setSmartFiles([]); }}>
                  <Store size={14}/> Importar rede de lojas
                </button>
                {stores.length > 0 && (
                  <button className="btn-add" style={{ background:'linear-gradient(135deg,#14532d,#166534)' }}
                    disabled={autoLinking}
                    onClick={autoLinkStores}
                    title="Vincula documentos sem loja buscando o nome da loja no nome do arquivo">
                    <Zap size={14}/> {autoLinking ? 'Vinculando…' : 'Vincular lojas'}
                  </button>
                )}
              </div>
            </div>
            {autoLinkResult && (
              <div style={{ background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.3)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>✓ <b>{autoLinkResult.linked}</b> doc(s) vinculado(s) · <b>{autoLinkResult.skipped}</b> sem correspondência</span>
                <button className="link-btn" style={{ fontSize:12 }} onClick={() => setAutoLinkResult(null)}>×</button>
              </div>
            )}

            {/* Upload de arquivo único */}
            {showUpload && (
              <form className="panel-form" onSubmit={uploadDoc} style={{ marginBottom:20 }}>
                <input placeholder="Título (opcional)" value={uploadForm.title}
                  onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}/>
                <select value={uploadForm.category}
                  onChange={e => setUploadForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input type="file" accept=".pdf,.txt,.docx,.xlsx,.xlsm,.csv,.md"
                  onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] }))} required/>
                <div style={{ display:'flex', gap:10 }}>
                  <button type="submit" disabled={uploading}>{uploading ? 'Enviando…' : 'Enviar'}</button>
                  <button type="button" onClick={() => setShowUpload(false)}>Cancelar</button>
                </div>
              </form>
            )}

            {/* Importar rede de lojas (smart import) */}
            {showSmart && (
              <div className="panel folder-import" style={{ marginBottom:20 }}>
                <div className="panel-header" style={{ marginBottom:10 }}>
                  <h4 style={{ margin:0, fontSize:14 }}><Store size={14}/> Importar rede de lojas</h4>
                  {smartPreview && (
                    <span className="import-count">
                      {Object.keys(smartPreview).filter(k=>k!=='_root').length} loja(s) detectadas
                    </span>
                  )}
                </div>
                <p className="muted" style={{ margin:'0 0 12px', fontSize:13 }}>
                  Selecione a pasta da marca. Subpastas de nível 1 = lojas, nível 2 = categorias.
                </p>

                {!smartPreview ? (
                  <div className="folder-row">
                    <label className="folder-label" style={{ flex:1 }}>
                      <Folder size={15}/>
                      {smartFiles.length ? `${smartFiles.length} arquivo(s) selecionados` : 'Selecionar pasta da marca…'}
                      <input type="file" style={{ display:'none' }}
                        {...{ webkitdirectory:'' }} multiple
                        onChange={e => {
                          const files = Array.from(e.target.files || []);
                          setSmartFiles(files);
                          if (files.length) setSmartPreview(parseSmartFiles(files));
                        }}/>
                    </label>
                    <button className="btn-perms" onClick={() => { setShowSmart(false); setSmartFiles([]); setSmartPreview(null); }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Preview table */}
                    <div className="smart-preview-table">
                      <div className="smart-preview-header">
                        <span>Loja</span><span>Categorias</span><span>Arquivos</span>
                      </div>
                      {Object.entries(smartPreview).map(([store, cats]) => {
                        const total = Object.values(cats).reduce((a,f)=>a+f.filter(x=>VALID_EXT.test(x.name)).length,0);
                        return (
                          <div key={store} className="smart-preview-row">
                            <span className="smart-store-name">
                              {store === '_root' ? <em style={{color:'var(--muted)'}}>nível marca</em> : store}
                            </span>
                            <span className="smart-cats">
                              {Object.entries(cats).map(([cat,files])=>(
                                <span key={cat} className="smart-cat-chip">
                                  {cat} <b>{files.filter(f=>VALID_EXT.test(f.name)).length}</b>
                                </span>
                              ))}
                            </span>
                            <span className="smart-file-count">{total}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:'flex', gap:10, marginTop:12 }}>
                      <button className="btn-add"
                        disabled={bgImport?.active}
                        onClick={() => {
                          onStartSmartImport(brand, smartPreview);
                          setSmartFiles([]); setSmartPreview(null); setShowSmart(false);
                        }}>
                        <Upload size={14}/> Confirmar e importar
                      </button>
                      <button className="btn-perms" onClick={() => { setSmartFiles([]); setSmartPreview(null); }}>
                        ← Voltar
                      </button>
                      <button className="btn-perms" onClick={() => { setShowSmart(false); setSmartFiles([]); setSmartPreview(null); }}>
                        Cancelar
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Progresso de importação em background para esta marca */}
            {bgImport && (
              <div className="import-progress" style={{ marginBottom:16 }}>
                <div className="import-bar"
                  style={{ width:`${bgImport.total ? (bgImport.done/bgImport.total)*100 : 0}%`,
                           background: bgImport.active ? undefined : 'var(--green)' }}/>
                <span style={{ fontSize:12, color: bgImport.active ? 'var(--muted)' : '#34d399' }}>
                  {bgImport.active
                    ? `Importando ${bgImport.done}/${bgImport.total} — ${bgImport.current}`
                    : `✓ Importação concluída! (${bgImport.total} arquivo(s))`}
                </span>
              </div>
            )}

            {/* Importar pasta */}
            {showFolder && (
              <div className="panel folder-import" style={{ marginBottom:20 }}>
                <div className="panel-header" style={{ marginBottom:10 }}>
                  <h4 style={{ margin:0, fontSize:14 }}><Folder size={14}/> Importar pasta</h4>
                  {folderFiles.length > 0 && (
                    <span className="import-count">
                      {folderFiles.filter(f => VALID_EXT.test(f.name)).length} arquivo(s) válido(s)
                    </span>
                  )}
                </div>
                <p className="muted" style={{ margin:'0 0 12px', fontSize:13 }}>
                  PDF, DOCX, XLSX, XLSM, CSV, TXT, MD — todos vinculados a <strong>{brand.name}</strong>
                </p>
                <div className="folder-row">
                  <select value={folderCat} onChange={e => setFolderCat(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  <label className="folder-label">
                    <Folder size={15}/>
                    {folderFiles.length ? `${folderFiles.length} arquivo(s) encontrados` : 'Selecionar pasta…'}
                    <input type="file" style={{ display:'none' }}
                      {...{ webkitdirectory:'' }} multiple
                      onChange={e => setFolderFiles(Array.from(e.target.files || []))}/>
                  </label>
                  <button className="btn-add"
                    onClick={() => {
                      onStartImport(brand, folderFiles, folderCat);
                      setFolderFiles([]);
                      setShowFolder(false);
                    }}
                    disabled={!folderFiles.filter(f => VALID_EXT.test(f.name)).length || bgImport?.active}>
                    <Upload size={15}/> Importar tudo
                  </button>
                  <button className="btn-perms" onClick={() => { setShowFolder(false); setFolderFiles([]); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {docs.length === 0
              ? <p className="muted" style={{ textAlign:'center', padding:'32px 0' }}>Nenhum documento ainda. Envie o primeiro!</p>
              : (
                <div className="doc-grid">
                  {docs.map(doc => {
                    const storeName = doc.store_id
                      ? (stores.find(st => st.id === doc.store_id)?.name || 'Loja')
                      : null;
                    return (
                      <article className="doc-card" key={doc.id}>
                        <FileText style={{ color:'var(--orange)' }}/>
                        {/* Chip de categoria — posição absoluta, canto direito */}
                        <span className="tag">{doc.category}</span>
                        {/* Chip de loja — posição normal, abaixo do ícone */}
                        {storeName
                          ? <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'rgba(53,208,127,.15)', color:'#35d07f', border:'1px solid rgba(53,208,127,.3)', borderRadius:999, padding:'2px 8px', fontSize:11, marginTop:6 }}>
                              <Store size={9}/> {storeName}
                            </span>
                          : <span style={{ display:'inline-block', background:'rgba(239,68,68,.08)', color:'#f87171', border:'1px solid rgba(239,68,68,.2)', borderRadius:999, padding:'2px 8px', fontSize:10, marginTop:6 }}>
                              sem loja
                            </span>
                        }
                        <h3 style={{ fontSize:14, marginTop:6 }}>{doc.title || doc.name}</h3>
                        <small style={{ color:'var(--muted)' }}>{new Date(doc.created_at||doc.timestamp).toLocaleString('pt-BR')}</small>
                        <button className="danger" style={{ marginTop:10 }} onClick={() => deleteDoc(doc.id)}>
                          <Trash2 size={13}/> Remover
                        </button>
                      </article>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Lojas */}
        {tab === 'stores' && (
          <div className="marca-tab-section">
            <div className="panel-header" style={{ marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15 }}><Store size={15}/> Lojas — {brand.name}</h3>
            </div>

            {/* Formulário de criação */}
            <form className="panel-form" onSubmit={createStore} style={{ marginBottom:20 }}>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  placeholder="Nome da loja (ex: MARANGUAPE)"
                  value={newStoreName}
                  onChange={e => setNewStoreName(e.target.value.toUpperCase())}
                  style={{ flex:1, textTransform:'uppercase' }}
                  required
                />
                <button type="submit" disabled={creatingStore || !newStoreName.trim()}>
                  {creatingStore ? 'Criando…' : <><Plus size={14}/> Criar</>}
                </button>
              </div>
            </form>

            {/* Botão vincular automático */}
            <div style={{ marginBottom:16, display:'flex', gap:10, alignItems:'center' }}>
              <button className="btn-add" style={{ background:'linear-gradient(135deg,#14532d,#166534)' }}
                disabled={autoLinking || stores.length === 0}
                onClick={autoLinkStores}
                title="Vincula documentos sem loja buscando o nome da loja no nome do arquivo">
                <Zap size={14}/> {autoLinking ? 'Vinculando…' : 'Vincular lojas automaticamente'}
              </button>
              <span className="muted" style={{ fontSize:12 }}>
                Compara o nome de cada loja com os nomes dos documentos sem loja associada
              </span>
            </div>

            {autoLinkResult && (
              <div style={{ background:'rgba(52,211,153,.12)', border:'1px solid rgba(52,211,153,.3)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13 }}>
                <b>✓ {autoLinkResult.linked}</b> doc(s) vinculado(s) &nbsp;·&nbsp;
                <b>{autoLinkResult.skipped}</b> sem correspondência (de {autoLinkResult.total_unlinked} sem loja)
                {autoLinkResult.details?.length > 0 && (
                  <details style={{ marginTop:8 }}>
                    <summary style={{ cursor:'pointer', fontSize:12 }}>Ver detalhes</summary>
                    <ul style={{ margin:'6px 0 0', padding:'0 0 0 16px', fontSize:12, color:'var(--muted)' }}>
                      {autoLinkResult.details.slice(0, 20).map((d, i) => (
                        <li key={i}>{d.doc_name} → <b style={{ color:'#35d07f' }}>{d.store_name}</b></li>
                      ))}
                      {autoLinkResult.details.length > 20 && <li>…e mais {autoLinkResult.details.length - 20}</li>}
                    </ul>
                  </details>
                )}
              </div>
            )}

            {/* Lista de lojas */}
            {stores.length === 0
              ? <p className="muted" style={{ textAlign:'center', padding:'32px 0' }}>Nenhuma loja cadastrada ainda.</p>
              : (
                <div className="doc-grid">
                  {stores.map(st => {
                    const docCount = docs.filter(d => d.store_id === st.id).length;
                    return (
                      <article className="doc-card" key={st.id}>
                        <Store style={{ color:'#35d07f' }}/>
                        <h3 style={{ fontSize:14, marginTop:8 }}>{st.name}</h3>
                        <span className="tag" style={{ marginTop:4 }}>{docCount} doc(s) vinculado(s)</span>
                        <small style={{ color:'var(--muted)', display:'block', marginTop:4 }}>
                          {new Date(st.created_at).toLocaleDateString('pt-BR')}
                        </small>
                        <button className="danger" style={{ marginTop:10 }} onClick={() => deleteStore(st.id)}>
                          <Trash2 size={13}/> Remover
                        </button>
                      </article>
                    );
                  })}
                </div>
              )
            }
          </div>
        )}

        {/* Usuários */}
        {tab === 'users' && (
          <div className="marca-tab-section">
            <div className="panel-header" style={{ marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15 }}><Users size={15}/> Usuários — {brand.name}</h3>
              <button className="btn-add" onClick={() => onNavigate('users')}><Plus size={14}/> Adicionar usuário</button>
            </div>
            {users.length === 0
              ? <p className="muted" style={{ textAlign:'center', padding:'32px 0' }}>Nenhum usuário vinculado a esta marca.</p>
              : (
                <div className="doc-grid">
                  {users.map(u => (
                    <article className="doc-card" key={u.id}>
                      <div className="avatar" style={{ marginBottom:10 }}>{u.name[0].toUpperCase()}</div>
                      <span className="tag">{u.role}</span>
                      <h3 style={{ fontSize:14, marginTop:6 }}>{u.name}</h3>
                      <p style={{ color:'var(--muted)', fontSize:12 }}>{u.email}</p>
                      <small style={{ color:'var(--muted)' }}>{new Date(u.created_at).toLocaleDateString('pt-BR')}</small>
                    </article>
                  ))}
                </div>
              )
            }
          </div>
        )}

        {/* FAQ */}
        {tab === 'faq' && (
          <div className="marca-tab-section">
            <div className="panel-header" style={{ marginBottom:16 }}>
              <h3 style={{ margin:0, fontSize:15 }}><HelpCircle size={15}/> FAQ — {brand.name}</h3>
              <button className="btn-add" onClick={() => onNavigate('faq')}><Plus size={14}/> Adicionar FAQ</button>
            </div>
            {faqs.length === 0
              ? <p className="muted" style={{ textAlign:'center', padding:'32px 0' }}>Nenhuma pergunta frequente cadastrada.</p>
              : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {faqs.map(f => (
                    <div key={f.id} className="panel" style={{ padding:'16px 20px', gap:8 }}>
                      <p style={{ margin:0, fontWeight:700, color:'#f8fafc', fontSize:14 }}>{f.question}</p>
                      <p style={{ margin:'6px 0 0', color:'var(--muted)', fontSize:13 }}>{f.answer}</p>
                    </div>
                  ))}
                </div>
              )
            }
          </div>
        )}

      </div>
    </section>
  );
}


// ── Página: Marcas do Grupo Impettus ─────────────────────────────────────────
function MarcasPage({ onNavigate }) {
  const [brands,  setBrands]  = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api(`${API}/brands/stats`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBrands(d.brands || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Totais consolidados do Grupo
  const totals = brands.reduce((acc, b) => {
    const s = b.stats || {};
    acc.documents    += s.documents    || 0;
    acc.users        += s.users        || 0;
    acc.stores       += s.stores       || 0;
    acc.conversations+= s.conversations|| 0;
    return acc;
  }, { documents: 0, users: 0, stores: 0, conversations: 0 });

  return (
    <div>
      {/* ── Header ── */}
      <div className="marcas-header">
        <div>
          <h2 className="marcas-title">
            <Building2 size={24} color="var(--orange)"/> Grupo Impettus
          </h2>
          <p className="marcas-subtitle">Holding de Bares e Butecos · 5 marcas</p>
        </div>
        <div className="marcas-totals">
          {[
            { Icon: FileText,      label: 'Documentos',  val: totals.documents },
            { Icon: Users,         label: 'Usuários',    val: totals.users },
            { Icon: Store,         label: 'Lojas',       val: totals.stores },
            { Icon: MessageSquare, label: 'Conversas',   val: totals.conversations },
          ].map(({ Icon, label, val }) => (
            <div key={label} className="marcas-total-chip">
              <Icon size={13}/>
              <b>{val}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--muted)', padding: '20px 0' }}>Carregando marcas…</p>}

      {/* ── Grid de Marcas ── */}
      <div className="marcas-grid">
        {brands.map(brand => {
          const cfg  = BRAND_CFG[brand.name] || { color: '#9fb0c8', bg: 'rgba(159,176,200,.12)', Icon: Building2, tagline: '' };
          const Icon = cfg.Icon;
          const s    = brand.stats || {};
          return (
            <div key={brand.id} className="marca-card"
                 style={{ '--brand-color': cfg.color, '--brand-bg': cfg.bg }}>

              {/* Card Principal */}
              <div className="marca-card-top">
                <div className="marca-icon-wrap">
                  {cfg.logo
                    ? <img src={cfg.logo} alt={brand.name} className="marca-logo-img"
                           onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextSibling.style.display='flex'; }}/>
                    : null}
                  <span style={{ display: cfg.logo ? 'none' : 'flex' }}>
                    <Icon size={28} color={cfg.color}/>
                  </span>
                </div>
                <div className="marca-info">
                  <h3 className="marca-name">{brand.name}</h3>
                  <p className="marca-tagline">{cfg.tagline}</p>
                </div>
                <span className="marca-slug">/{brand.slug}</span>
              </div>

              {/* Stats */}
              <div className="marca-stats">
                <div className="marca-stat">
                  <FileText size={13}/>
                  <b>{s.documents || 0}</b>
                  <span>docs</span>
                </div>
                <div className="marca-stat">
                  <Users size={13}/>
                  <b>{s.users || 0}</b>
                  <span>usuários</span>
                </div>
                <div className="marca-stat">
                  <Store size={13}/>
                  <b>{s.stores || 0}</b>
                  <span>lojas</span>
                </div>
                <div className="marca-stat">
                  <MessageSquare size={13}/>
                  <b>{s.conversations || 0}</b>
                  <span>conversas</span>
                </div>
              </div>

              {/* Barra de atividade */}
              <div className="marca-activity-bar">
                <div
                  className="marca-activity-fill"
                  style={{ width: `${Math.min(100, (s.documents || 0) * 10)}%` }}
                />
                <span className="marca-activity-label">
                  {s.documents > 0 ? `${s.documents} documento${s.documents > 1 ? 's' : ''} na base` : 'Base de conhecimento vazia'}
                </span>
              </div>

              {/* Ações */}
              <div className="marca-actions">
                <button className="marca-btn-primary"
                  onClick={() => onNavigate('marca', brand, 'documents')}
                  title="Ir para documentos desta marca">
                  <FileText size={13}/> Documentos
                </button>
                <button className="marca-btn-secondary"
                  onClick={() => onNavigate('marca', brand, 'users')}
                  title="Gerenciar usuários desta marca">
                  <Users size={13}/> Usuários
                </button>
                <button className="marca-btn-toggle"
                  onClick={() => onNavigate('marca', brand, 'overview')}
                  title="Abrir portal da marca">
                  Detalhes
                </button>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email,    setEmail]    = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error((await r.json()).detail || 'Credenciais inválidas');
      const data = await r.json();
      onLogin(data.access_token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <Zap size={58} fill="#ff9f1c" stroke="#ff7a18" strokeWidth={0.5} className="logo-bolt"/>
          <span className="logo-name">IMPETTUS</span>
          <span className="logo-tag"><em>be</em> unstoppable</span>
        </div>
        <p>Plataforma corporativa multidepartamental</p>
        <form onSubmit={submit}>
          <label>Usuário</label>
          <input value={email}    onChange={e => setEmail(e.target.value)} />
          <label>Senha</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button disabled={loading}><Lock size={18}/> {loading ? 'Entrando…' : 'Entrar'}</button>
        </form>
        {error && <div className="error">{error}</div>}
        <div className="hint"><b>Usuário inicial:</b> admin<br/><b>Senha:</b> Admin@123</div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ stats, setPage }) {
  const [activity, setActivity] = useState([]);

  useEffect(() => {
    api(`${API}/activity`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setActivity(d.activity || []); })
      .catch(() => {});
  }, []);

  const kpis = [
    { label: 'Documentos',    value: stats?.documents    ?? 0, delta: '+7 este mês',  Icon: FileText     },
    { label: 'Categorias',    value: stats?.categories   ?? 0, delta: '+2 este mês',  Icon: Folder       },
    { label: 'Conversas',     value: stats?.conversations ?? 0, delta: '+23 este mês', Icon: MessageSquare },
    { label: 'Fontes citadas', value: stats?.sources      ?? 0, delta: '+61 este mês', Icon: Quote        },
  ];

  return (
    <>
      {/* KPIs */}
      <section className="kpis">
        {kpis.map(({ label, value, delta, Icon }) => (
          <div className="kpi" key={label}>
            <div>
              <span>{label}</span>
              <strong>{value}</strong>
              <small className="delta">{delta}</small>
            </div>
            <i><Icon size={28}/></i>
          </div>
        ))}
      </section>

      {/* Chat (esquerda) + Fontes & Atividade (direita) */}
      <section className="grid-2">
        <Chat compact />
        <div className="right-col">
          <div className="panel">
            <div className="panel-header">
              <h2 style={{ margin: 0 }}><Quote/> Fontes citadas recentemente</h2>
              <button className="ver-todas" onClick={() => setPage('sources')}>Ver todas</button>
            </div>
            <RecentSources />
          </div>
          <div className="panel">
            <h2><Activity/> Atividade recente</h2>
            <ActivityFeed items={activity} />
          </div>
        </div>
      </section>

      {/* Documentos por categoria — largura total */}
      <section className="panel cat-section">
        <div className="panel-header">
          <h2 style={{ margin: 0 }}><Folder/> Documentos por categoria</h2>
          <button className="ver-todas" onClick={() => setPage('categories')}>Ver todas</button>
        </div>
        <CategoryStrip />
      </section>
    </>
  );
}

function ActivityFeed({ items }) {
  if (!items.length) return <p className="muted">Nenhuma atividade registrada.</p>;
  const icons = { document: FileText, auth: UserCheck, user: Users };
  return (
    <div className="activity-list">
      {items.slice(0, 8).map(item => {
        const Icon = icons[item.type] || Activity;
        return (
          <div className="activity-row" key={item.id}>
            <i className="act-icon"><Icon size={15}/></i>
            <span className="act-msg">{item.message}</span>
            <small className="act-time">
              {new Date(item.created_at || item.timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </small>
          </div>
        );
      })}
    </div>
  );
}

function RecentSources() {
  const [sources, setSources] = useState([]);
  useEffect(() => {
    api(`${API}/sources`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSources(d.sources || []); }).catch(() => {});
  }, []);
  return (
    <div className="source-list">
      {sources.slice(0, 5).map(s => (
        <div className="source-row" key={s.document_id}>
          <FileText size={18}/>
          <span>{s.document_name}</span>
          <b>{s.chunks}</b>
          <small>trechos</small>
        </div>
      ))}
      {!sources.length && <p className="muted">Nenhuma fonte enviada ainda.</p>}
    </div>
  );
}

function CategoryStrip() {
  const [cats, setCats] = useState([]);
  useEffect(() => {
    api(`${API}/categories`).then(r => r.ok ? r.json() : null).then(d => { if (d) setCats(d.categories || []); }).catch(() => {});
  }, []);
  return (
    <div className="cat-strip">
      {cats.map(c => {
        const cfg = CAT_CFG[c.name] || CAT_CFG['Outros'];
        return (
          <div className="cat-pill" key={c.name}>
            <div className="cat-icon" style={{ background: cfg.bg }}>
              <cfg.Icon size={20} style={{ color: cfg.color }} />
            </div>
            <div className="cat-text">
              <b>{c.name}</b>
              <span>{c.documents} documentos</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function Chat({ compact = false }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Eu sou o Impettus IA. Faça uma pergunta sobre os documentos internos enviados.' },
  ]);
  const [question, setQuestion] = useState('');
  const [loading,  setLoading]  = useState(false);

  async function ask(e) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setMessages(m => [...m, { role: 'user', content: q }]);
    setLoading(true);
    try {
      const r    = await api(`${API}/chat`, { method: 'POST', body: JSON.stringify({ question: q, top_k: 5 }) });
      const data = await r.json();
      setMessages(m => [...m, { role: 'assistant', content: data.answer, sources: data.sources || [] }]);
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Não consegui consultar o backend agora.' }]);
    } finally { setLoading(false); }
  }

  return (
    <section className="chat-panel">
      <div className="panel-title"><Brain/> Conversa com IA</div>
      <div className="chat-box" style={compact ? { height: '420px', minHeight: '280px' } : {}}>
        {messages.map((m, i) => (
          <div className={`msg ${m.role}`} key={i}>
            {m.role === 'assistant' && <Brain size={22} className="msg-avatar"/>}
            <div className="bubble">
              <pre>{m.content}</pre>
              {m.sources?.length > 0 && (
                <div className="sources-box">
                  <b>Fontes ({m.sources.length})</b>
                  {m.sources.map((s, idx) => (
                    <div className="source-cite" key={idx}>
                      <FileText size={14} style={{ color: '#ff7a18', flexShrink: 0 }}/>
                      <span className="source-cite-name">{s.document_name}</span>
                      <span className="source-cite-pg">trecho {Number(s.chunk_index) + 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && <div className="msg assistant"><Brain size={22} className="msg-avatar"/><div className="bubble">Consultando a base interna…</div></div>}
      </div>
      <form className="ask" onSubmit={ask}>
        <input placeholder="Digite sua pergunta…" value={question} onChange={e => setQuestion(e.target.value)}/>
        <button><Send size={18}/></button>
      </form>
      <small className="disclaimer">Respostas geradas com base nos documentos internos do Grupo Impettus.</small>
    </section>
  );
}

// ── Documents ─────────────────────────────────────────────────────────────────
function Documents({ onChange }) {
  const [docs,           setDocs]           = useState([]);
  const [file,           setFile]           = useState(null);
  const [category,       setCategory]       = useState('Operacional');
  const [allowedRoles,   setAllowedRoles]   = useState([]);
  const [notice,         setNotice]         = useState('');
  const [folderFiles,    setFolderFiles]    = useState([]);
  const [folderCat,      setFolderCat]      = useState('Operacional');
  const [folderRoles,    setFolderRoles]    = useState([]);
  const [importing,      setImporting]      = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, current: '' });
  const [editPerms,      setEditPerms]      = useState(null); // doc id being edited

  async function load() {
    const r = await api(`${API}/documents`);
    const d = await r.json();
    setDocs(d.documents || []);
  }

  useEffect(() => { load(); }, []);

  function toggleRole(role, list, setter) {
    setter(list.includes(role) ? list.filter(r => r !== role) : [...list, role]);
  }

  async function upload() {
    if (!file) return;
    setNotice('Processando documento…');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('category', category);
    fd.append('allowed_roles', allowedRoles.join(','));
    const r = await api(`${API}/documents/upload`, { method: 'POST', body: fd });
    if (r.ok) {
      setFile(null);
      setAllowedRoles([]);
      setNotice('Documento processado com sucesso.');
      await load();
      onChange?.();
    } else {
      const e = await r.json();
      setNotice(e.detail || 'Erro no upload');
    }
  }

  async function savePerms(docId, roles) {
    const r = await api(`${API}/documents/${docId}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify({ allowed_roles: roles }),
    });
    if (r.ok) { setEditPerms(null); await load(); }
  }

  async function remove(id) {
    await api(`${API}/documents/${id}`, { method: 'DELETE' });
    await load();
    onChange?.();
  }

  const VALID_EXT = /\.(pdf|docx|xlsx|xlsm|csv|txt|md)$/i;

  async function importFolder() {
    const valid = folderFiles.filter(f => VALID_EXT.test(f.name));
    if (!valid.length || importing) return;
    setImporting(true);
    setNotice('');
    setImportProgress({ done: 0, total: valid.length, current: '' });
    let done = 0;
    for (const f of valid) {
      setImportProgress(p => ({ ...p, current: f.name }));
      try {
        const fd = new FormData();
        fd.append('file', f);
        fd.append('category', folderCat);
        fd.append('allowed_roles', folderRoles.join(','));
        await api(`${API}/documents/upload`, { method: 'POST', body: fd });
      } catch {}
      done++;
      setImportProgress(p => ({ ...p, done }));
    }
    setFolderFiles([]);
    setImporting(false);
    setNotice(`${done} documento(s) importado(s) com sucesso.`);
    await load();
    onChange?.();
  }

  const validFolderCount = folderFiles.filter(f => VALID_EXT.test(f.name)).length;

  return (
    <section>
      <div className="panel upload">
        <div>
          <h2><Upload/> Enviar documento</h2>
          <p>PDF, DOCX, XLSX, XLSM, CSV, TXT e MD.</p>
        </div>
        <select value={category} onChange={e => setCategory(e.target.value)}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <input type="file" onChange={e => setFile(e.target.files?.[0])}/>
        <button onClick={upload}>Enviar</button>
      </div>
      {/* Restrição de acesso — upload individual */}
      <div className="perm-row">
        <ShieldCheck size={14} style={{ color: '#9fb0c8', flexShrink: 0 }}/>
        <span className="perm-label">Restringir acesso:</span>
        {ROLES.filter(r => r !== 'Admin').map(r => (
          <label key={r} className={`role-chip${allowedRoles.includes(r) ? ' on' : ''}`}>
            <input type="checkbox" style={{ display: 'none' }} checked={allowedRoles.includes(r)} onChange={() => toggleRole(r, allowedRoles, setAllowedRoles)}/>
            {r}
          </label>
        ))}
        {allowedRoles.length > 0 && (
          <button className="perm-clear" onClick={() => setAllowedRoles([])}>Limpar</button>
        )}
        <span className="perm-hint">{allowedRoles.length === 0 ? 'Público (todos os perfis)' : `Visível para: ${allowedRoles.join(', ')}`}</span>
      </div>

      {/* Importar pasta */}
      <div className="panel folder-import">
        <div className="panel-header">
          <h2 style={{ margin: 0 }}><Folder/> Importar pasta</h2>
          {validFolderCount > 0 && (
            <span className="import-count">{validFolderCount} arquivo(s) válido(s)</span>
          )}
        </div>
        <p className="muted" style={{ margin: '0 0 14px' }}>
          Selecione uma pasta para importar múltiplos documentos de uma só vez. Aceitos: PDF, DOCX, XLSX, CSV, TXT, MD.
        </p>
        <div className="folder-row">
          <select value={folderCat} onChange={e => setFolderCat(e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <label className="folder-label">
            <Folder size={15}/>
            {folderFiles.length
              ? `${folderFiles.length} arquivo(s) encontrados`
              : 'Selecionar pasta…'}
            <input
              type="file"
              style={{ display: 'none' }}
              {...{ webkitdirectory: '' }}
              multiple
              onChange={e => setFolderFiles(Array.from(e.target.files || []))}
            />
          </label>
          <button
            className="btn-add"
            onClick={importFolder}
            disabled={!validFolderCount || importing}
          >
            <Upload size={15}/>
            {importing
              ? `Importando ${importProgress.done}/${importProgress.total}…`
              : 'Importar tudo'}
          </button>
        </div>
        {/* Restrição de acesso — importação de pasta */}
        <div className="perm-row" style={{ marginTop: 10 }}>
          <ShieldCheck size={14} style={{ color: '#9fb0c8', flexShrink: 0 }}/>
          <span className="perm-label">Restringir:</span>
          {ROLES.filter(r => r !== 'Admin').map(r => (
            <label key={r} className={`role-chip${folderRoles.includes(r) ? ' on' : ''}`}>
              <input type="checkbox" style={{ display: 'none' }} checked={folderRoles.includes(r)} onChange={() => toggleRole(r, folderRoles, setFolderRoles)}/>
              {r}
            </label>
          ))}
          <span className="perm-hint">{folderRoles.length === 0 ? 'Público' : folderRoles.join(', ')}</span>
        </div>
        {importing && (
          <div className="import-progress">
            <div
              className="import-bar"
              style={{ width: `${importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%` }}
            />
            <span>{importProgress.current}</span>
          </div>
        )}
      </div>

      {notice && <div className="notice">{notice}</div>}
      <div className="doc-grid">
        {docs.map(d => {
          const restricted = d.allowed_roles?.length > 0;
          return (
            <article className="doc-card" key={d.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <FileText style={{ color: 'var(--orange)' }}/>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {restricted && <Lock size={13} style={{ color: '#fb923c' }}/>}
                  {d.embedded && <span className="embed-badge" title="Indexado com embedding semântico">IA</span>}
                </div>
              </div>
              <span className="tag">{d.category || 'Outros'}</span>
              <h3>{d.name}</h3>
              <p>{d.chunks} trechos indexados</p>
              {restricted && (
                <p style={{ fontSize: 11, color: '#fb923c', margin: '4px 0' }}>
                  <Lock size={10}/> {d.allowed_roles.join(', ')}
                </p>
              )}
              <small>{new Date(d.created_at).toLocaleString('pt-BR')}</small>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn-perms" onClick={() => setEditPerms(editPerms === d.id ? null : d.id)}>
                  <ShieldCheck size={13}/> Acesso
                </button>
                <button className="danger" style={{ flex: 1 }} onClick={() => remove(d.id)}><Trash2 size={14}/> Remover</button>
              </div>
              {editPerms === d.id && (
                <PermEditor
                  initial={d.allowed_roles ?? []}
                  onSave={roles => savePerms(d.id, roles)}
                  onCancel={() => setEditPerms(null)}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── PermEditor — editor inline de permissões por perfil ──────────────────────
function PermEditor({ initial, onSave, onCancel }) {
  const [selected, setSelected] = useState(initial);
  function toggle(r) {
    setSelected(s => s.includes(r) ? s.filter(x => x !== r) : [...s, r]);
  }
  return (
    <div className="perm-editor">
      <p className="perm-editor-title"><ShieldCheck size={13}/> Definir acesso por perfil</p>
      <div className="perm-editor-roles">
        {ROLES.filter(r => r !== 'Admin').map(r => (
          <label key={r} className={`role-chip${selected.includes(r) ? ' on' : ''}`}>
            <input type="checkbox" style={{ display: 'none' }} checked={selected.includes(r)} onChange={() => toggle(r)}/>
            {r}
          </label>
        ))}
      </div>
      <p className="perm-hint" style={{ marginTop: 6 }}>
        {selected.length === 0 ? '🔓 Público — todos os perfis têm acesso' : `🔒 Visível para: ${selected.join(', ')}`}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button className="btn-add" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onSave(selected)}>Salvar</button>
        <button className="btn-perms" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────
function Categories() {
  return (
    <section className="panel">
      <h2><Folder/> Categorias por documento</h2>
      <p className="muted">Use as categorias para separar contratos, financeiro, fornecedores, operação, RH, marketing, TI e franqueados.</p>
      <CategoryStrip />
    </section>
  );
}

// ── Sources ───────────────────────────────────────────────────────────────────
const SOURCES_PAGE_SIZE = 50;
function Sources() {
  const [sources, setSources] = useState([]);
  const [search,  setSearch]  = useState('');
  const [page,    setPage]    = useState(1);
  useEffect(() => {
    api(`${API}/sources`).then(r => r.ok ? r.json() : null).then(d => { if (d) setSources(d.sources || []); }).catch(() => {});
  }, []);

  const filtered = sources.filter(s =>
    !search || s.document_name?.toLowerCase().includes(search.toLowerCase()) || s.category?.toLowerCase().includes(search.toLowerCase())
  );
  const visible  = filtered.slice(0, page * SOURCES_PAGE_SIZE);
  const hasMore  = visible.length < filtered.length;

  return (
    <section className="panel">
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:12 }}>
        <h2 style={{ margin:0 }}><Quote/> Fontes citadas</h2>
        <span className="muted" style={{ fontSize:13 }}>{filtered.length} de {sources.length} documentos indexados</span>
      </div>
      <input
        className="search-input"
        placeholder="Filtrar por nome ou categoria..."
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1); }}
        style={{ width:'100%', marginBottom:16 }}
      />
      <div className="sources-page">
        {visible.map(s => (
          <article className="source-card" key={s.document_id}>
            <div className="source-head">
              <FileText/>
              <div>
                <h3>{s.document_name}</h3>
                <span>{s.category}{s.embedded ? ' · indexado' : ' · pendente'}</span>
              </div>
            </div>
          </article>
        ))}
        {!sources.length && <p className="muted">Nenhuma fonte enviada ainda.</p>}
      </div>
      {hasMore && (
        <button className="btn-outline" style={{ marginTop:16, width:'100%' }} onClick={() => setPage(p => p + 1)}>
          Carregar mais ({filtered.length - visible.length} restantes)
        </button>
      )}
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
const FAQ_CATS = ['Geral', 'Operacional', 'Financeiro', 'RH', 'TI', 'Franqueados'];

function Faq({ user }) {
  const [faqs,           setFaqs]           = useState([]);
  const [form,           setForm]           = useState({ question: '', answer: '', category: 'Geral' });
  const [showForm,       setShowForm]       = useState(false);
  const [activeCat,      setActiveCat]      = useState('Todas');
  const isAdmin = user?.role === 'Admin';

  async function load() {
    const r = await api(`${API}/faq`);
    if (r.ok) { const d = await r.json(); setFaqs(d.faqs || []); }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const r = await api(`${API}/faq`, { method: 'POST', body: JSON.stringify(form) });
    if (r.ok) { setForm({ question: '', answer: '', category: 'Geral' }); setShowForm(false); await load(); }
  }

  async function remove(id) {
    await api(`${API}/faq/${id}`, { method: 'DELETE' });
    await load();
  }

  const countFor  = cat => faqs.filter(f => f.category === cat).length;
  const filtered  = activeCat === 'Todas' ? faqs : faqs.filter(f => f.category === activeCat);
  const usedCats  = FAQ_CATS.filter(c => countFor(c) > 0);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 style={{ margin: 0 }}><HelpCircle/> Perguntas frequentes</h2>
        {isAdmin && <button className="btn-add" onClick={() => setShowForm(!showForm)}><Plus size={16}/> Nova pergunta</button>}
      </div>

      {/* Filtro por categoria */}
      <div className="faq-cats">
        <button
          className={`faq-cat-btn${activeCat === 'Todas' ? ' active' : ''}`}
          onClick={() => setActiveCat('Todas')}
        >
          Todas <span className="faq-cat-count">{faqs.length}</span>
        </button>
        {(faqs.length ? usedCats : FAQ_CATS).map(c => (
          <button
            key={c}
            className={`faq-cat-btn${activeCat === c ? ' active' : ''}`}
            onClick={() => setActiveCat(c)}
          >
            {c}
            {faqs.length > 0 && <span className="faq-cat-count">{countFor(c)}</span>}
          </button>
        ))}
      </div>

      {showForm && (
        <form className="panel-form" onSubmit={create}>
          <input placeholder="Pergunta" value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} required/>
          <textarea placeholder="Resposta" value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} required rows={3}/>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
            {FAQ_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit">Salvar</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="faq-list">
        {filtered.map(f => (
          <details className="faq-item" key={f.id}>
            <summary>
              <span>{f.question}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span className="faq-item-cat">{f.category}</span>
                {isAdmin && <button className="btn-icon-danger" onClick={e => { e.preventDefault(); remove(f.id); }}><X size={14}/></button>}
              </div>
            </summary>
            <p>{f.answer}</p>
          </details>
        ))}
        {!filtered.length && (
          <p className="muted">
            {activeCat === 'Todas'
              ? `Nenhuma pergunta cadastrada.${isAdmin ? ' Clique em "Nova pergunta" para adicionar.' : ''}`
              : `Nenhuma pergunta em "${activeCat}".`}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Activity Page (todos os perfis) ──────────────────────────────────────────
function ActivityPage() {
  const [activity, setActivity] = useState([]);
  useEffect(() => {
    api(`${API}/activity`).then(r => r.ok ? r.json() : null).then(d => { if (d) setActivity(d.activity || []); }).catch(() => {});
  }, []);
  return (
    <section className="panel">
      <h2><Activity/> Atividade recente</h2>
      <p className="muted">Registro das últimas ações realizadas na plataforma.</p>
      {activity.length
        ? <ActivityFeed items={activity} />
        : <p className="muted">Nenhuma atividade registrada ainda.</p>}
    </section>
  );
}

// ── Conversation History ───────────────────────────────────────────────────────
function ConvHistory({ user, isAdmin }) {
  const [convs, setConvs] = useState([]);
  useEffect(() => {
    // Backend já filtra por usuário quando não é Admin
    api(`${API}/conversations`).then(r => r.ok ? r.json() : null).then(d => { if (d) setConvs(d.conversations || []); }).catch(() => {});
  }, []);
  return (
    <section className="panel">
      <h2><History/> Histórico de conversas</h2>
      <p className="muted">
        {isAdmin
          ? 'Todas as perguntas feitas ao Impettus IA por qualquer usuário.'
          : 'Suas perguntas ao Impettus IA.'}
      </p>
      <div className="conv-list">
        {convs.map(c => (
          <details className="conv-item" key={c.id}>
            <summary>
              <span className="conv-q">{c.question}</span>
              <small>
                {new Date(c.created_at || c.timestamp).toLocaleString('pt-BR')}
                {isAdmin && ` · ${c.user_name || c.user_email}`}
              </small>
            </summary>
            <p className="conv-a">{c.answer}</p>
            {c.sources?.length > 0 && <small className="muted">{c.sources.length} fonte(s) citada(s)</small>}
          </details>
        ))}
        {!convs.length && <p className="muted">Nenhuma conversa registrada ainda.</p>}
      </div>
    </section>
  );
}

// ── Users Page ─────────────────────────────────────────────────────────────────
// Departamentos disponíveis para atribuição (todos exceto Admin)
const DEPT_LIST = ROLES.filter(r => r !== 'Admin');

function UsersPage({ user }) {
  const BLANK = { name: '', email: '', password: '', role: 'Operações', departments: [], brand_id: '' };
  const [users,    setUsers]    = useState([]);
  const [brands,   setBrands]   = useState([]);
  const [form,     setForm]     = useState(BLANK);
  const [showForm, setShowForm] = useState(false);
  const [error,    setError]    = useState('');
  const isAdmin = user?.role === 'Admin';

  const needsBrand = form.role !== 'Admin';

  function toggleDept(dept) {
    setForm(f => ({
      ...f,
      departments: f.departments.includes(dept)
        ? f.departments.filter(d => d !== dept)
        : [...f.departments, dept],
    }));
  }

  async function load() {
    const [ru, rb] = await Promise.all([api(`${API}/users`), api(`${API}/brands`)]);
    if (ru.ok) { const d = await ru.json(); setUsers(d.users || []); }
    if (rb.ok) { const d = await rb.json(); setBrands(d.brands || []); }
  }

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  async function create(e) {
    e.preventDefault();
    setError('');
    if (needsBrand && !form.brand_id) { setError('Selecione a marca para este usuário.'); return; }
    if (form.role !== 'Admin' && form.departments.length === 0) {
      setError('Selecione ao menos um departamento.'); return;
    }
    const payload = { ...form, brand_id: needsBrand ? form.brand_id : null };
    const r = await api(`${API}/users`, { method: 'POST', body: JSON.stringify(payload) });
    if (r.ok) { setForm(BLANK); setShowForm(false); await load(); }
    else { const d = await r.json(); setError(d.detail || 'Erro ao criar usuário'); }
  }

  async function remove(id) {
    await api(`${API}/users/${id}`, { method: 'DELETE' });
    await load();
  }

  if (!isAdmin) return <section className="panel"><h2><Users/> Usuários</h2><p className="muted">Acesso restrito a administradores.</p></section>;

  return (
    <section>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="panel-header">
          <h2 style={{ margin: 0 }}><Users/> Usuários</h2>
          <button className="btn-add" onClick={() => { setShowForm(!showForm); setError(''); setForm(BLANK); }}>
            <Plus size={16}/> Novo usuário
          </button>
        </div>

        {showForm && (
          <form className="panel-form" onSubmit={create}>
            <input placeholder="Nome completo" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required/>
            <input placeholder="E-mail" type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required/>
            <input placeholder="Senha" type="password" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required/>

            {/* Perfil principal */}
            <label style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>Perfil principal</label>
            <select value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value, brand_id: '', departments: [] }))}>
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>

            {/* Departamentos — multi-seleção */}
            {form.role !== 'Admin' && (
              <div className="dept-selector">
                <div className="dept-selector-header">
                  <span><Building2 size={13}/> Departamentos com acesso</span>
                  {form.departments.length > 0 && (
                    <button type="button" className="perm-clear"
                      onClick={() => setForm(f => ({ ...f, departments: [] }))}>
                      Limpar ({form.departments.length})
                    </button>
                  )}
                </div>
                <div className="dept-chips">
                  {DEPT_LIST.map(dept => {
                    const rl = ROLE_LABEL[dept] || { color: '#9fb0c8' };
                    const on = form.departments.includes(dept);
                    return (
                      <label key={dept}
                        className={`dept-chip${on ? ' on' : ''}`}
                        style={{ '--dept-color': rl.color }}>
                        <input type="checkbox" style={{ display:'none' }}
                          checked={on} onChange={() => toggleDept(dept)}/>
                        {dept}
                      </label>
                    );
                  })}
                </div>
                {form.departments.length === 0 && (
                  <p style={{ fontSize:12, color:'var(--orange)', margin:'6px 0 0' }}>
                    ⚠ Selecione ao menos um departamento
                  </p>
                )}
              </div>
            )}

            {/* Marca */}
            {needsBrand && (
              <select value={form.brand_id}
                onChange={e => setForm(f => ({ ...f, brand_id: e.target.value }))}
                style={{ borderColor: !form.brand_id ? 'var(--orange)' : undefined }}>
                <option value="">— Selecione a marca —</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}

            {error && <div className="error">{error}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button type="submit">Criar usuário</button>
              <button type="button" onClick={() => { setShowForm(false); setError(''); setForm(BLANK); }}>Cancelar</button>
            </div>
          </form>
        )}
      </div>

      <div className="doc-grid">
        {users.map(u => {
          const brandName = brands.find(b => b.id === u.brand_id)?.name;
          const cfg = brandName ? (BRAND_CFG[brandName] || {}) : {};
          const depts = u.departments || [];
          return (
            <article className="doc-card" key={u.id}>
              <div className="avatar" style={{ marginBottom:10 }}>{u.name[0].toUpperCase()}</div>

              {/* Perfil + marca */}
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                <span className="tag" style={{ background: `${(ROLE_LABEL[u.role]||{color:'#9fb0c8'}).color}22`, color: (ROLE_LABEL[u.role]||{color:'#9fb0c8'}).color }}>
                  {u.role}
                </span>
                {brandName && (
                  <span className="tag" style={{ background: cfg.bg||'rgba(159,176,200,.12)', color: cfg.color||'#9fb0c8', border:`1px solid ${cfg.color||'#9fb0c8'}44` }}>
                    <Building2 size={10}/> {brandName}
                  </span>
                )}
              </div>

              {/* Departamentos */}
              {depts.length > 0 && (
                <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:8 }}>
                  {depts.map(d => {
                    const rl = ROLE_LABEL[d] || { color:'#9fb0c8' };
                    return (
                      <span key={d} className="dept-badge" style={{ '--dept-color': rl.color }}>{d}</span>
                    );
                  })}
                </div>
              )}

              <h3>{u.name}</h3>
              <p style={{ color:'#9fb0c8' }}>{u.email}</p>
              <small>{new Date(u.created_at).toLocaleString('pt-BR')}</small>
              <button className="danger" onClick={() => remove(u.id)}><Trash2 size={16}/> Remover</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── Departments Page ──────────────────────────────────────────────────────────
function DepartmentsPage({ user }) {
  const [depts,    setDepts]    = useState([]);
  const [form,     setForm]     = useState({ name: '', description: '' });
  const [showForm, setShowForm] = useState(false);
  const isAdmin = user?.role === 'Admin';

  async function load() {
    const r = await api(`${API}/departments`);
    if (r.ok) { const d = await r.json(); setDepts(d.departments || []); }
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    const r = await api(`${API}/departments`, { method: 'POST', body: JSON.stringify(form) });
    if (r.ok) { setForm({ name: '', description: '' }); setShowForm(false); await load(); }
  }

  async function remove(id) {
    await api(`${API}/departments/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2 style={{ margin: 0 }}><Building2/> Departamentos</h2>
        {isAdmin && <button className="btn-add" onClick={() => setShowForm(!showForm)}><Plus size={16}/> Novo departamento</button>}
      </div>
      {showForm && (
        <form className="panel-form" onSubmit={create}>
          <input placeholder="Nome do departamento" value={form.name}        onChange={e => setForm(f => ({ ...f, name:        e.target.value }))} required/>
          <input placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}/>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit">Criar</button>
            <button type="button" onClick={() => setShowForm(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <div className="doc-grid">
        {depts.map(d => (
          <article className="doc-card" key={d.id}>
            <Building2 style={{ color: 'var(--orange)' }}/>
            <h3>{d.name}</h3>
            {d.description && <p style={{ color: '#9fb0c8' }}>{d.description}</p>}
            <small>{new Date(d.created_at).toLocaleString('pt-BR')}</small>
            {isAdmin && <button className="danger" onClick={() => remove(d.id)}><Trash2 size={16}/> Remover</button>}
          </article>
        ))}
        {!depts.length && <p className="muted">Nenhum departamento cadastrado.</p>}
      </div>
    </section>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    api(`${API}/stats`).then(r => r.ok ? r.json() : null).then(d => { if (d) setInfo(d); }).catch(() => {});
  }, []);

  const statusItems = info ? [
    { label: 'Versão da plataforma',  value: info.version ?? 'V2.0',   ok: true },
    { label: 'OpenAI API Key',        value: info.openai_enabled ? 'Configurada ✓' : 'Não configurada', ok: info.openai_enabled },
    { label: 'Modo de recuperação',   value: info.openai_enabled ? 'Semântico (embeddings)' : 'Lexical (BM25)', ok: info.openai_enabled },
    { label: 'Documentos indexados',  value: info.documents ?? 0,       ok: true },
    { label: 'Chunks na base',        value: info.chunks ?? 0,          ok: true },
    { label: 'Chunks com embedding',  value: info.embedded_chunks ?? 0, ok: (info.embedded_chunks ?? 0) > 0 },
    { label: 'Conversas registradas', value: info.conversations ?? 0,   ok: true },
  ] : [];

  const roadmap = [
    { done: true,  item: 'V1.1 — Logo, layout dark, categorias, fontes' },
    { done: true,  item: 'V1.2 — JWT, usuários, perfis, auditoria de conversas' },
    { done: true,  item: 'V2.0 — Embeddings reais (text-embedding-3-small), permissões por documento' },
    { done: false, item: 'V3 — Portal do franqueado, base por marca/loja' },
    { done: false, item: 'V4 — Integrações: Sults, BI/CMV, WhatsApp, relatórios executivos' },
  ];

  return (
    <section>
      <div className="panel" style={{ marginBottom: 18 }}>
        <h2><Settings/> Status do sistema</h2>
        <div className="settings-grid">
          {statusItems.map(({ label, value, ok }) => (
            <div className="setting-row" key={label}>
              <span className="setting-label">{label}</span>
              <span className={`setting-value${ok ? '' : ' setting-warn'}`}>{String(value)}</span>
            </div>
          ))}
          {!info && <p className="muted">Carregando informações…</p>}
        </div>
        {info && !info.openai_enabled && (
          <div className="notice" style={{ marginTop: 16 }}>
            <b>OPENAI_API_KEY não configurada.</b> Os documentos serão indexados com BM25 (lexical).
            Configure a variável de ambiente <code>OPENAI_API_KEY</code> no backend para ativar embeddings semânticos e respostas geradas por IA.
          </div>
        )}
      </div>

      <div className="panel">
        <h2><ScrollText/> Roadmap</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {roadmap.map(({ done, item }) => (
            <div key={item} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 16 }}>{done ? '✅' : '⏳'}</span>
              <span style={{ color: done ? '#f8fafc' : '#9fb0c8', fontSize: 14 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── System Logs ───────────────────────────────────────────────────────────────
function SystemLogs() {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    api(`${API}/activity`).then(r => r.ok ? r.json() : null).then(d => { if (d) setLogs(d.activity || []); }).catch(() => {});
  }, []);

  const badge = { document: '#ff7a18', auth: '#35d07f', user: '#7b9cff', info: '#9fb0c8' };

  return (
    <section className="panel">
      <h2><ScrollText/> Logs do sistema</h2>
      <p className="muted">Registro de ações realizadas na plataforma.</p>
      <div className="logs-list">
        {logs.map(l => (
          <div className="log-row" key={l.id}>
            <span className="log-badge" style={{ background: badge[l.type] || '#9fb0c8' }}>{l.type}</span>
            <span className="log-msg">{l.message}</span>
            <small className="log-time">{new Date(l.created_at || l.timestamp).toLocaleString('pt-BR')}</small>
          </div>
        ))}
        {!logs.length && <p className="muted">Nenhum log registrado ainda.</p>}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
