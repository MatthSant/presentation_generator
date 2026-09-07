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
    const h = location.hash.replace(/^#\/?/, '');
    const [seg, slug, tab, ...rest] = h.split('/');
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
  async function renderCatalog() {
    const rows = await api('/api/templates');
    app.innerHTML = `<div class="head"><div><h1>Templates</h1><p class="muted sm">O MCP entrega ao agente só a versão <b>publicada</b>. Edições ficam num rascunho até você publicar.</p></div>
      ${isEditor() ? '<button class="btn btn-p" id="new">+ Novo template</button>' : ''}</div>
      <div class="grid">${rows.map((t) => `<a class="card tcard" href="#/t/${esc(t.slug)}">
        <div class="row" style="justify-content:space-between"><span class="t">${esc(t.name)}</span>
          <span>${t.published_number ? `<span class="pill pub">v${t.published_number}</span>` : '<span class="pill off">sem publicada</span>'} ${t.draft_number ? `<span class="pill draft">rascunho v${t.draft_number}</span>` : ''}</span></div>
        <div class="muted sm" style="margin:6px 0"><code>${esc(t.slug)}</code></div>
        <div class="sm">${esc(t.objective)}</div></a>`).join('') || '<div class="empty">Nenhum template ainda.</div>'}</div>`;
    const b = $('#new'); if (b) b.onclick = newTemplate;
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
  const TABS = [['info', 'Info'], ['manifesto', 'Manifesto'], ['contexto', 'Contexto'], ['queries', 'Queries'], ['python', 'Python'], ['documento', 'Documento'], ['guia', 'Guia'], ['exemplo', 'Exemplo']];

  async function loadKit(slug) {
    const d = await api(`/api/templates/${encodeURIComponent(slug)}?state=draft`);
    if (d.kit) return { ...d, state: 'draft' };
    const p = await api(`/api/templates/${encodeURIComponent(slug)}?state=published`);
    return { ...p, state: 'published' };
  }

  async function renderTemplate(slug, tab, sub) {
    tab = TABS.some(([k]) => k === tab) ? tab : 'info';
    let data;
    try { data = await loadKit(slug); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const { template: t, kit, state } = data;
    const v = kit ? kit.version : null;
    const canEdit = isEditor();
    app.innerHTML = `<div class="head">
      <div><a class="muted sm" href="#/">← Templates</a><h1>${esc(t.name)} <code>${esc(t.slug)}</code></h1>
        <div class="row sm"><span class="muted">${kit ? (state === 'draft' ? `Editando o <b>rascunho v${v.number}</b>` : `Vendo a <b>publicada v${v.number}</b>`) : 'Sem versão'}</span>
        ${t.published_version_id ? '<span class="pill pub">publicada</span>' : '<span class="pill off">sem publicada</span>'}${t.draft_version_id ? '<span class="pill draft">rascunho</span>' : ''}</div></div>
      <div class="row">${canEdit && !t.draft_version_id && t.published_version_id ? '<button class="btn" id="mkdraft">Criar rascunho</button>' : ''}
        ${canEdit && t.draft_version_id ? '<button class="btn btn-p" id="publish">Publicar rascunho</button>' : ''}</div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="pane"></div>`;
    for (const b of app.querySelectorAll('.tab')) b.onclick = () => { location.hash = `#/t/${slug}/${b.dataset.tab}`; };
    const mk = $('#mkdraft'); if (mk) mk.onclick = async () => { try { await api(`/api/templates/${slug}/draft`, { method: 'POST' }); toast('Rascunho criado'); route(); } catch (e) { toast(e.message, true); } };
    const pb = $('#publish'); if (pb) pb.onclick = async () => {
      if (!confirm('Publicar o rascunho? O MCP passa a entregar esta versão a todos.')) return;
      try { await api(`/api/templates/${slug}/publish`, { method: 'POST' }); toast('Publicado'); route(); } catch (e) { toast(e.message, true); }
    };
    if (!kit) { $('#pane').innerHTML = '<div class="empty">Este template ainda não tem conteúdo.</div>'; return; }
    const ctx = { slug, kit, canEdit, state, sub };
    ({ info: paneInfo, manifesto: paneManifest, contexto: paneContexto, queries: paneFiles('queries/', 'sql'), python: paneFiles('python/', 'py'), documento: paneSingle('documento.md'), guia: paneSingle('guia.md'), exemplo: paneExemplo })[tab](ctx, $('#pane'));
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

  function paneContexto({ slug, kit, canEdit, sub }, el) {
    const tasks = [...kit.tasks].sort((a, b) => a.sort - b.sort);
    let cur = tasks.some((t) => t.task_id === sub) ? sub : (tasks[0] ? tasks[0].task_id : null);
    const draw = () => {
      const t = tasks.find((x) => x.task_id === cur);
      el.innerHTML = `<p class="muted sm">Uma página por tarefa de contexto: o que o agente levanta com o consultor antes de gerar. O agente recebe o texto inteiro.</p>
        <div class="split"><div class="card"><div class="list">${tasks.map((x) => `<button data-id="${esc(x.task_id)}" class="${x.task_id === cur ? 'on' : ''}">${esc(x.title)}<br><code>${esc(x.task_id)}</code></button>`).join('')}</div>
          ${canEdit ? '<div class="actions"><button class="btn" id="newtask">+ Tarefa</button></div>' : ''}</div>
        <div class="card">${t ? `<label>Título</label><input id="t-title" value="${esc(t.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Ordem</label><input id="t-sort" type="number" value="${t.sort}" style="width:120px" ${canEdit ? '' : 'readonly'}>
          <label>Conteúdo (Markdown: definição, regra padrão, query de apoio, exemplos, casos ambíguos, saída)</label>
          ${editorBlock('t-body', t.body_md, '', canEdit)}${saveBar(canEdit)}` : '<div class="empty">Sem tarefas de contexto.</div>'}</div></div>`;
      for (const b of el.querySelectorAll('.list button')) b.onclick = () => { location.hash = `#/t/${slug}/contexto/${encodeURIComponent(b.dataset.id)}`; };
      const nt = $('#newtask'); if (nt) nt.onclick = () => { const id = prompt('id da tarefa (a-z, 0-9, _ -), ex.: metas'); if (!id) return; tasks.push({ task_id: id, title: id, body_md: '', sort: tasks.length }); cur = id; draw(); };
      if (t) wireSave(() => api(`/api/templates/${encodeURIComponent(slug)}/draft/tasks/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#t-title').value, body_md: $('#t-body').value, sort: Number($('#t-sort').value) || 0 } }));
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
  async function renderGerais() {
    const list = await api('/api/general-contexts');
    const canEdit = isEditor();
    let cur = list[0] ? list[0].slug : null;
    const draw = () => {
      const g = list.find((x) => x.slug === cur);
      app.innerHTML = `<div class="head"><div><h1>Contextos gerais</h1><p class="muted sm">Poucos e curados: valem para <b>todo</b> template e vão junto com qualquer kit. Salvar publica na hora.</p></div></div>
        <div class="split"><div class="card"><div class="list">${list.map((x) => `<button data-s="${esc(x.slug)}" class="${x.slug === cur ? 'on' : ''}">${esc(x.title)}<br><code>${esc(x.slug)}</code></button>`).join('') || '<div class="muted sm">Nenhum.</div>'}</div>
          ${canEdit ? '<div class="actions"><button class="btn" id="newg">+ Contexto geral</button></div>' : ''}</div>
        <div class="card">${g ? `<label>Título</label><input id="g-title" value="${esc(g.title)}" ${canEdit ? '' : 'readonly'}>
          <label>Conteúdo (Markdown)</label>${editorBlock('g-body', g.body_md, '', canEdit)}
          <p class="muted sm">Atualizado ${esc((g.updated_at || '').slice(0, 16).replace('T', ' '))} por ${esc(g.author_email || '—')}</p>
          ${canEdit ? '<div class="actions"><button class="btn btn-ghost btn-danger" id="delg">Excluir</button><button class="btn btn-p" id="save">Salvar e publicar</button></div>' : ''}` : '<div class="empty">Selecione um contexto.</div>'}</div></div>`;
      for (const b of app.querySelectorAll('.list button')) b.onclick = () => { cur = b.dataset.s; draw(); };
      const ng = $('#newg'); if (ng) ng.onclick = () => { const s = prompt('slug (a-z, 0-9, hífen), ex.: taxa-nunca-soma'); if (!s) return; list.push({ slug: s, title: s, body_md: '' }); cur = s; draw(); };
      const dg = $('#delg'); if (dg) dg.onclick = async () => { if (!confirm(`Excluir "${cur}"?`)) return; try { await api(`/api/general-contexts/${encodeURIComponent(cur)}`, { method: 'DELETE' }); toast('Excluído'); renderGerais(); } catch (e) { toast(e.message, true); } };
      if (g) wireSave(async () => { await api(`/api/general-contexts/${encodeURIComponent(cur)}`, { method: 'PUT', body: { title: $('#g-title').value, body_md: $('#g-body').value } }); return false; });
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
