/* Witly Grimório — UI. Vanilla JS, sem build. Rotas por hash:
 *   #/                     catálogo
 *   #/t/<slug>[/<aba>]     editor de template (rascunho quando existe; senão publicada)
 *   #/gerais               contextos gerais
 *   #/usuarios             usuários (editor)
 * Toda escrita vai para o RASCUNHO (o servidor cria se não existir); "Publicar" promove. */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let me = null;
  let toastTimer = null;

  function toast(msg, bad) {
    const t = $('#toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    const r = await fetch(path, init);
    let data = null; try { data = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok) throw new Error((data && data.error) || `${init.method} ${path} → ${r.status}`);
    return data;
  }
  const isEditor = () => me && me.role === 'editor';
  const fmtAt = (v) => String(v || '').slice(0, 16).replace('T', ' ');
  const params = () => new URLSearchParams(location.hash.split('?')[1] || '');
  /** Troca a query da rota sem disparar o roteador (busca e filtro locais). */
  function setQuery(base, p) { const q = p.toString(); history.replaceState(null, '', `#/${base}${q ? '?' + q : ''}`); }

  const skelLines = (n) => Array.from({ length: n }, (_, i) => `<div class="skel line ${i % 3 === 2 ? 'w40' : i % 2 ? 'w60' : ''}"></div>`).join('');
  /** Esqueleto enquanto a rota carrega: a página não pisca em branco. */
  function skeleton(kind) {
    const head = '<div class="skel line w25" style="height:20px;margin-bottom:10px"></div><div class="skel line w60"></div>';
    if (kind === 'cards') app.innerHTML = `${head}<div class="grid" style="margin-top:22px">${'<div class="skel card"></div>'.repeat(6)}</div>`;
    else if (kind === 'rows') app.innerHTML = `${head}<div class="list-cards" style="margin-top:22px">${'<div class="skel card" style="height:104px"></div>'.repeat(4)}</div>`;
    else app.innerHTML = `${head}<div class="card" style="margin-top:22px">${skelLines(8)}</div>`;
  }

  /** Modal: título, corpo e um primário. Devolve o elemento para preencher depois. */
  function modal(title, body, okLabel, onOk) {
    const ov = document.createElement('div'); ov.className = 'overlay';
    ov.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><div id="m-body">${body}</div>
      <div class="actions"><button class="btn btn-ghost" id="m-no">Cancelar</button>${okLabel ? `<button class="btn btn-p" id="m-ok">${esc(okLabel)}</button>` : ''}</div></div>`;
    const fecharEsc = (e) => { if (e.key === 'Escape') fechar(); };
    const fechar = () => { ov.remove(); document.removeEventListener('keydown', fecharEsc); window.removeEventListener('hashchange', fechar); };
    ov.onclick = (e) => { if (e.target === ov) fechar(); };
    document.body.appendChild(ov);
    $('#m-no', ov).onclick = fechar;
    const ok = $('#m-ok', ov); if (ok) ok.onclick = () => onOk(fechar, ov);
    document.addEventListener('keydown', fecharEsc);
    window.addEventListener('hashchange', fechar);   // trocar de tela fecha o modal
    return ov;
  }

  // ── shell ──────────────────────────────────────────────────────────────
  async function boot() {
    try { me = await api('/api/me'); } catch { me = null; }
    $('#nav').hidden = !me;
    $('#who').hidden = !me;
    if (me) {
      $('#who-name').textContent = me.name || me.email;
      const r = $('#who-role'); r.textContent = me.role; r.className = `pill ${me.role}`;
      for (const a of document.querySelectorAll('[data-editor]')) a.hidden = !isEditor();
    }
    window.addEventListener('hashchange', route);
    route();
  }
  function setNav(key) { for (const a of document.querySelectorAll('#nav a[data-nav]')) a.classList.toggle('on', a.dataset.nav === key); }

  function route() {
    if (!me) return renderLogin();
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const [seg, slug, tab, ...rest] = h.split('/');
    if (seg === 'atividade' && slug) { setNav('atividade'); return renderAtividadeDetalhe(slug); }
    if (seg === 'atividade') { setNav('atividade'); return renderAtividade(); }
    if (seg === 'uso') { setNav('atividade'); return renderUso(); }
    if (seg === 'saude') { setNav('atividade'); return renderSaude(); }
    if (seg === 'pessoais') { setNav('pessoais'); return renderPessoais(); }
    if (seg === 'plataforma') { setNav('design'); return renderPlataforma(); }
    if (seg === 'design') { setNav('design'); return renderDesign(slug, tab); }
    if (seg === 't' && slug) { setNav('templates'); return renderTemplate(slug, tab, rest.length ? decodeURIComponent(rest.join('/')) : null); }
    if (seg === 'gerais') { setNav('gerais'); return renderGerais(); }
    if (seg === 'usuarios') { setNav('usuarios'); return renderUsuarios(); }
    setNav('templates'); return renderCatalog();
  }

  function renderLogin() {
    app.innerHTML = `<div class="login card">
      <h1>Witly Grimório</h1>
      <p>Templates de análise para o seu agente. Entre com a conta Google da Witly.</p>
      <a class="btn btn-p" href="/ui/login">Entrar com Google</a>
    </div>`;
  }

  // ── catálogo ───────────────────────────────────────────────────────────
  const CAT_FILTROS = [['todos', 'todos'], ['mcp', 'no MCP'], ['rascunho', 'com rascunho'], ['parado', 'sem uso 30d']];

  async function renderCatalog() {
    skeleton('cards');
    const { stats, templates, desde30 } = await api('/api/catalogo');
    const p = params();
    let q = p.get('q') || '';
    let f = CAT_FILTROS.some(([k]) => k === p.get('f')) ? p.get('f') : 'todos';
    const parado = (t) => t.published_number && !(t.ultimo_uso && t.ultimo_uso >= desde30);
    const sync = () => { const p2 = new URLSearchParams(); if (q.trim()) p2.set('q', q.trim()); if (f !== 'todos') p2.set('f', f); setQuery('', p2); };

    const draw = () => {
      const busca = q.trim().toLowerCase();
      const rows = templates.filter((t) => {
        if (busca && !`${t.name} ${t.slug} ${t.objective}`.toLowerCase().includes(busca)) return false;
        if (f === 'mcp') return !!t.published_number;
        if (f === 'rascunho') return !!t.draft_number;
        if (f === 'parado') return parado(t);
        return true;
      });
      app.innerHTML = `<div class="head"><div><h1>Templates</h1><p class="muted sm">O MCP entrega ao agente só a versão <b>publicada</b>. Edições ficam num rascunho até você publicar.</p></div>
        ${isEditor() ? '<button class="btn btn-p" id="new">+ Novo template</button>' : ''}</div>
        <div class="stats">
          <div class="stat"><div class="stat-k">No MCP agora</div><div class="stat-v">${stats.publicados} <small>publicados</small></div></div>
          <div class="stat ${stats.rascunhos ? 'warn-k' : ''}"><div class="stat-k">Esperando publicação</div><div class="stat-v">${stats.rascunhos} <small>${stats.rascunhos === 1 ? 'rascunho' : 'rascunhos'}</small></div></div>
          <div class="stat"><div class="stat-k">Última publicação</div><div class="stat-v mono">${stats.ultima_publicacao ? esc(fmtAt(stats.ultima_publicacao)) : '—'}</div></div>
          <div class="stat"><div class="stat-k">Sem uso em 30d</div><div class="stat-v">${stats.sem_uso_30d} <small>${stats.sem_uso_30d === 1 ? 'template' : 'templates'}</small></div></div>
        </div>
        <div class="filters">
          <span class="search"><input id="c-q" placeholder="buscar nome ou slug" value="${esc(q)}"></span>
          <span class="seg">${CAT_FILTROS.map(([k, l]) => `<button data-f="${k}" class="${k === f ? 'on' : ''}">${l}</button>`).join('')}</span>
          <span class="count">${rows.length} de ${templates.length}</span>
        </div>
        <div class="grid">${rows.map((t) => `<a class="card tcard" href="#/t/${esc(t.slug)}" style="display:flex;flex-direction:column">
          <div class="row" style="justify-content:space-between;align-items:flex-start"><span class="t">${esc(t.name)}</span>
            ${t.published_number ? `<span class="pill pub">v${esc(t.published_semver || t.published_number)}</span>` : '<span class="pill off">sem publicada</span>'}</div>
          <div class="muted sm" style="margin:6px 0"><code>${esc(t.slug)}</code>${t.owner_email ? ' <span class="pill">pessoal</span>' : ''}</div>
          <div class="sm" style="margin-bottom:12px">${esc(t.objective)}</div>
          <div style="margin-top:auto;padding-top:11px;border-top:1px solid var(--line-soft);display:flex;gap:10px;align-items:center">
            <code class="sm">${t.geracoes} ger · ${t.aprofundamentos} aprof</code>
            <span class="sm" style="margin-left:auto;font-weight:600;color:${t.draft_number ? 'var(--amber)' : parado(t) ? 'var(--ink-faint)' : t.published_number ? 'var(--green)' : 'var(--red)'}">${t.draft_number ? 'rascunho aberto' : parado(t) ? 'sem uso em 30d' : t.published_number ? 'no MCP' : 'não publicado'}</span>
          </div></a>`).join('') || `<div class="empty">${busca || f !== 'todos' ? 'Nenhum template com esse filtro.' : 'Nenhum template ainda.'}</div>`}</div>`;
      const bn = $('#new'); if (bn) bn.onclick = newTemplate;
      for (const b of app.querySelectorAll('.seg [data-f]')) b.onclick = () => { f = b.dataset.f; sync(); draw(); };
      const inp = $('#c-q');
      inp.oninput = () => { q = inp.value; sync(); const at = inp.selectionStart; draw(); const el = $('#c-q'); el.focus(); el.setSelectionRange(at, at); };
    };
    draw();
  }

  async function newTemplate() {
    const slug = prompt('slug (a-z, 0-9, hífen), ex.: debriefing');
    if (!slug) return;
    const name = prompt('Nome do template');
    if (!name) return;
    try { await api('/api/templates', { method: 'POST', body: { slug, name } }); location.hash = `#/t/${slug}`; toast('Template criado como rascunho'); }
    catch (e) { toast(e.message, true); }
  }

  // ── editor de template ─────────────────────────────────────────────────
  const TABS = [['info', 'Info'], ['manifesto', 'Manifesto'], ['tarefas', 'Tarefas'], ['regras', 'Regras'], ['queries', 'Queries'], ['python', 'Python'], ['documento', 'Documento'], ['guia', 'Guia'], ['perguntas', 'Perguntas'], ['exemplo', 'Exemplo'], ['versoes', 'Versões']];

  async function loadKit(slug) {
    const d = await api(`/api/templates/${encodeURIComponent(slug)}?state=draft`);
    if (d.kit) return { ...d, state: 'draft' };
    const p = await api(`/api/templates/${encodeURIComponent(slug)}?state=published`);
    return { ...p, state: 'published' };
  }

  /** O kit está completo? Uma marca por parte — as vazias ganham ponto na aba. */
  function kitCheck(t, kit) {
    const files = new Map((kit ? kit.files : []).map((f) => [f.path, f.content]));
    const cheio = (path) => (files.get(path) || '').trim().length > 0;
    const temPrefixo = (pre) => [...files.keys()].some((k) => k.startsWith(pre));
    const m = (kit && kit.manifest) || {};
    return {
      info: !!(t.objective || '').trim() && !!(t.when_to_use || '').trim(),
      manifesto: ((m.como_gerar || []).length > 0),
      tarefas: !!(kit && kit.tasks.length),
      regras: !!(kit && (kit.rules || []).some((r) => r.tipo !== 'pergunta')),
      queries: temPrefixo('queries/'),
      python: temPrefixo('python/'),
      documento: cheio('documento.md'),
      guia: cheio('guia.md'),
      perguntas: !!(kit && (kit.rules || []).some((r) => r.tipo === 'pergunta')),
      exemplo: cheio('exemplo.html'),
    };
  }

  const BUMPS = [
    ['patch', 'ajuste', 'v1.0.<b>x</b> · texto, guia, correção'],
    ['minor', 'melhoria', 'v1.<b>x</b>.0 · tarefa, query ou bloco novo'],
    ['major', 'mudança grande', 'v<b>x</b>.0.0 · estrutura, motor, parâmetros'],
  ];

  /** Publicar: escolhe o tamanho da mudança e mostra o que muda em relação à publicada. */
  function publicarModal(t, draft) {
    const slug = t.slug;
    const corpo = `<p class="muted sm">O agente passa a receber esta versão na próxima chamada do MCP${t.published_version_id ? ', no lugar da publicada de hoje' : ''}.</p>
      <label>Tamanho da mudança</label>
      <div style="display:flex;flex-direction:column;gap:6px">${BUMPS.map(([k, l, h], i) => `<label><input type="radio" name="bump" value="${k}" ${i === 0 ? 'checked' : ''}> ${l} <span class="muted sm">${h}</span></label>`).join('')}</div>
      <label>Nota de mudança (opcional)</label><input id="pub-log" placeholder="o que muda para quem usa">
      <div id="pub-diff" class="muted sm" style="margin-top:12px">Comparando com a publicada…</div>`;
    const ov = modal('Publicar o rascunho', corpo, 'Publicar', async (fechar) => {
      const bump = ov.querySelector('input[name=bump]:checked').value;
      const changelog = $('#pub-log', ov).value;
      try { const r = await api(`/api/templates/${encodeURIComponent(slug)}/publish`, { method: 'POST', body: { changelog, bump } }); fechar(); toast(`Publicado v${r.version.semver || r.version.number}`); route(); }
      catch (e) { toast(e.message, true); }
    });
    if (t.published_version_id && draft) {
      api(`/api/templates/${encodeURIComponent(slug)}/versoes`)
        .then((vs) => {
          const pub = vs.find((v) => v.state === 'published' && v.id === t.published_version_id) || vs.find((v) => v.state === 'published');
          if (!pub) throw new Error('sem publicada');
          return api(`/api/templates/${encodeURIComponent(slug)}/versoes/diff?de=${pub.number}&para=${draft.number}`);
        })
        .then((d) => {
          const partes = [
            [d.manifest ? 1 : 0, 'manifesto'],
            [d.tasks.length, d.tasks.length === 1 ? 'tarefa' : 'tarefas'],
            [d.rules.length, d.rules.length === 1 ? 'regra' : 'regras'],
            [d.files.length, d.files.length === 1 ? 'arquivo' : 'arquivos'],
          ].filter(([n]) => n).map(([n, l]) => `${n} ${l}`);
          const lista = [...d.tasks.map((x) => `tarefas/${x.path}`), ...d.rules.map((x) => `regras/${x.path}`), ...d.files.map((x) => x.path)];
          $('#pub-diff', ov).innerHTML = partes.length
            ? `Muda ${partes.join(' · ')}: ${lista.slice(0, 6).map((x) => `<code>${esc(x)}</code>`).join(', ')}${lista.length > 6 ? ` e mais ${lista.length - 6}` : ''}.`
            : 'O rascunho está igual à publicada.';
        })
        .catch(() => { $('#pub-diff', ov).textContent = ''; });
    } else { $('#pub-diff', ov).textContent = 'Primeira versão publicada deste template.'; }
  }

  async function renderTemplate(slug, tab, sub) {
    tab = TABS.some(([k]) => k === tab) ? tab : 'info';
    let data;
    try { data = await loadKit(slug); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const { template: t, kit, state } = data;
    const v = kit ? kit.version : null;
    const canEdit = isEditor() || (t.owner_email && t.owner_email === me.email);
    const kc = kitCheck(t, kit);
    const feitos = Object.values(kc).filter(Boolean).length;
    const total = Object.keys(kc).length;
    app.innerHTML = `<div class="head">
      <div><a class="muted sm" href="#/">← Templates</a><h1>${esc(t.name)} <code>${esc(t.slug)}</code>${t.owner_email ? ` <span class="pill">pessoal · ${esc(t.owner_email)}</span>` : ''}</h1>
        <div class="row sm"><span class="muted">${kit ? (state === 'draft' ? `Editando o <b>rascunho</b> (nº ${v.number})` : `Vendo a <b>publicada v${v.semver || v.number}</b>`) : 'Sem versão'}</span>
        ${t.published_version_id ? '<span class="pill pub">publicada</span>' : '<span class="pill off">sem publicada</span>'}${t.draft_version_id ? '<span class="pill draft">rascunho</span>' : ''}
        <span class="kitbar" title="Partes do kit já preenchidas">kit ${feitos}/${total} <span class="bar ${feitos === total ? '' : feitos * 2 >= total ? 'mid' : 'bad'}"><span style="width:${Math.round(100 * feitos / total)}%"></span></span></span></div></div>
      <div class="row">${canEdit && !t.draft_version_id && t.published_version_id ? '<button class="btn" id="mkdraft">Criar rascunho</button>' : ''}
        ${canEdit && t.draft_version_id ? '<button class="btn btn-p" id="publish">Publicar rascunho</button>' : ''}</div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}${k in kc && !kc[k] ? '<span class="dot" title="vazio"></span>' : ''}</button>`).join('')}</div>
      <div id="pane"></div>`;
    for (const b of app.querySelectorAll('.tab')) b.onclick = () => { location.hash = `#/t/${slug}/${b.dataset.tab}`; };
    const mk = $('#mkdraft'); if (mk) mk.onclick = async () => { try { await api(`/api/templates/${slug}/draft`, { method: 'POST' }); toast('Rascunho criado'); route(); } catch (e) { toast(e.message, true); } };
    const pb = $('#publish'); if (pb) pb.onclick = () => publicarModal(t, v);
    if (!kit) { $('#pane').innerHTML = '<div class="empty">Este template ainda não tem conteúdo.</div>'; return; }
    const ctx = { slug, kit, canEdit, state, sub };
    ({ info: paneInfo, manifesto: paneManifest, tarefas: paneTarefas, contexto: paneTarefas, regras: (c, e) => paneRegras({ ...c, tipos: ['regra', 'recomendacao', 'definicao'] }, e), queries: paneFiles('queries/', 'sql'), python: paneFiles('python/', 'py'), documento: paneSingle('documento.md'), guia: paneSingle('guia.md'), perguntas: (c, e) => paneRegras({ ...c, tipos: ['pergunta'] }, e), exemplo: paneExemplo, versoes: paneVersoes })[tab](ctx, $('#pane'));
  }

  function saveFile(slug, path, content) {
    return api(`/api/templates/${encodeURIComponent(slug)}/draft/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', body: { content } });
  }
  function fileOf(kit, path) { const f = kit.files.find((x) => x.path === path); return f ? f.content : ''; }
  function editorBlock(id, content, cls, canEdit) {
    return `<textarea id="${id}" class="${cls}" ${canEdit ? '' : 'readonly'}>${esc(content)}</textarea>`;
  }
  function saveBar(canEdit, label = 'Salvar no rascunho') {
    return canEdit ? `<div class="actions"><button class="btn btn-p" id="save">${label}</button></div>` : '<p class="muted sm">Só editores alteram.</p>';
  }
  function wireSave(fn) {
    const b = $('#save'); if (!b) return;
    b.onclick = async () => { b.disabled = true; try { const r = await fn(); toast('Salvo no rascunho'); if (r && r.warnings && r.warnings.length) { const w = document.createElement('div'); w.className = 'warn'; w.textContent = r.warnings.join(' · '); $('#pane').prepend(w); } if (r !== false) route(); } catch (e) { toast(e.message, true); } finally { b.disabled = false; } };
  }

  function paneInfo({ slug, kit, canEdit }, el) {
    const t = kit && kit.version ? null : null; // meta vem do template
    api(`/api/templates/${encodeURIComponent(slug)}?state=published`).catch(() => null);
    el.innerHTML = `<div class="card">
      <label>Nome</label><input id="f-name" ${canEdit ? '' : 'readonly'}>
      <label>Objetivo</label><textarea id="f-obj" style="min-height:80px" ${canEdit ? '' : 'readonly'}></textarea>
      <label>Quando usar</label><textarea id="f-when" style="min-height:80px" ${canEdit ? '' : 'readonly'}></textarea>
      ${saveBar(canEdit, 'Salvar')}</div>
      <p class="muted sm" style="margin-top:10px">Nome, objetivo e "quando usar" valem para todas as versões (aparecem no catálogo do MCP).</p>`;
    api(`/api/templates/${encodeURIComponent(slug)}`).then((d) => { $('#f-name').value = d.template.name; $('#f-obj').value = d.template.objective; $('#f-when').value = d.template.when_to_use; });
    wireSave(async () => { await api(`/api/templates/${encodeURIComponent(slug)}`, { method: 'PATCH', body: { name: $('#f-name').value, objective: $('#f-obj').value, when_to_use: $('#f-when').value } }); return false; });
    void t;
  }

  function paneManifest({ slug, kit, canEdit }, el) {
    el.innerHTML = `<p class="muted sm">Parâmetros das queries (<code>params</code>), lista de queries com <code>when</code>, índice das tarefas de contexto e <code>como_gerar</code>. JSON.</p>
      ${editorBlock('ed', JSON.stringify(kit.manifest, null, 2), 'code', canEdit)}${saveBar(canEdit)}`;
    wireSave(async () => {
      let m; try { m = JSON.parse($('#ed').value); } catch { throw new Error('JSON inválido'); }
      await api(`/api/templates/${encodeURIComponent(slug)}/draft/manifest`, { method: 'PUT', body: { manifest: m } });
    });
  }

  function paneTarefas({ slug, kit, canEdit, sub }, el) {
    const tasks = [...kit.tasks].sort((a, b) => a.sort - b.sort);
    let cur = tasks.some((t) => t.task_id === sub) ? sub : (tasks[0] ? tasks[0].task_id : null);
    const draw = () => {
      const t = tasks.find((x) => x.task_id === cur);
      el.innerHTML = `<p class="muted sm">Uma página por <b>tarefa</b>: o que o agente levanta com o consultor antes de gerar. O agente recebe o texto inteiro. As <b>regras</b> da análise ficam na aba ao lado.</p>
        <div class="split"><div class="card"><div class="list">${tasks.map((x) => `<button data-id="${esc(x.task_id)}" class="${x.task_id === cur ? 'on' : ''}">${esc(x.title)}<br><code>${esc(x.task_id)}</code></button>`).join('')}</div>
          ${canEdit ? '<div class="actions"><button class="btn" id="newtask">+ Tarefa</button></div>' : ''}</div>
        <div class="card">${t ? `<label>Título</label><input id="t-title" value="${esc(t.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Ordem</label><input id="t-sort" type="number" value="${t.sort}" style="width:120px" ${canEdit ? '' : 'readonly'}>
          <label>Conteúdo (Markdown: definição, regra padrão, query de apoio, exemplos, casos ambíguos, saída)</label>
          ${editorBlock('t-body', t.body_md, '', canEdit)}${saveBar(canEdit)}` : '<div class="empty">Sem tarefas de contexto.</div>'}</div></div>`;
      for (const b of el.querySelectorAll('.list button')) b.onclick = () => { location.hash = `#/t/${slug}/tarefas/${encodeURIComponent(b.dataset.id)}`; };
      const nt = $('#newtask'); if (nt) nt.onclick = () => { const id = prompt('id da tarefa (a-z, 0-9, _ -), ex.: metas'); if (!id) return; tasks.push({ task_id: id, title: id, body_md: '', sort: tasks.length }); cur = id; draw(); };
      if (t) wireSave(() => api(`/api/templates/${encodeURIComponent(slug)}/draft/tasks/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#t-title').value, body_md: $('#t-body').value, sort: Number($('#t-sort').value) || 0 } }));
    };
    draw();
  }

  const TIPO_REGRA = { regra: 'regra', recomendacao: 'recomendação', definicao: 'definição', pergunta: 'pergunta' };
  const PILL_TIPO = { regra: 'pub', recomendacao: 'draft', definicao: 'leitor', pergunta: 'editor' };

  /** Entradas DESTA análise (o título é a regra/pergunta), como os contextos gerais.
   *  `tipos` escolhe a aba: Regras (regra/recomendação/definição) ou Perguntas (pergunta). */
  function paneRegras({ slug, kit, canEdit, sub, tipos }, el) {
    const soPergunta = tipos.length === 1 && tipos[0] === 'pergunta';
    const aba = soPergunta ? 'perguntas' : 'regras';
    const nome = soPergunta ? 'pergunta' : 'regra';
    const rules = (kit.rules || []).filter((r) => tipos.includes(r.tipo || 'regra')).sort((a, b) => a.sort - b.sort);
    let cur = rules.some((r) => r.rule_id === sub) ? sub : (rules[0] ? rules[0].rule_id : null);
    const draw = () => {
      const r = rules.find((x) => x.rule_id === cur);
      el.innerHTML = `<p class="muted sm">${soPergunta
        ? 'O <b>título é a pergunta</b>: o agente lê pelos títulos, escolhe as 3–5 mais relevantes pelo <code>numeros.json</code> e propõe no chat. Corpo: como aprofundar e que decisão alimenta.'
        : 'O <b>título é a regra</b>: o agente lê pelos títulos, aqui e no <code>regras.md</code> do kit. Corpo curto: por quê + como aplicar.'}</p>
        <div class="split"><div class="card"><div class="list">${rules.map((x) => `<button data-id="${esc(x.rule_id)}" class="${x.rule_id === cur ? 'on' : ''}">${soPergunta ? '' : `<span class="pill ${PILL_TIPO[x.tipo] || 'pub'}">${esc(TIPO_REGRA[x.tipo] || x.tipo || 'regra')}</span> `}${esc(x.title)}<br><code>${esc(x.rule_id)}</code></button>`).join('') || `<div class="muted sm">Nenhuma ${nome} ainda.</div>`}</div>
          ${canEdit ? `<div class="actions"><button class="btn" id="newrule">+ ${soPergunta ? 'Pergunta' : 'Regra'}</button></div>` : ''}</div>
        <div class="card">${r ? `${soPergunta ? '' : `<label>Tipo</label><select id="r-tipo" ${canEdit ? '' : 'disabled'}><option value="regra" ${r.tipo === 'regra' || !r.tipo ? 'selected' : ''}>Regra — o agente não pode descumprir</option><option value="recomendacao" ${r.tipo === 'recomendacao' ? 'selected' : ''}>Recomendação — siga, salvo motivo dito</option><option value="definicao" ${r.tipo === 'definicao' ? 'selected' : ''}>Definição — como o termo é entendido nesta análise</option></select>`}
          <label>${soPergunta ? 'Pergunta (uma frase, como o consultor faria)' : 'Título (a regra em uma frase: o que fazer / não fazer)'}</label><input id="r-title" value="${esc(r.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Ordem</label><input id="r-sort" type="number" value="${r.sort}" style="width:120px" ${canEdit ? '' : 'readonly'}>
          <label>${soPergunta ? 'Como aprofundar (o que olhar, que decisão alimenta)' : 'Corpo (por quê + como aplicar)'}</label>${editorBlock('r-body', r.body_md, '', canEdit)}
          ${canEdit ? '<div class="actions"><button class="btn btn-ghost btn-danger" id="delrule">Excluir</button><button class="btn btn-p" id="save">Salvar no rascunho</button></div>' : ''}` : `<div class="empty">Sem ${nome}s. As entradas chegam ao agente junto com o kit.</div>`}</div></div>`;
      for (const b of el.querySelectorAll('.list button')) b.onclick = () => { location.hash = `#/t/${slug}/${aba}/${encodeURIComponent(b.dataset.id)}`; };
      const nr = $('#newrule'); if (nr) nr.onclick = () => { const id = prompt(`id da ${nome} (a-z, 0-9, _ -), ex.: ${soPergunta ? 'cpl-subiu-por-que' : 'meta-por-canal-existe'}`); if (!id) return; rules.push({ rule_id: id, tipo: soPergunta ? 'pergunta' : 'regra', title: id, body_md: '', sort: rules.length }); cur = id; draw(); };
      const dr = $('#delrule'); if (dr) dr.onclick = async () => { if (!confirm(`Excluir a ${nome} "${cur}" do rascunho?`)) return; try { await api(`/api/templates/${encodeURIComponent(slug)}/draft/regras/${encodeURIComponent(cur)}`, { method: 'DELETE' }); toast(`${soPergunta ? 'Pergunta' : 'Regra'} removida do rascunho`); route(); } catch (e) { toast(e.message, true); } };
      if (r) wireSave(() => api(`/api/templates/${encodeURIComponent(slug)}/draft/regras/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#r-title').value, body_md: $('#r-body').value, tipo: soPergunta ? 'pergunta' : $('#r-tipo').value, sort: Number($('#r-sort').value) || 0 } }));
    };
    draw();
  }

  function paneFiles(prefix, lang) {
    return ({ slug, kit, canEdit, sub }, el) => {
      const files = kit.files.filter((f) => f.path.startsWith(prefix)).map((f) => f.path).sort();
      const tabKey = prefix.replace('/', '');
      let cur = sub && files.includes(prefix + sub) ? prefix + sub : (files[0] || null);
      const draw = () => {
        el.innerHTML = `<div class="split"><div class="card"><div class="list">${files.map((p) => `<button data-p="${esc(p)}" class="${p === cur ? 'on' : ''}"><code>${esc(p.slice(prefix.length))}</code></button>`).join('') || '<div class="muted sm">Nenhum arquivo.</div>'}</div>
            ${canEdit ? `<div class="actions"><button class="btn" id="newfile">+ Arquivo</button></div>` : ''}</div>
          <div class="card">${cur ? `<div class="row" style="justify-content:space-between"><code>${esc(cur)}</code>${canEdit ? '<button class="btn btn-ghost btn-danger" id="del">Excluir</button>' : ''}</div>
            ${editorBlock('ed', fileOf(kit, cur), 'code', canEdit)}${saveBar(canEdit)}` : '<div class="empty">Selecione um arquivo.</div>'}</div></div>`;
        for (const b of el.querySelectorAll('.list button')) b.onclick = () => { location.hash = `#/t/${slug}/${tabKey}/${encodeURIComponent(b.dataset.p.slice(prefix.length))}`; };
        const nf = $('#newfile'); if (nf) nf.onclick = () => { const n = prompt(`nome do arquivo (dentro de ${prefix})`, lang === 'sql' ? 'nova.sql' : 'novo.py'); if (!n) return; const p = prefix + n.replace(/^\/+/, ''); if (!files.includes(p)) { files.push(p); kit.files.push({ path: p, content: '' }); } cur = p; draw(); };
        const dl = $('#del'); if (dl) dl.onclick = async () => { if (!confirm(`Excluir ${cur} do rascunho?`)) return; try { await api(`/api/templates/${encodeURIComponent(slug)}/draft/files/${cur.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' }); toast('Excluído'); route(); } catch (e) { toast(e.message, true); } };
        if (cur) wireSave(() => saveFile(slug, cur, $('#ed').value));
      };
      draw();
    };
  }

  function paneSingle(path) {
    return ({ slug, kit, canEdit }, el) => {
      el.innerHTML = `${editorBlock('ed', fileOf(kit, path), '', canEdit)}${saveBar(canEdit)}`;
      $('#ed').style.minHeight = '480px';
      wireSave(() => saveFile(slug, path, $('#ed').value));
    };
  }

  function paneExemplo({ kit }, el) {
    const nums = fileOf(kit, 'exemplo/numeros.json');
    el.innerHTML = `<p class="muted sm">O exemplo é gerado a partir de uma base sintética (sem dado de cliente). O HTML entra no zip do kit; aqui ficam os números.</p>
      <textarea class="code" readonly style="min-height:480px">${esc(nums || '(sem exemplo nesta versão)')}</textarea>`;
  }

  // ── contextos gerais ───────────────────────────────────────────────────
  const TIPO_CTX = { regra: 'regra', recomendacao: 'recomendação', definicao: 'definição' };
  async function renderGerais() {
    const list = await api('/api/general-contexts');
    const canEdit = isEditor();
    let cur = list[0] ? list[0].slug : null;
    const draw = () => {
      const g = list.find((x) => x.slug === cur);
      app.innerHTML = `<div class="head"><div><h1>Contextos gerais</h1><p class="muted sm">Poucos e curados: valem para <b>todo</b> template e vão junto com qualquer kit. Salvar publica na hora.</p></div></div>
        <div class="split"><div class="card"><p class="muted sm">O <b>título é a regra</b>: o agente lê pelos títulos. Corpo curto: por quê + como aplicar.</p><div class="list">${list.map((x) => `<button data-s="${esc(x.slug)}" class="${x.slug === cur ? 'on' : ''}"><span class="pill ${x.tipo === 'regra' ? 'pub' : x.tipo === 'definicao' ? 'leitor' : 'draft'}">${esc(TIPO_CTX[x.tipo] || x.tipo || 'regra')}</span> ${esc(x.title)}<br><code>${esc(x.slug)}</code></button>`).join('') || '<div class="muted sm">Nenhum.</div>'}</div>
          ${canEdit ? '<div class="actions"><button class="btn" id="newg">+ Contexto geral</button></div>' : ''}</div>
        <div class="card">${g ? `<label>Tipo</label><select id="g-tipo" ${canEdit ? '' : 'disabled'}><option value="regra" ${g.tipo === 'regra' || !g.tipo ? 'selected' : ''}>Regra — o agente não pode descumprir</option><option value="recomendacao" ${g.tipo === 'recomendacao' ? 'selected' : ''}>Recomendação — siga, salvo motivo dito</option><option value="definicao" ${g.tipo === 'definicao' ? 'selected' : ''}>Definição — como o termo é entendido</option></select>
          <label>Título (a regra em uma frase: o que fazer / não fazer)</label><input id="g-title" value="${esc(g.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Conteúdo (Markdown)</label>${editorBlock('g-body', g.body_md, '', canEdit)}
          <p class="muted sm">Atualizado ${esc((g.updated_at || '').slice(0, 16).replace('T', ' '))} por ${esc(g.author_email || '—')}</p>
          ${canEdit ? '<div class="actions"><button class="btn btn-ghost btn-danger" id="delg">Excluir</button><button class="btn btn-p" id="save">Salvar e publicar</button></div>' : ''}` : '<div class="empty">Selecione um contexto.</div>'}</div></div>`;
      for (const b of app.querySelectorAll('.list button')) b.onclick = () => { cur = b.dataset.s; draw(); };
      const ng = $('#newg'); if (ng) ng.onclick = () => { const s = prompt('slug (a-z, 0-9, hífen), ex.: taxa-nunca-soma'); if (!s) return; list.push({ slug: s, title: s, body_md: '' }); cur = s; draw(); };
      const dg = $('#delg'); if (dg) dg.onclick = async () => { if (!confirm(`Excluir "${cur}"?`)) return; try { await api(`/api/general-contexts/${encodeURIComponent(cur)}`, { method: 'DELETE' }); toast('Excluído'); renderGerais(); } catch (e) { toast(e.message, true); } };
      if (g) wireSave(async () => { await api(`/api/general-contexts/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#g-title').value, body_md: $('#g-body').value, tipo: $('#g-tipo').value } }); return false; });
    };
    draw();
  }


  // ── Fase 2: pessoais ───────────────────────────────────────────────────
  async function renderPessoais() {
    const rows = await api('/api/pessoais');
    app.innerHTML = `<div class="head"><div><h1>Templates pessoais</h1><p class="muted sm">Salvos pelo agente com <code>salvar_template</code>. Só o dono usa no MCP. ${isEditor() ? 'Promova o que merece virar padrão de todos; remova o que ninguém usa.' : 'Editores podem promover o seu para todos.'}</p></div></div>
      <div class="card"><table><thead><tr><th>Template</th><th>Dono</th><th>Versão</th><th>Gerações</th><th>Aprofund.</th><th></th></tr></thead><tbody>
      ${rows.map((t) => `<tr data-s="${esc(t.slug)}"><td><a href="#/t/${esc(t.slug)}"><b>${esc(t.name)}</b></a><br><code>${esc(t.slug)}</code></td><td>${esc(t.owner_email)}</td><td>${t.published_number ? `v${t.published_semver || t.published_number}` : '—'}</td><td>${t.geracoes}</td><td>${t.aprofundamentos}</td>
        <td class="row" style="justify-content:flex-end">${isEditor() ? '<button class="btn btn-p" data-promote>Promover para todos</button>' : ''}${isEditor() || t.owner_email === me.email ? '<button class="btn btn-ghost btn-danger" data-del>Remover</button>' : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nenhum template pessoal.</td></tr>'}
      </tbody></table></div>`;
    for (const tr of app.querySelectorAll('tr[data-s]')) {
      const slug = tr.dataset.s;
      const pr = tr.querySelector('[data-promote]'); if (pr) pr.onclick = async () => {
        if (!confirm(`Promover "${slug}" para toda a organização? Passa a aparecer para todos no MCP.`)) return;
        try { await api(`/api/templates/${encodeURIComponent(slug)}/promover`, { method: 'POST', body: {} }); toast('Promovido'); renderPessoais(); }
        catch (e) { if (/já existe/.test(e.message)) { const ns = prompt(`O slug "${slug}" já existe na organização. Novo slug:`); if (ns) { try { await api(`/api/templates/${encodeURIComponent(slug)}/promover`, { method: 'POST', body: { novo_slug: ns } }); toast('Promovido como ' + ns); renderPessoais(); } catch (e2) { toast(e2.message, true); } } } else toast(e.message, true); }
      };
      const dl = tr.querySelector('[data-del]'); if (dl) dl.onclick = async () => { if (!confirm(`Remover "${slug}"? A atividade dele fica no histórico.`)) return; try { await api(`/api/templates/${encodeURIComponent(slug)}`, { method: 'DELETE' }); toast('Removido'); renderPessoais(); } catch (e) { toast(e.message, true); } };
    }
  }

  // ── Fase 2: atividade ──────────────────────────────────────────────────
  const EVENTO_LABEL = { geracao: 'Geração', aprofundamento: 'Aprofundamento', edicao: 'Edição', sugestao: 'Sugestão', feedback: 'Feedback de uso' };
  const VEREDITO_LABEL = { exemplo: 'exemplo', regra: 'virou regra', descarte: 'descartado', ok: 'revisado' };
  const VEREDITO_PILL = { exemplo: 'pub', regra: 'editor', descarte: 'off', ok: 'leitor' };
  const TRIAGEM = [
    ['sem', 'sem veredito', { evento: 'aprofundamento,sugestao,feedback', veredito: 'sem' }],
    ['tudo', 'tudo', {}],
    ['exemplos', 'exemplos', { veredito: 'exemplo' }],
    ['descartados', 'descartados', { descartado: '1' }],
  ];
  const POR_PAGINA = 20;

  /** Filtros da atividade: o segmento manda; busca, template e cliente refinam. */
  function filtroAtividade(p) {
    const seg = TRIAGEM.some(([k]) => k === p.get('seg')) ? p.get('seg') : 'sem';
    const q = new URLSearchParams(TRIAGEM.find(([k]) => k === seg)[2]);
    for (const k of ['slug', 'cliente', 'email', 'busca']) if (p.get(k)) q.set(k, p.get(k));
    return { seg, q };
  }

  async function renderAtividade() {
    skeleton('rows');
    const p = params();
    const { seg, q } = filtroAtividade(p);
    const pag = Math.max(1, Number(p.get('pag') || 1));
    const qRows = new URLSearchParams(q); qRows.set('limit', String(POR_PAGINA)); qRows.set('offset', String((pag - 1) * POR_PAGINA));
    const [rows, resumo, templates] = await Promise.all([
      api('/api/atividade?' + qRows.toString()),
      api('/api/atividade/resumo?' + q.toString()),
      api('/api/templates'),
    ]);
    const ir = (mudanca) => {
      const p2 = new URLSearchParams(p);
      for (const [k, v] of Object.entries(mudanca)) { if (v) p2.set(k, v); else p2.delete(k); }
      if (!('pag' in mudanca)) p2.delete('pag');
      location.hash = '#/atividade?' + p2.toString();
    };
    const paginas = Math.max(1, Math.ceil(resumo.total / POR_PAGINA));

    app.innerHTML = `<div class="head"><div><h1>Atividade</h1><p class="muted sm">O que os agentes registraram. Cada item vira exemplo aprovado, regra nova ou descarte — é aqui que o template aprende.${isEditor() ? '' : ' Você vê só as suas entradas.'}</p></div>
      ${isEditor() ? '<a class="btn" href="#/saude">Saúde dos templates →</a>' : ''}</div>
      ${isEditor() && resumo.sem_veredito ? `<div class="card row" style="margin-bottom:8px"><span class="dot"></span><b class="sm" style="color:var(--amber)">${resumo.sem_veredito} ${resumo.sem_veredito === 1 ? 'item sem veredito' : 'itens sem veredito'}</b>
        <span class="muted sm">triagem pendente desde ${esc(fmtAt(resumo.desde))}</span>
        <button class="btn" id="fila" style="margin-left:auto">Revisar em sequência</button></div>` : ''}
      <div class="filters">
        <span class="search"><input id="f-busca" placeholder="buscar pergunta, cliente, e-mail" value="${esc(p.get('busca') || '')}"></span>
        <span class="seg">${TRIAGEM.map(([k, l]) => `<button data-seg="${k}" class="${k === seg ? 'on' : ''}">${l}</button>`).join('')}</span>
        <select id="f-slug" style="width:200px"><option value="">todos os templates</option>${templates.map((t) => `<option value="${esc(t.slug)}" ${p.get('slug') === t.slug ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        ${isEditor() ? `<input id="f-email" placeholder="e-mail" style="width:170px" value="${esc(p.get('email') || '')}">` : ''}
        <span class="count">${resumo.total} ${resumo.total === 1 ? 'entrada' : 'entradas'}</span>
      </div>
      <div class="list-cards">${rows.map((r) => cardAtividade(r)).join('') || '<div class="empty">Nada com esse filtro.</div>'}</div>
      ${paginas > 1 ? `<div class="pager"><span class="muted sm">${(pag - 1) * POR_PAGINA + 1}–${Math.min(pag * POR_PAGINA, resumo.total)} de ${resumo.total}</span>
        <span class="pages"><button data-pag="${pag - 1}" ${pag === 1 ? 'disabled' : ''}>←</button>
        ${Array.from({ length: paginas }, (_, i) => i + 1).filter((n) => n === 1 || n === paginas || Math.abs(n - pag) <= 1).map((n) => `<button data-pag="${n}" class="${n === pag ? 'on' : ''}">${n}</button>`).join('')}
        <button data-pag="${pag + 1}" ${pag === paginas ? 'disabled' : ''}>→</button></span></div>` : ''}`;

    for (const b of app.querySelectorAll('[data-seg]')) b.onclick = () => ir({ seg: b.dataset.seg });
    for (const b of app.querySelectorAll('[data-pag]')) if (!b.disabled) b.onclick = () => ir({ pag: b.dataset.pag });
    $('#f-slug').onchange = () => ir({ slug: $('#f-slug').value });
    const em = $('#f-email'); if (em) em.onchange = () => ir({ email: em.value.trim() });
    const bs = $('#f-busca');
    bs.onkeydown = (e) => { if (e.key === 'Enter') ir({ busca: bs.value.trim() }); };
    bs.onblur = () => { if ((bs.value.trim() || '') !== (p.get('busca') || '')) ir({ busca: bs.value.trim() }); };
    const fl = $('#fila'); if (fl) fl.onclick = async () => {
      const fila = await api('/api/atividade?evento=aprofundamento,sugestao,feedback&veredito=sem&limit=100');
      if (!fila.length) { toast('Nada para revisar'); return; }
      location.hash = `#/atividade/${fila[fila.length - 1].id}?fila=1`;
    };
    for (const el of app.querySelectorAll('[data-acao]')) el.onclick = (e) => { e.preventDefault(); acaoTriagem(el.dataset.acao, el.dataset.id); };
  }

  /** Um item da triagem: o que foi perguntado, o que o agente respondeu e o que fazer com isso. */
  function cardAtividade(r) {
    const triavel = r.evento === 'aprofundamento' || r.evento === 'sugestao' || r.evento === 'feedback';
    const pend = triavel && !r.veredito;
    const med = r.resumo.medida || null;
    const titulo = r.resumo.pergunta || (r.evento === 'sugestao' ? `[${TIPO_REGRA[r.resumo.tipo] || r.resumo.tipo || 'regra'}] ${r.resumo.titulo || ''}` : '')
      || (r.evento === 'feedback' ? `Feedback de uso · nota ${r.resumo.nota ?? '—'}/5${r.resumo.custou_n ? ` · ${r.resumo.custou_n} ${r.resumo.custou_n === 1 ? 'pedido' : 'pedidos'}` : ''}` : '')
      || (r.resumo.resultado && r.resumo.resultado.titulo) || EVENTO_LABEL[r.evento] || r.evento;
    const corpoFb = r.evento === 'feedback' && med ? `${r.resumo.resumo_fb ? esc(r.resumo.resumo_fb) + ' — ' : ''}rodadas: ${med.apresentacao ?? 0} apresentação · ${med.filtro ?? 0} filtro · ${med.analise ?? 0} análise` : '';
    return `<div class="acard ${pend ? 'pend' : r.veredito ? 'done' : ''}">
      <div class="meta"><span class="pill ${r.evento === 'aprofundamento' ? 'editor' : 'leitor'}">${esc(EVENTO_LABEL[r.evento] || r.evento)}</span>
        <span>${esc(r.slug)} v${r.version_number ?? '?'}</span><span>· ${esc(fmtAt(r.at))} · ${esc(r.email)}${r.cliente ? ` · cliente ${esc(r.cliente)}` : ''}</span>
        ${r.veredito ? `<span class="pill ${VEREDITO_PILL[r.veredito]}">${esc(VEREDITO_LABEL[r.veredito])}</span>` : ''}
        ${r.descartado && r.veredito !== 'descarte' ? '<span class="pill off">descartado</span>' : ''}
        <span style="margin-left:auto;font-size:13px;color:${r.avaliacao >= 4 ? 'var(--green)' : r.avaliacao ? 'var(--amber)' : 'var(--ink-faint)'}">${r.avaliacao ?? '—'}</span></div>
      <p class="q">${esc(titulo)}</p>
      <p class="a">${corpoFb || esc(r.resumo.resposta || r.resumo.corpo || r.resumo.mudanca || (r.motivo ? `motivo: ${r.motivo}` : '') || '—')}</p>
      <div class="foot"><a href="#/atividade/${esc(r.id)}">${triavel ? 'Abrir revisão' : 'Ver detalhe'}</a>
        ${isEditor() && triavel ? `<span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          ${r.evento === 'feedback' ? (r.veredito ? '' : `<button class="btn btn-ok" data-acao="ok" data-id="${esc(r.id)}">Marcar revisado</button>`) : r.evento === 'sugestao' ? (r.virou_regra ? '' : `<button class="btn btn-rule" data-acao="aceitar" data-id="${esc(r.id)}">Aceitar como entrada</button>`) : `
          ${r.virou_exemplo ? '' : `<button class="btn btn-ok" data-acao="exemplo" data-id="${esc(r.id)}">Virar exemplo</button>`}
          ${r.virou_regra ? '' : `<button class="btn btn-rule" data-acao="regra" data-id="${esc(r.id)}">Virar regra</button>`}`}
          ${r.descartado ? '' : `<button class="btn btn-drop" data-acao="descarte" data-id="${esc(r.id)}">Descartar</button>`}</span>` : ''}</div></div>`;
  }

  /** As três decisões da triagem, iguais no card e na tela de revisão. */
  async function acaoTriagem(acao, id) {
    try {
      if (acao === 'exemplo') { const r = await api(`/api/atividade/${id}/virar-exemplo`, { method: 'POST' }); toast('Exemplo no guia do rascunho'); return r; }
      if (acao === 'aceitar') { const r = await api(`/api/atividade/${id}/virar-regra`, { method: 'POST', body: {} }); toast('Entrada criada no rascunho'); return r; }
      if (acao === 'regra') {
        const texto = prompt('A regra em uma frase (vira uma entrada na aba Regras):');
        if (texto === null || !texto.trim()) return null;
        const r = await api(`/api/atividade/${id}/virar-regra`, { method: 'POST', body: { texto } }); toast('Regra criada no rascunho'); return r;
      }
      if (acao === 'descarte') {
        const motivo = prompt('Por que descartar? (entra na taxa de descarte do template)');
        if (motivo === null) return null;
        const r = await api(`/api/atividade/${id}/descartar`, { method: 'POST', body: { motivo } }); toast('Descartado'); return r;
      }
      if (acao === 'ok') { await api(`/api/atividade/${id}`, { method: 'PATCH', body: { veredito: 'ok' } }); toast('Marcado como revisado'); return { ok: true }; }
    } catch (e) { toast(e.message, true); return null; }
    return null;
  }

  async function renderAtividadeDetalhe(id) {
    skeleton('doc');
    let a; try { a = await api(`/api/atividade/${encodeURIComponent(id)}`); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const d = a.dados || {};
    const naFila = params().get('fila') === '1';
    let fila = [];
    if (naFila) { try { fila = await api('/api/atividade?evento=aprofundamento,sugestao,feedback&veredito=sem&limit=100'); } catch { fila = []; } }
    const ordem = [...fila].reverse();                       // mais antigo primeiro: a fila anda para frente no tempo
    const i = ordem.findIndex((x) => x.id === a.id);
    const vizinho = (passo) => (i >= 0 && ordem[i + passo] ? ordem[i + passo].id : null);
    const vaiPara = (aid) => { location.hash = aid ? `#/atividade/${aid}?fila=1` : '#/atividade'; };

    const consultas = Array.isArray(d.consultas) && d.consultas.length
      ? `<div class="card" style="padding:0;overflow:hidden"><div style="padding:11px 14px;border-bottom:1px solid var(--line);background:var(--zebra)" class="kicker">Consultas usadas</div>
         <pre style="padding:14px;margin:0;overflow:auto;color:var(--ink-soft)">${esc(JSON.stringify(d.consultas, null, 2))}</pre></div>` : '';
    const PRIO_PILL = { alta: 'off', media: 'draft', baixa: 'leitor' };
    const corpo = a.evento === 'feedback'
      ? `<div class="card"><div class="kicker">Medida do uso</div><div class="row" style="gap:18px"><span><b style="font-size:20px">${esc(d.nota ?? '—')}</b><span class="muted sm">/5 nota</span></span>
           ${d.medida ? `<code class="sm">${d.medida.apresentacao ?? 0} apresentação · ${d.medida.filtro ?? 0} filtro · ${d.medida.analise ?? 0} análise${d.medida.total ? ` · ${d.medida.total} rodadas` : ''}</code>` : ''}</div>
           ${d.resumo ? `<p class="sm muted" style="margin-top:8px">${esc(d.resumo)}</p>` : ''}</div>
         ${Array.isArray(d.segurou) && d.segurou.length ? `<div class="card"><div class="kicker">O que segurou bem (manter)</div><ul class="sm" style="margin:0;padding-left:18px">${d.segurou.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
         ${Array.isArray(d.custou) && d.custou.length ? `<div class="card" style="padding:0;overflow:hidden"><div class="kicker" style="padding:11px 14px;border-bottom:1px solid var(--line);background:var(--zebra);margin:0">O que custou rodada do consultor</div>
           <table><thead><tr><th>Prioridade</th><th>O que custou</th><th>Pedido (o que mudar no kit)</th><th></th></tr></thead><tbody>
           ${d.custou.map((c, i) => `<tr><td><span class="pill ${PRIO_PILL[c.prioridade] || 'draft'}">${esc(c.prioridade || 'media')}</span>${c.rodadas ? `<br><code class="sm muted">${c.rodadas} rodadas</code>` : ''}</td><td class="sm">${esc(c.item || '')}</td><td class="sm">${esc(c.pedido || '')}</td>
             <td>${isEditor() ? `<button class="btn btn-rule" data-sugerir="${i}">Virar sugestão</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`
      : a.evento === 'sugestao'
      ? `<div class="card"><div class="kicker">Sugestão do agente</div><p class="sm"><span class="pill ${PILL_TIPO[d.tipo] || 'pub'}">${esc(TIPO_REGRA[d.tipo] || d.tipo || 'regra')}</span></p><p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(d.corpo || '—')}</p>${d.motivo ? `<p class="muted sm" style="margin-top:10px">Motivo: ${esc(d.motivo)}</p>` : ''}</div>`
      : a.evento === 'aprofundamento'
      ? `<div class="card"><div class="kicker">Resposta entregue ao consultor</div><p style="margin:0;font-size:14px;line-height:1.6;white-space:pre-wrap;text-wrap:pretty">${esc(d.resposta || '—')}</p></div>${consultas}`
      : `<div class="card"><div class="kicker">Registro</div><pre style="white-space:pre-wrap;color:var(--ink-soft)">${esc(JSON.stringify(d, null, 2))}</pre></div>`;

    const sugestao = a.evento === 'sugestao';
    const feedback = a.evento === 'feedback';
    const decisao = isEditor() && (a.evento === 'aprofundamento' || sugestao || feedback) ? `<div class="card"><div class="kicker">Seu veredito</div>
      ${a.veredito ? `<p class="sm"><span class="pill ${VEREDITO_PILL[a.veredito]}">${esc(VEREDITO_LABEL[a.veredito])}</span> por ${esc(a.veredito_por || '—')} em ${esc(fmtAt(a.veredito_em))}</p>` : ''}
      ${feedback ? '<button class="choice ok" data-acao="ok"><b>Marcar revisado</b><span>Os itens que valem viram sugestão (botão na tabela) e seguem para o rascunho</span></button>' : ''}
      ${sugestao || feedback || a.virou_exemplo ? '' : '<button class="choice ok" data-acao="exemplo"><b>Virar exemplo aprovado</b><span>Entra no guia.md do kit</span></button>'}
      ${a.virou_regra || feedback ? '' : (sugestao ? '<button class="choice rule" data-acao="aceitar"><b>Aceitar como entrada</b><span>Vira entrada no rascunho com o tipo e o título sugeridos</span></button>' : '<button class="choice rule" data-acao="regra"><b>Virar regra</b><span>Vira uma entrada na aba Regras do rascunho</span></button>')}
      ${a.descartado ? '' : '<button class="choice drop" data-acao="descarte"><b>Descartar</b><span>Sai do kit e conta na taxa de descarte</span></button>'}
      <label>Sua nota e o motivo</label>
      <div class="scores">${[1, 2, 3, 4, 5].map((n) => `<button data-nota="${n}" class="${a.editor_nota === n ? 'on' : ''}">${n}</button>`).join('')}</div>
      <textarea id="ec" placeholder="o que faltou ou o que acertou" style="min-height:70px">${esc(a.editor_comentario || '')}</textarea>
      <button class="btn btn-p" id="salvar" style="width:100%;margin-top:10px;justify-content:center">${naFila && vizinho(1) ? 'Salvar e ir ao próximo' : 'Salvar veredito'}</button></div>` : '';

    app.innerHTML = `<div class="row sm" style="margin-bottom:14px"><a href="#/atividade"><code>← atividade</code></a>
      ${naFila && i >= 0 ? `<code class="muted">item ${i + 1} de ${ordem.length} sem veredito</code>
        <span style="margin-left:auto;display:flex;gap:6px"><button class="btn" id="ant" ${vizinho(-1) ? '' : 'disabled'}>anterior</button><button class="btn" id="prox" ${vizinho(1) ? '' : 'disabled'}>próximo →</button></span>` : ''}</div>
      <h1 style="max-width:34ch">${esc(d.pergunta || d.titulo || (a.evento === 'feedback' ? `Feedback de uso · ${a.slug}` : '') || EVENTO_LABEL[a.evento] || a.evento)}</h1>
      <div class="row sm" style="margin-bottom:22px"><span class="pill ${a.evento === 'aprofundamento' ? 'editor' : 'leitor'}">${esc(EVENTO_LABEL[a.evento] || a.evento)}</span>
        <code>${esc(a.slug)} v${a.version_number ?? '?'}</code><code class="muted">· ${esc(a.email)} · ${esc(fmtAt(a.at))}${a.cliente ? ` · cliente ${esc(a.cliente)}` : ''}</code>
        ${a.avaliacao ? `<span class="pill pub">nota da pessoa ${a.avaliacao}</span>` : ''}${a.descartado ? `<span class="pill off">descartado</span> <span class="muted">${esc(a.motivo || '')}</span>` : ''}</div>
      <div class="two"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">${corpo}</div>
        <div class="side-col">${decisao}
          <div class="card"><div class="kicker">Contexto do template</div>
            <p class="sm muted" style="margin-bottom:10px">O kit que respondeu isso é o <code>${esc(a.slug)}</code> v${a.version_number ?? '?'}.</p>
            <a class="sm" href="#/t/${esc(a.slug)}/regras" style="font-weight:600">Ajustar ${esc(a.slug)} →</a></div></div></div>`;

    for (const el of app.querySelectorAll('[data-acao]')) el.onclick = async () => { const r = await acaoTriagem(el.dataset.acao, a.id); if (r) { if (naFila && vizinho(1)) vaiPara(vizinho(1)); else route(); } };
    for (const el of app.querySelectorAll('[data-sugerir]')) el.onclick = async () => {
      try { await api(`/api/atividade/${a.id}/sugerir`, { method: 'POST', body: { indice: Number(el.dataset.sugerir) } }); toast('Virou sugestão: está na fila de triagem'); el.textContent = 'na fila'; el.disabled = true; }
      catch (e) { toast(e.message, true); }
    };
    let nota = a.editor_nota;
    for (const b of app.querySelectorAll('[data-nota]')) b.onclick = () => { nota = Number(b.dataset.nota); for (const x of app.querySelectorAll('[data-nota]')) x.classList.toggle('on', x === b); };
    const sv = $('#salvar'); if (sv) sv.onclick = async () => {
      try {
        await api(`/api/atividade/${a.id}`, { method: 'PATCH', body: { editor_nota: nota ?? null, editor_comentario: $('#ec').value, veredito: a.veredito || 'ok' } });
        toast('Veredito salvo');
        if (naFila && vizinho(1)) vaiPara(vizinho(1)); else route();
      } catch (e) { toast(e.message, true); }
    };
    const an = $('#ant'); if (an && !an.disabled) an.onclick = () => vaiPara(vizinho(-1));
    const px = $('#prox'); if (px && !px.disabled) px.onclick = () => vaiPara(vizinho(1));
  }

  /** Saúde: descarte alto e pergunta repetida são o mesmo sintoma — o template não entrega algo. */
  async function renderSaude() {
    if (!isEditor()) { app.innerHTML = '<div class="empty">Só editores.</div>'; return; }
    skeleton('doc');
    const { templates, lacunas } = await api('/api/saude');
    const pct = (t) => (t.aprofundamentos ? Math.round(100 * t.descartados / t.aprofundamentos) : 0);
    app.innerHTML = `<div class="row sm" style="margin-bottom:14px"><a href="#/atividade"><code>← atividade</code></a></div>
      <div class="head"><div><h1>Saúde dos templates</h1></div><a class="btn" href="#/uso">Uso por versão →</a></div><p class="muted sm" style="max-width:66ch;margin:-14px 0 22px">Descarte alto e pergunta repetida são o mesmo sintoma: o template não entrega algo que o consultor precisa. Comece pelo topo da lista.</p>
      <div class="card"><table><thead><tr><th>Template</th><th>Ger.</th><th>Aprof.</th><th>Descarte</th><th>Sem veredito</th><th>Nota</th><th>Feedback</th></tr></thead><tbody>
      ${templates.map((t) => `<tr><td><a href="#/t/${esc(t.slug)}"><code>${esc(t.slug)}</code></a><br><span class="sm muted">${t.published_semver ? `v${esc(t.published_semver)}` : 'sem publicada'}</span></td>
        <td><code>${t.geracoes}</code></td><td><code>${t.aprofundamentos}</code></td>
        <td><span class="row" style="gap:8px;flex-wrap:nowrap"><span class="bar ${pct(t) >= 50 ? 'bad' : pct(t) >= 25 ? 'mid' : ''}"><span style="width:${pct(t)}%"></span></span><code class="sm">${t.aprofundamentos ? pct(t) + '%' : '—'}</code></span></td>
        <td>${t.sem_veredito ? `<a href="#/atividade?seg=sem&slug=${esc(t.slug)}"><code>${t.sem_veredito}</code></a>` : '<code class="muted">0</code>'}</td>
        <td><code>${t.nota_media != null ? t.nota_media.toFixed(1) : '—'}</code></td>
        <td>${t.feedbacks ? `<a href="#/atividade?seg=tudo&slug=${esc(t.slug)}"><code>${t.feedbacks}× · ${t.nota_feedback != null ? Number(t.nota_feedback).toFixed(1) : '—'}</code></a>` : '<code class="muted">—</code>'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem uso registrado.</td></tr>'}
      </tbody></table></div>
      <h2>Lacunas · perguntas que o template não responde sozinho</h2>
      <div class="grid">${lacunas.map((l) => `<div class="card"><div class="row sm"><code class="muted">${esc(l.slug)}</code><code class="muted" style="margin-left:auto">${l.n}× perguntada</code></div>
        <p style="font-weight:600;margin:8px 0 6px;text-wrap:pretty">${esc(l.pergunta)}</p>
        <p class="muted sm">Repetida em aprofundamentos: vale virar bloco fixo do relatório ou regra do kit.</p>
        <a class="btn" href="#/t/${esc(l.slug)}/documento">Criar seção no template</a></div>`).join('') || '<div class="empty">Nenhuma pergunta repetiu até agora.</div>'}</div>`;
  }

  async function renderUso() {
    if (!isEditor()) { app.innerHTML = '<div class="empty">Só editores.</div>'; return; }
    const u = await api('/api/uso');
    app.innerHTML = `<div class="head"><div><h1>Uso por template</h1><p class="muted sm">Gerações, aprofundamentos, descartes e notas por versão. As perguntas mais frequentes dizem o que o template ainda não entrega.</p></div><a class="btn" href="#/atividade">← Atividade</a></div>
      <div class="card"><table><thead><tr><th>Template</th><th>Versão</th><th>Gerações</th><th>Aprofund.</th><th>Descartados</th><th>Nota média</th><th>Avaliações</th></tr></thead><tbody>
      ${u.stats.map((s) => `<tr><td><a href="#/t/${esc(s.slug)}"><code>${esc(s.slug)}</code></a></td><td>v${s.version_number ?? '?'}</td><td>${s.geracoes}</td><td>${s.aprofundamentos}</td><td>${s.aprofundamentos ? Math.round(100 * s.descartados / s.aprofundamentos) + '%' : '—'}</td><td>${s.nota_media != null ? s.nota_media.toFixed(1) : '—'}</td><td>${s.avaliacoes}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem uso registrado.</td></tr>'}
      </tbody></table></div>
      <h2>Perguntas de aprofundamento mais frequentes</h2>
      <div class="card"><table><thead><tr><th>Template</th><th>Pergunta</th><th>Vezes</th></tr></thead><tbody>
      ${u.top_perguntas.map((p) => `<tr><td><code>${esc(p.slug)}</code></td><td>${esc(p.pergunta)}</td><td>${p.n}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">—</td></tr>'}
      </tbody></table></div>`;
  }

  // ── Fase 2: versões (aba do editor) ────────────────────────────────────
  function paneVersoes({ slug, canEdit }, el) {
    (async () => {
      const vs = await api(`/api/templates/${encodeURIComponent(slug)}/versoes`);
      el.innerHTML = `<div class="split"><div class="card"><table><thead><tr><th>v</th><th>Estado</th><th>Autor</th><th>Quando</th><th>Nota de mudança</th><th></th></tr></thead><tbody>
        ${vs.map((v) => `<tr><td><b>${v.semver ? `v${v.semver}` : 'rascunho'}</b> <span class="muted sm">nº ${v.number}</span></td><td>${v.state === 'published' ? '<span class="pill pub">publicada</span>' : '<span class="pill draft">rascunho</span>'}</td><td class="sm">${esc(v.author_email || '—')}</td><td class="sm muted">${esc((v.published_at || v.created_at).slice(0, 16).replace('T', ' '))}</td><td class="sm">${esc(v.changelog || '')}</td>
          <td class="row" style="justify-content:flex-end"><button class="btn btn-ghost" data-cmp="${v.number}">comparar com…</button>${canEdit && v.state === 'published' ? `<button class="btn" data-restore="${v.number}">Restaurar</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div><div class="card" id="diff"><div class="empty">Escolha "comparar com…" numa versão.</div></div></div>`;
      el.querySelector('.split').style.gridTemplateColumns = '1fr 1fr';
      for (const b of el.querySelectorAll('[data-cmp]')) b.onclick = async () => {
        const to = Number(b.dataset.cmp);
        const from = Number(prompt(`Comparar a v${to} com qual versão?`, String(Math.max(1, to - 1))));
        if (!from) return;
        try {
          const d = await api(`/api/templates/${encodeURIComponent(slug)}/versoes/diff?de=${from}&para=${to}`);
          const item = (x) => `<h3>${x.kind === 'added' ? '＋' : x.kind === 'removed' ? '－' : '±'} <code>${esc(x.path)}</code> <span class="muted sm">${x.kind}</span></h3>${x.lines ? `<pre style="font-size:12px;max-height:320px">${x.lines.map((l) => `<span style="color:${l.startsWith('+') ? '#3B6D11' : l.startsWith('-') ? '#B42318' : '#9CA3AF'}">${esc(l)}</span>`).join('\n')}</pre>` : ''}`;
          $('#diff').innerHTML = `<h2 style="margin-top:0">v${from} → v${to}</h2>${d.manifest ? item(d.manifest) : ''}${d.tasks.map((t) => item({ ...t, path: 'contexto/' + t.path })).join('')}${d.files.map(item).join('') || (!d.manifest && !d.tasks.length ? '<p class="muted">Sem diferenças.</p>' : '')}`;
        } catch (e) { toast(e.message, true); }
      };
      for (const b of el.querySelectorAll('[data-restore]')) b.onclick = async () => {
        const nv = b.dataset.restore;
        if (!confirm(`Restaurar a v${nv} como novo rascunho? O rascunho atual (se houver) é substituído; a publicada não muda até você publicar.`)) return;
        try { await api(`/api/templates/${encodeURIComponent(slug)}/versoes/${nv}/restaurar`, { method: 'POST' }); toast('Rascunho criado a partir da v' + nv); location.hash = `#/t/${slug}/guia`; } catch (e) { toast(e.message, true); }
      };
    })();
  }

  // ── design system vivo (spec 006): galeria + regras + contrato + versões ──
  const DS = 'design-system';
  const DS_TABS = [['galeria', 'Galeria'], ['regras', 'Regras'], ['contrato', 'Contrato'], ['versoes', 'Versões']];
  const GRUPOS_DS = { numeros: 'Números', graficos: 'Gráficos e tabelas', funil: 'Funil e listas', narrativa: 'Narrativa' };

  async function renderDesign(tab, sub) {
    tab = DS_TABS.some(([k]) => k === tab) ? tab : 'galeria';
    skeleton('doc');
    let data;
    try { data = await loadKit(DS); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const { template: t, kit, state } = data;
    const v = kit ? kit.version : null;
    const canEdit = isEditor();
    app.innerHTML = `<div class="head">
      <div><h1>Design system</h1>
        <div class="row sm"><span class="muted">${kit ? (state === 'draft' ? `Editando o <b>rascunho</b> (nº ${v.number})` : `Vendo a <b>publicada v${v.semver || v.number}</b>`) : 'Sem versão'}</span>
        ${t.published_version_id ? '<span class="pill pub">publicada</span>' : '<span class="pill off">sem publicada</span>'}${t.draft_version_id ? '<span class="pill draft">rascunho</span>' : ''}
        <span class="muted">· entra em todo kit como <code>design-system.md</code> e no MCP como <code>contrato://widgets</code></span></div></div>
      <div class="row">${canEdit && !t.draft_version_id && t.published_version_id ? '<button class="btn" id="mkdraft">Criar rascunho</button>' : ''}
        ${canEdit && t.draft_version_id ? '<button class="btn btn-p" id="publish">Publicar rascunho</button>' : ''}</div></div>
      <div class="tabs">${DS_TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="pane"></div>`;
    for (const b of app.querySelectorAll('.tab')) b.onclick = () => { location.hash = `#/design/${b.dataset.tab}`; };
    const mk = $('#mkdraft'); if (mk) mk.onclick = async () => { try { await api(`/api/templates/${DS}/draft`, { method: 'POST' }); toast('Rascunho criado'); route(); } catch (e) { toast(e.message, true); } };
    const pb = $('#publish'); if (pb) pb.onclick = () => publicarModal(t, v);
    if (!kit) { $('#pane').innerHTML = '<div class="empty">O design system ainda não foi semeado (node scripts/seed.mjs).</div>'; return; }
    const ctx = { slug: DS, kit, canEdit, state, sub };
    ({ galeria: paneGaleria, regras: (c, e) => paneRegras({ ...c, tipos: ['regra', 'recomendacao', 'definicao'] }, e), contrato: paneSingle('contrato.md'), versoes: paneVersoes })[tab](ctx, $('#pane'));
    // as abas de regras/versões montam links #/t/<slug>/…; aqui a rota é #/design/…
    for (const b of app.querySelectorAll('#pane .list button')) b.onclick = () => { location.hash = `#/design/${tab}/${encodeURIComponent(b.dataset.id || b.dataset.s || '')}`; };
  }

  /** Galeria: o viewer renderiza os elementos (o que a UI mostra é o que o agente produz);
   *  o editor lateral muda o JSON do elemento e pré-visualiza na hora, sem salvar. */
  function paneGaleria({ kit, canEdit, state, sub }, el) {
    const els = kit.files.filter((f) => f.path.startsWith('elementos/') && f.path.endsWith('.json')).map((f) => { try { return JSON.parse(f.content); } catch { return null; } }).filter(Boolean)
      .sort((a, b) => (a.sort ?? 999) - (b.sort ?? 999) || String(a.id).localeCompare(String(b.id)));
    let cur = els.some((e) => e.id === sub) ? sub : (els[0] ? els[0].id : null);
    const draw = () => {
      const e = els.find((x) => x.id === cur);
      const grupos = [...new Set(els.map((x) => x.grupo))];
      el.innerHTML = `<p class="muted sm">Cada elemento é uma <b>chamada do <code>relatorio.py</code></b> e o widget que ela produz. O que aparece aqui é renderizado pelo mesmo viewer dos relatórios. Edite o JSON e <b>pré-visualize</b> sem salvar; salve no rascunho quando estiver certo.</p>
        <div class="split" style="grid-template-columns:230px 1fr">
          <div class="card"><div class="list">${grupos.map((g) => `<div class="nav-lbl" style="color:var(--ink-faint);padding:8px 10px 4px">${esc(GRUPOS_DS[g] || g)}</div>${els.filter((x) => x.grupo === g).map((x) => `<button data-id="${esc(x.id)}" class="${x.id === cur ? 'on' : ''}">${esc(x.title)}<br><code>${esc(x.id)}</code></button>`).join('')}`).join('')}</div>
            ${canEdit ? '<div class="actions"><button class="btn" id="newel">+ Elemento</button></div>' : ''}</div>
          <div style="min-width:0">
            <div class="card" style="padding:0;overflow:hidden;height:560px"><iframe id="gal" title="Galeria" src="/design/preview?state=${state}&el=${encodeURIComponent(cur || '')}" style="width:100%;height:100%;border:0"></iframe></div>
            ${e ? `<div class="card" style="margin-top:12px">
              <div class="row" style="justify-content:space-between"><b>${esc(e.title)}</b><code class="muted">${esc(e.grupo)} · ${esc(e.id)}</code></div>
              ${e.desc ? `<p class="muted sm" style="margin:6px 0 0">${esc(e.desc)}</p>` : ''}
              ${e.call ? `<label>Chamada (relatorio.py)</label><pre style="white-space:pre-wrap;background:var(--zebra);border:1px solid var(--line-soft);border-radius:var(--r-sm);padding:10px">${esc(e.call)}</pre>` : ''}
              <label>Elemento (JSON: title, desc, call, widgets, layout, dataset)</label>${editorBlock('el-json', JSON.stringify(e, null, 1), 'code', true)}
              <div class="actions"><button class="btn" id="el-prev">Pré-visualizar</button>${canEdit ? '<button class="btn btn-ghost btn-danger" id="el-del">Excluir</button><button class="btn btn-p" id="el-save">Salvar no rascunho</button>' : ''}</div></div>` : ''}
          </div></div>`;
      $('#el-json') && ($('#el-json').style.minHeight = '260px');
      for (const b of el.querySelectorAll('.list button')) b.onclick = () => { location.hash = `#/design/galeria/${encodeURIComponent(b.dataset.id)}`; };
      const lerJson = () => { try { const j = JSON.parse($('#el-json').value); if (!j.id) j.id = cur; return j; } catch (err) { toast('JSON inválido: ' + err.message, true); return null; } };
      const pv = $('#el-prev'); if (pv) pv.onclick = async () => {
        const j = lerJson(); if (!j) return;
        const r = await fetch('/design/preview', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, el: j.id, elemento: j }) });
        if (!r.ok) { toast(await r.text(), true); return; }
        $('#gal').srcdoc = await r.text(); toast('Pré-visualização (não salvo)');
      };
      const sv = $('#el-save'); if (sv) sv.onclick = async () => {
        const j = lerJson(); if (!j) return;
        try { await api(`/api/templates/${DS}/draft/files/${encodeURIComponent('elementos/' + j.id + '.json')}`, { method: 'PUT', body: { content: JSON.stringify(j, null, 1) } }); toast('Elemento salvo no rascunho'); location.hash = `#/design/galeria/${encodeURIComponent(j.id)}`; route(); }
        catch (err) { toast(err.message, true); }
      };
      const dl = $('#el-del'); if (dl) dl.onclick = async () => {
        if (!confirm(`Excluir o elemento "${cur}" do rascunho?`)) return;
        try { await api(`/api/templates/${DS}/draft/files/${encodeURIComponent('elementos/' + cur + '.json')}`, { method: 'DELETE' }); toast('Elemento removido do rascunho'); location.hash = '#/design/galeria'; route(); }
        catch (err) { toast(err.message, true); }
      };
      const ne = $('#newel'); if (ne) ne.onclick = () => {
        const id = prompt('id do elemento (a-z, 0-9, hífen), ex.: kpi-tendencia'); if (!id) return;
        els.push({ id, grupo: 'narrativa', title: id, desc: '', call: '', sort: els.length,
          widgets: [{ id: `el-${id}-1`, type: 'find-note', text: 'novo elemento' }], layout: [{ id: `el-${id}-1`, type: 'find-note', x: 0, y: 0, w: 12, h: 1 }] });
        cur = id; draw();
      };
    };
    draw();
  }

  // ── documentos da plataforma (outros) ───────────────────────────────────
  async function renderPlataforma() {
    const docs = await api('/api/platform-docs');
    const canEdit = isEditor();
    let cur = docs[0] ? docs[0].slug : null;
    const draw = () => {
      const d = docs.find((x) => x.slug === cur);
      app.innerHTML = `<div class="head"><div><h1>Plataforma</h1><p class="muted sm">Documentos que valem para <b>todo</b> template e entram em todo kit (zip): o design system dos aprofundamentos (widgets, binds, layout, regras). Salvar publica na hora.</p></div></div>
        <div class="split"><div class="card"><div class="list">${docs.map((x) => `<button data-s="${esc(x.slug)}" class="${x.slug === cur ? 'on' : ''}">${esc(x.title)}<br><code>${esc(x.kit_file || x.slug)}</code></button>`).join('') || '<div class="muted sm">Nenhum.</div>'}</div>
          ${canEdit ? '<div class="actions"><button class="btn" id="newd">+ Documento</button></div>' : ''}</div>
        <div class="card">${d ? `<label>Título</label><input id="d-title" value="${esc(d.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Nome do arquivo no kit (vazio = não entra no zip)</label><input id="d-file" value="${esc(d.kit_file || '')}" ${canEdit ? '' : 'readonly'}>
          <label>Conteúdo (Markdown)</label>${editorBlock('d-body', d.body_md, '', canEdit)}
          <p class="muted sm">Atualizado ${esc((d.updated_at || '').slice(0, 16).replace('T', ' '))} por ${esc(d.author_email || '—')}</p>
          ${canEdit ? '<div class="actions"><button class="btn btn-p" id="save">Salvar e publicar</button></div>' : ''}` : '<div class="empty">Selecione um documento.</div>'}</div></div>`;
      $('#d-body') && ($('#d-body').style.minHeight = '520px');
      for (const b of app.querySelectorAll('.list button')) b.onclick = () => { cur = b.dataset.s; draw(); };
      const nd = $('#newd'); if (nd) nd.onclick = () => { const s = prompt('slug (a-z, 0-9, hífen)'); if (!s) return; docs.push({ slug: s, title: s, body_md: '', kit_file: s + '.md' }); cur = s; draw(); };
      if (d) wireSave(async () => { await api(`/api/platform-docs/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#d-title').value, body_md: $('#d-body').value, kit_file: $('#d-file').value.trim() } }); return false; });
    };
    draw();
  }

  // ── usuários ───────────────────────────────────────────────────────────
  async function renderUsuarios() {
    if (!isEditor()) { app.innerHTML = '<div class="empty">Só editores gerenciam usuários.</div>'; return; }
    const users = await api('/api/users');
    app.innerHTML = `<div class="head"><div><h1>Usuários</h1><p class="muted sm">Contas <code>@witly.digital</code> entram sozinhas como leitor. Desativar corta o MCP e a UI na próxima chamada e encerra as sessões.</p></div>
      <div class="row"><input id="u-email" placeholder="e-mail para convidar" style="width:260px"><select id="u-role" style="width:120px"><option value="leitor">leitor</option><option value="editor">editor</option></select><button class="btn btn-p" id="u-add">Convidar</button></div></div>
      <div class="card"><table><thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Ativo</th><th></th></tr></thead><tbody>
      ${users.map((u) => `<tr data-e="${esc(u.email)}"><td>${esc(u.email)}</td><td>${esc(u.name || '')}</td>
        <td><select data-role ${u.email === me.email ? 'disabled' : ''}><option ${u.role === 'leitor' ? 'selected' : ''}>leitor</option><option ${u.role === 'editor' ? 'selected' : ''}>editor</option></select></td>
        <td>${u.active ? '<span class="pill pub">ativo</span>' : '<span class="pill off">desativado</span>'}</td>
        <td class="row" style="justify-content:flex-end">${u.email === me.email ? '<span class="muted sm">você</span>' : `<button class="btn" data-toggle>${u.active ? 'Desativar' : 'Reativar'}</button><button class="btn btn-ghost" data-revoke>Encerrar sessões</button>`}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#u-add').onclick = async () => { try { await api('/api/users', { method: 'POST', body: { email: $('#u-email').value.trim(), role: $('#u-role').value } }); toast('Convidado'); renderUsuarios(); } catch (e) { toast(e.message, true); } };
    for (const tr of app.querySelectorAll('tr[data-e]')) {
      const email = tr.dataset.e;
      const sel = tr.querySelector('[data-role]'); if (sel && !sel.disabled) sel.onchange = async () => { try { await api(`/api/users/${encodeURIComponent(email)}`, { method: 'PATCH', body: { role: sel.value } }); toast('Papel atualizado'); } catch (e) { toast(e.message, true); renderUsuarios(); } };
      const tg = tr.querySelector('[data-toggle]'); if (tg) tg.onclick = async () => { const active = tg.textContent === 'Reativar'; if (!active && !confirm(`Desativar ${email}? O acesso ao MCP e à UI cai na próxima chamada.`)) return; try { await api(`/api/users/${encodeURIComponent(email)}`, { method: 'PATCH', body: { active } }); toast(active ? 'Reativado' : 'Desativado e sessões encerradas'); renderUsuarios(); } catch (e) { toast(e.message, true); } };
      const rv = tr.querySelector('[data-revoke]'); if (rv) rv.onclick = async () => { try { const r = await api(`/api/users/${encodeURIComponent(email)}/revoke`, { method: 'POST' }); toast(`${r.revoked} sessão(ões) encerrada(s); a pessoa terá de logar de novo`); } catch (e) { toast(e.message, true); } };
    }
  }

  boot();
})();
