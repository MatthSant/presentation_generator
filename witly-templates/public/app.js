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
    const h = location.hash.replace(/^#\/?/, '').split('?')[0];
    const [seg, slug, tab, ...rest] = h.split('/');
    if (seg === 'atividade' && slug) { setNav('atividade'); return renderAtividadeDetalhe(slug); }
    if (seg === 'atividade') { setNav('atividade'); return renderAtividade(); }
    if (seg === 'uso') { setNav('atividade'); return renderUso(); }
    if (seg === 'pessoais') { setNav('pessoais'); return renderPessoais(); }
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
  const TABS = [['info', 'Info'], ['manifesto', 'Manifesto'], ['contexto', 'Contexto'], ['queries', 'Queries'], ['python', 'Python'], ['documento', 'Documento'], ['guia', 'Guia'], ['perguntas', 'Perguntas'], ['design', 'Design system'], ['exemplo', 'Exemplo'], ['versoes', 'Versões']];

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
    const canEdit = isEditor() || (t.owner_email && t.owner_email === me.email);
    app.innerHTML = `<div class="head">
      <div><a class="muted sm" href="#/">← Templates</a><h1>${esc(t.name)} <code>${esc(t.slug)}</code>${t.owner_email ? ` <span class="pill">pessoal · ${esc(t.owner_email)}</span>` : ''}</h1>
        <div class="row sm"><span class="muted">${kit ? (state === 'draft' ? `Editando o <b>rascunho v${v.number}</b>` : `Vendo a <b>publicada v${v.number}</b>`) : 'Sem versão'}</span>
        ${t.published_version_id ? '<span class="pill pub">publicada</span>' : '<span class="pill off">sem publicada</span>'}${t.draft_version_id ? '<span class="pill draft">rascunho</span>' : ''}</div></div>
      <div class="row">${canEdit && !t.draft_version_id && t.published_version_id ? '<button class="btn" id="mkdraft">Criar rascunho</button>' : ''}
        ${canEdit && t.draft_version_id ? '<button class="btn btn-p" id="publish">Publicar rascunho</button>' : ''}</div></div>
      <div class="tabs">${TABS.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="pane"></div>`;
    for (const b of app.querySelectorAll('.tab')) b.onclick = () => { location.hash = `#/t/${slug}/${b.dataset.tab}`; };
    const mk = $('#mkdraft'); if (mk) mk.onclick = async () => { try { await api(`/api/templates/${slug}/draft`, { method: 'POST' }); toast('Rascunho criado'); route(); } catch (e) { toast(e.message, true); } };
    const pb = $('#publish'); if (pb) pb.onclick = async () => {
      const changelog = prompt('Publicar o rascunho? O MCP passa a entregar esta versão. Nota de mudança (opcional):', '');
      if (changelog === null) return;
      try { await api(`/api/templates/${slug}/publish`, { method: 'POST', body: { changelog } }); toast('Publicado'); route(); } catch (e) { toast(e.message, true); }
    };
    if (!kit) { $('#pane').innerHTML = '<div class="empty">Este template ainda não tem conteúdo.</div>'; return; }
    const ctx = { slug, kit, canEdit, state, sub };
    ({ info: paneInfo, manifesto: paneManifest, contexto: paneContexto, queries: paneFiles('queries/', 'sql'), python: paneFiles('python/', 'py'), documento: paneSingle('documento.md'), guia: paneSingle('guia.md'), perguntas: paneSingle('perguntas.md'), design: paneSingle('design-system.md'), exemplo: paneExemplo, versoes: paneVersoes })[tab](ctx, $('#pane'));
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


  // ── Fase 2: pessoais ───────────────────────────────────────────────────
  async function renderPessoais() {
    const rows = await api('/api/pessoais');
    app.innerHTML = `<div class="head"><div><h1>Templates pessoais</h1><p class="muted sm">Salvos pelo agente com <code>salvar_template</code>. Só o dono usa no MCP. ${isEditor() ? 'Promova o que merece virar padrão de todos; remova o que ninguém usa.' : 'Editores podem promover o seu para todos.'}</p></div></div>
      <div class="card"><table><thead><tr><th>Template</th><th>Dono</th><th>Versão</th><th>Gerações</th><th>Aprofund.</th><th></th></tr></thead><tbody>
      ${rows.map((t) => `<tr data-s="${esc(t.slug)}"><td><a href="#/t/${esc(t.slug)}"><b>${esc(t.name)}</b></a><br><code>${esc(t.slug)}</code></td><td>${esc(t.owner_email)}</td><td>${t.published_number ? `v${t.published_number}` : '—'}</td><td>${t.geracoes}</td><td>${t.aprofundamentos}</td>
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
  const EVENTO_LABEL = { geracao: 'Geração', aprofundamento: 'Aprofundamento', edicao: 'Edição' };
  async function renderAtividade() {
    const q = new URLSearchParams(location.hash.split('?')[1] || '');
    const rows = await api('/api/atividade?' + q.toString());
    const templates = await api('/api/templates');
    const f = (k) => q.get(k) || '';
    app.innerHTML = `<div class="head"><div><h1>Atividade</h1><p class="muted sm">O que os agentes registraram: gerações, aprofundamentos (pergunta, resposta, veredito) e edições. ${isEditor() ? 'Vire exemplo, vire regra, ajuste o template.' : 'Você vê só as suas entradas.'}</p></div>
      ${isEditor() ? '<a class="btn" href="#/uso">Uso por template →</a>' : ''}</div>
      <div class="card row" style="margin-bottom:14px">
        <select id="f-slug" style="width:220px"><option value="">todos os templates</option>${templates.map((t) => `<option value="${esc(t.slug)}" ${f('slug') === t.slug ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
        <select id="f-evento" style="width:170px"><option value="">todos os eventos</option>${Object.entries(EVENTO_LABEL).map(([k, l]) => `<option value="${k}" ${f('evento') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${isEditor() ? `<input id="f-email" placeholder="e-mail" style="width:200px" value="${esc(f('email'))}">` : ''}
        <input id="f-cliente" placeholder="cliente" style="width:140px" value="${esc(f('cliente'))}">
        <select id="f-aval" style="width:130px"><option value="">qualquer nota</option>${[5, 4, 3, 2, 1].map((n) => `<option ${f('avaliacao') === String(n) ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <label style="margin:0;display:flex;align-items:center;gap:6px;text-transform:none"><input type="checkbox" id="f-desc" style="width:auto" ${f('descartado') === '1' ? 'checked' : ''}> só descartados</label>
        <button class="btn" id="f-go">Filtrar</button></div>
      <div class="card"><table><thead><tr><th>Quando</th><th>Quem</th><th>Evento</th><th>Template</th><th>Resumo</th><th>Nota</th><th></th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td class="sm muted">${esc(r.at.slice(0, 16).replace('T', ' '))}</td><td class="sm">${esc(r.email)}${r.origem === 'app' ? ' <span class="pill leitor">app</span>' : ''}</td><td>${EVENTO_LABEL[r.evento] || r.evento}</td><td><code>${esc(r.slug)}</code> v${r.version_number ?? '?'}${r.cliente ? `<br><span class="sm muted">${esc(r.cliente)}</span>` : ''}</td>
        <td class="sm">${r.resumo.pergunta ? `<b>${esc(r.resumo.pergunta)}</b><br>` : ''}${esc(r.resumo.resposta || r.resumo.mudanca || (r.resumo.resultado && r.resumo.resultado.titulo) || '')}${r.descartado ? `<br><span class="pill off">descartado</span> <span class="muted">${esc(r.motivo || '')}</span>` : ''}${r.virou_exemplo ? ' <span class="pill pub">exemplo</span>' : ''}${r.virou_regra ? ' <span class="pill draft">regra</span>' : ''}</td>
        <td>${r.avaliacao ?? '—'}${r.editor_nota ? ` <span class="muted sm">(editor ${r.editor_nota})</span>` : ''}</td>
        <td><a class="btn btn-ghost" href="#/atividade/${esc(r.id)}">ver mais</a></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nada registrado ainda.</td></tr>'}
      </tbody></table></div>`;
    $('#f-go').onclick = () => {
      const p = new URLSearchParams();
      for (const [id, k] of [['#f-slug', 'slug'], ['#f-evento', 'evento'], ['#f-email', 'email'], ['#f-cliente', 'cliente'], ['#f-aval', 'avaliacao']]) { const el = $(id); if (el && el.value) p.set(k, el.value); }
      if ($('#f-desc').checked) p.set('descartado', '1');
      location.hash = '#/atividade?' + p.toString();
    };
  }

  async function renderAtividadeDetalhe(id) {
    let a; try { a = await api(`/api/atividade/${encodeURIComponent(id)}`); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const d = a.dados || {};
    const body = a.evento === 'aprofundamento'
      ? `<h3>Pergunta</h3><p>${esc(d.pergunta)}${a.pergunta_id ? ` <code>${esc(a.pergunta_id)}</code>` : ''}</p><h3>Resposta</h3><pre style="white-space:pre-wrap;background:#F9FAFB;color:inherit;border:1px solid var(--line)">${esc(d.resposta || '')}</pre>${d.consultas && d.consultas.length ? `<h3>Consultas usadas</h3><pre style="background:#F9FAFB;color:inherit;border:1px solid var(--line)">${esc(JSON.stringify(d.consultas, null, 2))}</pre>` : ''}`
      : `<pre style="white-space:pre-wrap;background:#F9FAFB;color:inherit;border:1px solid var(--line)">${esc(JSON.stringify(d, null, 2))}</pre>`;
    app.innerHTML = `<div class="head"><div><a class="muted sm" href="#/atividade">← Atividade</a><h1>${EVENTO_LABEL[a.evento] || a.evento} · <code>${esc(a.slug)}</code> v${a.version_number ?? '?'}</h1>
      <div class="sm muted">${esc(a.email)} · ${esc(a.at.slice(0, 16).replace('T', ' '))}${a.cliente ? ` · cliente ${esc(a.cliente)}` : ''} · nota da pessoa: <b>${a.avaliacao ?? '—'}</b>${a.descartado ? ` · <span class="pill off">descartado</span> ${esc(a.motivo || '')}` : ''}</div></div>
      ${isEditor() ? `<div class="row">${a.evento === 'aprofundamento' && !a.virou_exemplo ? '<button class="btn" id="ex">Virar exemplo</button>' : ''}${!a.virou_regra ? '<button class="btn" id="rg">Virar regra</button>' : ''}<a class="btn btn-p" href="#/t/${esc(a.slug)}/guia">Ajustar template</a></div>` : ''}</div>
      <div class="card">${body}</div>
      ${isEditor() ? `<div class="card" style="margin-top:14px"><h3>Sua avaliação (editor)</h3><div class="row"><select id="en" style="width:120px"><option value="">— nota</option>${[5, 4, 3, 2, 1].map((n) => `<option ${a.editor_nota === n ? 'selected' : ''}>${n}</option>`).join('')}</select><input id="ec" placeholder="comentário" value="${esc(a.editor_comentario || '')}" style="flex:1"><button class="btn btn-p" id="es">Salvar</button></div></div>` : ''}`;
    const ex = $('#ex'); if (ex) ex.onclick = async () => { try { const r = await api(`/api/atividade/${id}/virar-exemplo`, { method: 'POST' }); toast('Exemplo adicionado ao guia do rascunho'); location.hash = `#/t/${r.slug}/guia`; } catch (e) { toast(e.message, true); } };
    const rg = $('#rg'); if (rg) rg.onclick = async () => { const texto = prompt('Texto da regra ("o que NÃO concluir"):', a.motivo || ''); if (texto === null) return; try { const r = await api(`/api/atividade/${id}/virar-regra`, { method: 'POST', body: { texto } }); toast('Regra adicionada ao guia do rascunho'); location.hash = `#/t/${r.slug}/guia`; } catch (e) { toast(e.message, true); } };
    const es = $('#es'); if (es) es.onclick = async () => { try { await api(`/api/atividade/${id}`, { method: 'PATCH', body: { editor_nota: $('#en').value ? Number($('#en').value) : null, editor_comentario: $('#ec').value } }); toast('Salvo'); } catch (e) { toast(e.message, true); } };
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
        ${vs.map((v) => `<tr><td><b>v${v.number}</b></td><td>${v.state === 'published' ? '<span class="pill pub">publicada</span>' : '<span class="pill draft">rascunho</span>'}</td><td class="sm">${esc(v.author_email || '—')}</td><td class="sm muted">${esc((v.published_at || v.created_at).slice(0, 16).replace('T', ' '))}</td><td class="sm">${esc(v.changelog || '')}</td>
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
