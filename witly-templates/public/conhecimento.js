/* Witly Grimório — Conhecimento (spec 008). Rotas:
 *   #/conhecimento[?filtros]        lista por família/tipo/domínio/nível/escopo/status, busca
 *   #/conhecimento/novo             propor entrada nova
 *   #/conhecimento/<id>             a entrada: corpo, campos, uso, relações, propostas, histórico
 *   #/conhecimento/<id>/propor      propor edição · /substituta · /fechar (caso/teste)
 *   #/pendencias[?t=…]              propostas abertas · aprovadas por votos · casos/testes pendentes · triagem
 *   #/pendencias/<id>               uma proposta: atual × proposta, votos, decisão
 *   #/config                        N de votos, dias, limites (editor)
 * Nada aqui edita entrada direto: tudo vira proposta; o editor pode aprovar na hora. */
(function () {
  const G = window.GRIM;
  const { $, api, toast, esc, isEditor, params, setQuery, skeleton, fmtAt, setNav } = G;
  const app = () => G.app();
  let ESQ = null;
  async function esquema() { if (!ESQ) ESQ = await api('/api/conhecimento/esquema'); return ESQ; }
  const tipoDef = (t) => (ESQ ? ESQ.tipos.find((x) => x.tipo === t) : null);
  const famLabel = (f) => (ESQ && ESQ.familias.find((x) => x.id === f) || { label: f }).label;
  const dias = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const dmy = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '');

  /** Markdown mínimo e seguro: parágrafos, listas, **negrito**, `código`. */
  function md(src) {
    const inl = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = []; let ul = [];
    const flush = () => { if (ul.length) { out.push(`<ul>${ul.map((l) => `<li>${inl(l)}</li>`).join('')}</ul>`); ul = []; } };
    for (const bloco of String(src || '').split(/\n\s*\n/)) {
      const linhas = bloco.split('\n').map((l) => l.trim()).filter(Boolean);
      if (!linhas.length) continue;
      if (linhas.every((l) => /^[-*] /.test(l))) { ul.push(...linhas.map((l) => l.slice(2))); flush(); continue; }
      flush(); out.push(`<p>${linhas.map(inl).join('<br>')}</p>`);
    }
    flush();
    return out.join('');
  }

  const pillFam = (e) => `<span class="pill fam-${esc(e.familia)}">${esc(e.tipo)}</span>`;
  const chipNivel = (n) => `<span class="chip niv-${esc(n)}">${esc(n)}</span>`;
  const verif = (e) => (e.verificado_em ? `<span class="ver-ok">✓ verificada ${esc(dmy(e.verificado_em))}</span>` : '<span class="ver-no">não verificada</span>');
  const tituloProposta = (p) => (p.conteudo && (p.conteudo.titulo || p.conteudo.resultado)) ? String(p.conteudo.titulo || `fechar: ${p.conteudo.resultado}`) : (p.modo === 'superseder' ? 'superseder' : p.modo);
  const MODO_LABEL = { nova: 'nova entrada', edicao: 'edição', substituta: 'substituta', fechar_resultado: 'fechar resultado', superseder: 'superseder' };

  // ── rotas ─────────────────────────────────────────────────────────────
  function route(seg, slug, tab) {
    if (seg === 'conhecimento') {
      setNav('conhecimento');
      if (!slug) renderLista();
      else if (slug === 'novo') renderForm({ modo: 'nova' });
      else if (tab === 'propor') renderForm({ modo: 'edicao', id: slug });
      else if (tab === 'substituta') renderForm({ modo: 'substituta', id: slug });
      else if (tab === 'fechar') renderFechar(slug);
      else renderEntrada(slug);
      return true;
    }
    if (seg === 'pendencias') { setNav('pendencias'); if (slug) renderProposta(slug); else renderPendencias(); return true; }
    if (seg === 'config') { setNav('config'); renderConfig(); return true; }
    return false;
  }

  // ── lista ─────────────────────────────────────────────────────────────
  const STATUS = [['ativo', 'ativas'], ['rascunho', 'rascunho'], ['supersedido', 'supersedidas'], ['todos', 'todas']];
  async function renderLista() {
    skeleton('rows');
    await esquema();
    const p = params();
    const f = { q: p.get('q') || '', familia: p.get('familia') || '', tipo: p.get('tipo') || '', dominio: p.get('dominio') || '', nivel: p.get('nivel') || '', escopo: p.get('escopo') || '', status: STATUS.some(([k]) => k === p.get('status')) ? p.get('status') : 'ativo', sempre: p.get('sempre') === '1', naover: p.get('verif') === 'nao', tag: p.get('tag') || '' };
    const qs = new URLSearchParams({ status: f.status, limit: '500' });
    if (f.q) qs.set('q', f.q); if (f.tipo) qs.set('tipo', f.tipo); if (f.dominio) qs.set('dominio', f.dominio); if (f.nivel) qs.set('nivel', f.nivel); if (f.escopo) qs.set('escopo', f.escopo); if (f.sempre) qs.set('sempre', '1'); if (f.tag) qs.set('tags', f.tag);
    const [rows, props] = await Promise.all([api('/api/conhecimento?' + qs.toString()), api('/api/propostas?estado=aberta&limit=500').catch(() => [])]);
    const abertas = new Map(); for (const x of props) if (x.entrada_id) abertas.set(x.entrada_id, (abertas.get(x.entrada_id) || 0) + 1);
    const base = f.naover ? rows.filter((e) => !e.verificado_em) : rows;
    const porFam = {}; for (const e of base) porFam[e.familia] = (porFam[e.familia] || 0) + 1;
    const vis = f.familia ? base.filter((e) => e.familia === f.familia) : base;
    const sync = (mud) => { const p2 = new URLSearchParams(p); for (const [k, v] of Object.entries(mud)) { if (v) p2.set(k, v); else p2.delete(k); } location.hash = '#/conhecimento?' + p2.toString(); };
    const tiposDaFam = f.familia ? ESQ.tipos.filter((t) => t.familia === f.familia) : ESQ.tipos;
    const escKind = f.escopo.split(':')[0]; const escAlvo = f.escopo.includes(':') ? f.escopo.split(':')[1] : '';

    app().innerHTML = `<div class="head"><div><h1>Conhecimento</h1><p class="muted sm">O cérebro do time: cada entrada é curta, tipada e diz onde vale e quando o agente a puxa. Mudança é <b>proposta</b>; editor ou votos aprovam.</p></div>
        <div class="row"><a class="btn" href="#/pendencias">Pendências${props.length ? ` <code>${props.length}</code>` : ''}</a><a class="btn btn-p" href="#/conhecimento/novo">+ Propor entrada</a></div></div>
      <div class="filters">
        <span class="search"><input id="k-q" placeholder="buscar título, corpo, tag (sem acento)" value="${esc(f.q)}"></span>
        <select id="k-tipo"><option value="">todos os tipos</option>${tiposDaFam.map((t) => `<option value="${t.tipo}" ${t.tipo === f.tipo ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select>
        <select id="k-dom"><option value="">domínio</option>${ESQ.dominios.map((d) => `<option ${d === f.dominio ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <select id="k-niv"><option value="">nível</option>${ESQ.niveis.map((d) => `<option ${d === f.nivel ? 'selected' : ''}>${d}</option>`).join('')}</select>
        <select id="k-esc"><option value="">escopo</option>${['geral', 'template', 'funil', 'cliente', 'campanha'].map((k) => `<option value="${k}" ${k === escKind ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <input id="k-alvo" placeholder="slug do escopo" style="width:130px" value="${esc(escAlvo)}" ${escKind && escKind !== 'geral' ? '' : 'hidden'}>
        <select id="k-st">${STATUS.map(([k, l]) => `<option value="${k}" ${k === f.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <label class="chk"><input type="checkbox" id="k-sempre" ${f.sempre ? 'checked' : ''}> sempre</label>
        <label class="chk"><input type="checkbox" id="k-naover" ${f.naover ? 'checked' : ''}> não verificadas</label>
        <span class="count">${vis.length} de ${rows.length}</span>
      </div>
      <div class="row" style="margin:-6px 0 14px"><span class="fam-tabs"><button data-fam="" class="${f.familia ? '' : 'on'}">todas <small>${base.length}</small></button>${ESQ.familias.map((x) => `<button data-fam="${x.id}" class="${x.id === f.familia ? 'on' : ''}">${esc(x.label)} <small>${porFam[x.id] || 0}</small></button>`).join('')}</span>
        ${f.tag ? `<span class="chip">tag: ${esc(f.tag)} <a href="#" id="k-notag">×</a></span>` : ''}</div>
      <div class="krows">${vis.map((e) => `<a class="krow" href="#/conhecimento/${esc(e.id)}">
        <div>${pillFam(e)}<div class="km" style="margin-top:5px">${chipNivel(e.nivel)}</div></div>
        <div><div class="kt">${esc(e.titulo)}</div><div class="km"><span>${esc(e.id)}</span><span>· ${esc(e.dominio)}</span>${e.escopo !== 'geral' ? `<span class="chip esc">${esc(e.escopo)}</span>` : ''}${(e.tags || []).slice(0, 5).map((t) => `<span class="chip">${esc(t)}</span>`).join('')}${e.tipo === 'caso' || e.tipo === 'teste' ? `<span class="pill ${e.dados.resultado === 'confirmado' ? 'pub' : e.dados.resultado === 'refutado' ? 'off' : 'draft'}">${esc(e.dados.resultado || 'pendente')}</span>` : ''}</div></div>
        <div class="kr"><span>${e.sempre ? '<span class="pill editor">sempre</span> ' : ''}${e.status !== 'ativo' ? `<span class="pill off">${esc(e.status)}</span> ` : ''}v${e.versao}${abertas.get(e.id) ? ` · <b style="color:var(--purple)">${abertas.get(e.id)} proposta${abertas.get(e.id) > 1 ? 's' : ''}</b>` : ''}</span><span>${verif(e)}</span></div></a>`).join('') || `<div class="empty">${rows.length ? 'Nada nesta família.' : 'Nenhuma entrada com esse filtro. Afrouxe a busca ou proponha a que falta.'}</div>`}</div>`;

    const bq = $('#k-q'); bq.onkeydown = (e) => { if (e.key === 'Enter') sync({ q: bq.value.trim() }); }; bq.onblur = () => { if (bq.value.trim() !== f.q) sync({ q: bq.value.trim() }); };
    $('#k-tipo').onchange = () => sync({ tipo: $('#k-tipo').value });
    $('#k-dom').onchange = () => sync({ dominio: $('#k-dom').value });
    $('#k-niv').onchange = () => sync({ nivel: $('#k-niv').value });
    $('#k-st').onchange = () => sync({ status: $('#k-st').value === 'ativo' ? '' : $('#k-st').value });
    $('#k-sempre').onchange = () => sync({ sempre: $('#k-sempre').checked ? '1' : '' });
    $('#k-naover').onchange = () => sync({ verif: $('#k-naover').checked ? 'nao' : '' });
    const es = $('#k-esc'), al = $('#k-alvo');
    const syncEsc = () => { const k = es.value; if (!k) return sync({ escopo: '' }); if (k === 'geral') return sync({ escopo: 'geral' }); al.hidden = false; if (al.value.trim()) sync({ escopo: `${k}:${al.value.trim().toLowerCase()}` }); else al.focus(); };
    es.onchange = syncEsc; al.onkeydown = (e) => { if (e.key === 'Enter') syncEsc(); }; al.onblur = syncEsc;
    for (const b of app().querySelectorAll('[data-fam]')) b.onclick = () => sync({ familia: b.dataset.fam, tipo: '' });
    const nt = $('#k-notag'); if (nt) nt.onclick = (e) => { e.preventDefault(); sync({ tag: '' }); };
  }

  // ── entrada ───────────────────────────────────────────────────────────
  function camposHtml(e) {
    const def = tipoDef(e.tipo); if (!def) return '';
    const itens = def.campos.filter((c) => e.dados[c.nome] != null && e.dados[c.nome] !== '');
    if (!itens.length) return '';
    return `<dl class="kv">${itens.map((c) => { const v = e.dados[c.nome]; const html = Array.isArray(v) ? `<ul>${v.map((x) => `<li>${esc(typeof x === 'string' ? x : JSON.stringify(x))}</li>`).join('')}</ul>` : typeof v === 'object' ? `<code>${esc(JSON.stringify(v))}</code>` : esc(String(v)); return `<dt>${esc(c.nome)}</dt><dd>${html}</dd>`; }).join('')}</dl>`;
  }

  async function renderEntrada(id) {
    skeleton('doc');
    await esquema();
    let e; try { e = await api(`/api/conhecimento/${encodeURIComponent(id)}`); } catch (err) { app().innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    const abertas = (e.propostas || []).filter((p) => p.estado === 'aberta');
    const decididas = (e.propostas || []).filter((p) => p.estado !== 'aberta');
    const pend = (e.tipo === 'caso' || e.tipo === 'teste') && (e.dados.resultado || 'pendente') === 'pendente';
    const gat = (e.gatilho || []).map((g) => (ESQ.gatilhos.find((x) => x.id === g) || { label: g }).label);
    app().innerHTML = `<div class="row sm" style="margin-bottom:12px"><a href="#/conhecimento"><code>← conhecimento</code></a></div>
      <div class="head"><div><h1 style="max-width:40ch">${esc(e.titulo)}</h1>
        <div class="row sm" style="margin-top:6px">${pillFam(e)}<span class="muted">${esc(famLabel(e.familia))}</span><code>${esc(e.id)}</code>${chipNivel(e.nivel)}<span class="chip">${esc(e.dominio)}</span><span class="chip esc">${esc(e.escopo)}</span>
          ${e.sempre ? '<span class="pill editor">sempre</span>' : ''}${e.status !== 'ativo' ? `<span class="pill off">${esc(e.status)}${e.supersedido_por ? ` → <a href="#/conhecimento/${esc(e.supersedido_por)}" style="color:inherit">${esc(e.supersedido_por)}</a>` : ''}</span>` : ''}
          <span class="chip">confiança ${esc(e.confianca)}</span><span class="sm">${verif(e)}${e.verificar_ate ? ` <span class="muted">(vence ${esc(dmy(e.verificar_ate))})</span>` : ''}</span></div></div>
        <div class="row"><a class="btn btn-p" href="#/conhecimento/${esc(e.id)}/propor">Propor edição</a></div></div>
      <div class="two"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        <div class="card"><div class="kbody">${md(e.corpo_md) || '<p class="muted">Sem corpo: o título é a entrada inteira.</p>'}</div>${camposHtml(e)}
          <div class="row sm" style="margin-top:12px;gap:6px">${(e.tags || []).map((t) => `<a class="chip" href="#/conhecimento?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>
          <p class="muted sm" style="margin:12px 0 0">Puxada: ${esc(gat.join(', ') || 'só por busca')}${e.fontes && e.fontes.length ? ` · Fontes: ${esc(e.fontes.join(' · '))}` : ''} · v${e.versao} · ${esc(e.autor || '—')} em ${esc(fmtAt(e.atualizado_em))}</p></div>
        ${abertas.length ? `<h2>Propostas abertas nesta entrada</h2><div class="list-cards">${abertas.map(cardProposta).join('')}</div>` : ''}
        <h2>Histórico</h2><div class="card"><table><thead><tr><th>v</th><th>Título</th><th>Autor</th><th>Quando</th><th></th></tr></thead><tbody>
          ${(e.historico || []).map((h) => `<tr><td><code>v${h.versao}</code></td><td class="sm">${esc(String(h.snapshot.titulo || ''))}${h.snapshot.status && h.snapshot.status !== 'ativo' ? ` <span class="pill off">${esc(h.snapshot.status)}</span>` : ''}</td><td class="sm muted">${esc(h.autor || '—')}</td><td class="sm muted">${esc(fmtAt(h.at))}</td>
            <td class="row" style="justify-content:flex-end"><button class="btn btn-ghost" data-ver="${h.versao}">ver</button>${isEditor() && h.versao !== e.versao ? `<button class="btn" data-restaurar="${h.versao}">Restaurar</button>` : ''}</td></tr>`).join('')}</tbody></table></div>
        ${decididas.length ? `<h2>Propostas decididas</h2><div class="card"><table><thead><tr><th>Modo</th><th>Título</th><th>Estado</th><th>Por</th><th>Quando</th></tr></thead><tbody>${decididas.map((p) => `<tr><td class="sm">${esc(MODO_LABEL[p.modo] || p.modo)}</td><td class="sm"><a href="#/pendencias/${esc(p.id)}">${esc(tituloProposta(p))}</a></td><td><span class="pill ${p.estado === 'aprovada' ? 'pub' : p.estado === 'recusada' ? 'off' : 'draft'}">${esc(p.estado)}</span></td><td class="sm muted">${esc(p.aprovada_por || p.decidido_por || '')}</td><td class="sm muted">${esc(fmtAt(p.decidido_em))}</td></tr>`).join('')}</tbody></table></div>` : ''}
      </div>
      <div class="side-col">
        <div class="card"><div class="kicker">Ações</div>
          <a class="choice rule" href="#/conhecimento/${esc(e.id)}/propor"><b>Propor edição</b><span>Muda esta entrada; vira versão nova quando aprovada</span></a>
          <a class="choice rule" href="#/conhecimento/${esc(e.id)}/substituta"><b>Propor substituta</b><span>Uma entrada melhor no lugar desta (a atual fica supersedida)</span></a>
          ${pend ? `<a class="choice ok" href="#/conhecimento/${esc(e.id)}/fechar"><b>Fechar resultado</b><span>Confirmado ou refutado, com o número</span></a>` : ''}
          ${isEditor() ? `<button class="choice ok" id="verificar"><b>${e.verificado_em ? 'Verificar de novo' : 'Marcar verificada'}</b><span>Você atesta que está certa hoje; pode dar prazo</span></button>
            <button class="choice ${e.sempre ? 'drop' : 'rule'}" id="sempre"><b>${e.sempre ? 'Tirar do "sempre"' : 'Pôr no "sempre"'}</b><span>${e.sempre ? 'Deixa de entrar em toda chamada' : 'Entra em toda chamada do MCP (cota de 40)'}</span></button>
            ${e.status === 'ativo' ? '<button class="choice drop" id="superseder"><b>Superseder</b><span>Sai do ativo apontando para outra entrada (nunca se apaga)</span></button>' : ''}` : ''}</div>
        <div class="card"><div class="kicker">Uso</div><p class="sm" style="margin:0"><b>${e.uso.usos}</b> ${e.uso.usos === 1 ? 'vez puxada' : 'vezes puxada'} · ajudou <b>${e.uso.ajudou}</b> · não ajudou <b>${e.uso.nao_ajudou}</b>${e.uso.ultimo ? `<br><span class="muted">última em ${esc(fmtAt(e.uso.ultimo))}</span>` : ''}</p></div>
        ${(e.relacoes || []).length ? `<div class="card"><div class="kicker">Relações</div>${e.relacoes.map((r) => `<p class="sm" style="margin:0 0 4px"><code>${esc(r.de === e.id ? 'esta' : r.de)}</code> ${esc(r.tipo)} <a href="#/conhecimento/${esc(r.para === e.id ? r.de : r.para)}"><code>${esc(r.para === e.id ? 'esta' : r.para)}</code></a></p>`).join('')}</div>` : ''}
      </div></div>`;
    wireCards(e.id);
    for (const b of app().querySelectorAll('[data-ver]')) b.onclick = () => { const h = e.historico.find((x) => String(x.versao) === b.dataset.ver); G.modal(`v${h.versao} · ${fmtAt(h.at)}`, `<p style="font-weight:600">${esc(String(h.snapshot.titulo || ''))}</p><div class="kbody">${md(String(h.snapshot.corpo_md || ''))}</div><pre class="sm muted" style="white-space:pre-wrap">${esc(String(h.snapshot.dados_json || ''))}</pre>`); };
    for (const b of app().querySelectorAll('[data-restaurar]')) b.onclick = async () => {
      const h = e.historico.find((x) => String(x.versao) === b.dataset.restaurar);
      if (!confirm(`Restaurar a v${h.versao} como versão nova (proposta aprovada por você)?`)) return;
      let dados = {}; try { dados = JSON.parse(h.snapshot.dados_json || '{}'); } catch { /* vazio */ }
      try {
        const r = await api('/api/propostas', { method: 'POST', body: { entrada_id: e.id, modo: 'edicao', conteudo: { titulo: h.snapshot.titulo, corpo_md: h.snapshot.corpo_md, dados }, motivo: `restaurar a v${h.versao}` } });
        await api(`/api/propostas/${r.proposta.id}/decidir`, { method: 'POST', body: { decisao: 'aprovada', motivo: 'restauração' } });
        toast('Restaurada como versão nova'); G.route();
      } catch (err) { toast(err.message, true); }
    };
    const vf = $('#verificar'); if (vf) vf.onclick = () => G.modal('Marcar verificada', '<p class="muted sm">Você atesta que esta entrada está certa hoje. Um prazo faz a Saúde lembrar de reverificar.</p><label>Reverificar até (opcional)</label><input id="v-ate" type="date">', 'Verificar', async (fechar, ov) => {
      try { await api(`/api/conhecimento/${encodeURIComponent(e.id)}/verificar`, { method: 'POST', body: { ate: $('#v-ate', ov).value || null } }); fechar(); toast('Verificada'); G.route(); } catch (err) { toast(err.message, true); }
    });
    const sp = $('#sempre'); if (sp) sp.onclick = async () => {
      try { await api(`/api/conhecimento/${encodeURIComponent(e.id)}/sempre`, { method: 'POST', body: { sempre: !e.sempre } }); toast(e.sempre ? 'Saiu do sempre' : 'Entrou no sempre'); G.route(); }
      catch (err) {
        if (!/cota/.test(err.message)) return toast(err.message, true);
        const lista = await api('/api/conhecimento?sempre=1&limit=100');
        G.modal('Cota do "sempre" cheia (40)', `<p class="muted sm">Para esta entrar, uma sai. Qual?</p><select id="sai">${lista.map((x) => `<option value="${esc(x.id)}">${esc(x.titulo.slice(0, 90))}</option>`).join('')}</select>`, 'Trocar', async (fechar, ov) => {
          try { await api(`/api/conhecimento/${encodeURIComponent(e.id)}/sempre`, { method: 'POST', body: { sempre: true, sai: $('#sai', ov).value } }); fechar(); toast('Trocada'); G.route(); } catch (e2) { toast(e2.message, true); }
        });
      }
    };
    const su = $('#superseder'); if (su) su.onclick = () => G.modal('Superseder', '<p class="muted sm">A entrada sai do ativo e aponta para a que a substitui. O histórico fica.</p><label>Id da entrada que substitui (opcional)</label><input id="s-por" placeholder="ex.: roas-liquido-v2"><label>Motivo</label><input id="s-mot">', 'Superseder', async (fechar, ov) => {
      try {
        const r = await api('/api/propostas', { method: 'POST', body: { entrada_id: e.id, modo: 'superseder', conteudo: { por: $('#s-por', ov).value.trim() }, motivo: $('#s-mot', ov).value || 'superseder' } });
        await api(`/api/propostas/${r.proposta.id}/decidir`, { method: 'POST', body: { decisao: 'aprovada' } });
        fechar(); toast('Supersedida'); G.route();
      } catch (err) { toast(err.message, true); }
    });
  }

  // ── formulário de proposta (gerado do esquema) ────────────────────────
  function campoInput(c, v) {
    const val = v == null ? '' : v;
    if (c.kind === 'enum') return `<select data-campo="${c.nome}"><option value="">—</option>${c.opcoes.map((o) => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    if (c.kind === 'lista' || c.kind === 'ids') return `<textarea data-campo="${c.nome}" data-kind="${c.kind}" style="min-height:64px" placeholder="um por linha">${esc(Array.isArray(val) ? val.join('\n') : val)}</textarea>`;
    if (c.kind === 'objeto') return `<textarea data-campo="${c.nome}" data-kind="objeto" class="code" style="min-height:64px" placeholder='{"funil":"lancamento","sintoma":"cpl subiu"}'>${esc(typeof val === 'object' ? JSON.stringify(val) : val)}</textarea>`;
    if (c.kind === 'data') return `<input data-campo="${c.nome}" type="date" value="${esc(val)}" style="width:180px">`;
    return `<input data-campo="${c.nome}" value="${esc(val)}" placeholder="${esc(c.dica || '')}">`;
  }
  function camposForm(tipo, dados) {
    const def = tipoDef(tipo); if (!def || !def.campos.length) return '<p class="muted sm">Este tipo não tem campos além de título e corpo.</p>';
    return def.campos.map((c) => `<label>${esc(c.nome)}${c.obrigatorio ? ' *' : ''}${c.dica ? ` <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:400">— ${esc(c.dica)}</span>` : ''}</label>${campoInput(c, dados ? dados[c.nome] : null)}`).join('');
  }
  function lerCampos(root) {
    const dados = {};
    for (const el of root.querySelectorAll('[data-campo]')) {
      const k = el.dataset.campo; const kind = el.dataset.kind; const v = el.value.trim();
      if (!v) continue;
      if (kind === 'lista' || kind === 'ids') dados[k] = v.split('\n').map((x) => x.trim()).filter(Boolean);
      else if (kind === 'objeto') { try { dados[k] = JSON.parse(v); } catch { throw new Error(`${k}: JSON inválido`); } }
      else dados[k] = v;
    }
    return dados;
  }

  async function renderForm({ modo, id }) {
    skeleton('doc');
    await esquema();
    let base = null;
    if (id) { try { base = await api(`/api/conhecimento/${encodeURIComponent(id)}`); } catch (err) { app().innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; } }
    const L = ESQ.limites;
    const e = base || { tipo: params().get('tipo') || 'regra', titulo: '', corpo_md: '', dominio: 'analise', nivel: 'tatico', escopo: params().get('escopo') || 'geral', tags: [], gatilho: [], confianca: 'media', sempre: false, dados: {} };
    const titulo = { nova: 'Propor entrada nova', edicao: `Propor edição · ${e.id}`, substituta: `Propor substituta de ${e.id}` }[modo];
    const escKind = e.escopo.split(':')[0]; const escAlvo = e.escopo.includes(':') ? e.escopo.split(':')[1] : '';
    const optTipos = ESQ.familias.map((f) => `<optgroup label="${esc(f.label)}">${ESQ.tipos.filter((t) => t.familia === f.id).map((t) => `<option value="${t.tipo}" ${t.tipo === e.tipo ? 'selected' : ''}>${esc(t.label)} — ${esc(t.e)}</option>`).join('')}</optgroup>`).join('');
    app().innerHTML = `<div class="row sm" style="margin-bottom:12px"><a href="${id ? `#/conhecimento/${esc(id)}` : '#/conhecimento'}"><code>← ${id ? id : 'conhecimento'}</code></a></div>
      <div class="head"><div><h1>${esc(titulo)}</h1><p class="muted sm">${modo === 'nova' ? 'Uma entrada curta: o título é o que o agente precisa; o corpo é o porquê e o como aplicar.' : modo === 'edicao' ? 'A edição vira versão nova quando aprovada; a anterior fica no histórico.' : 'A substituta nasce como entrada nova e a atual fica supersedida apontando para ela.'} Vira <b>proposta</b>: editor ou votos aprovam.</p></div></div>
      <div class="two"><div style="min-width:0">
        <div class="card"><div class="kicker">O que é</div>
          <label>Tipo</label><select id="p-tipo" ${modo === 'edicao' ? 'disabled' : ''}>${optTipos}</select>
          <label>Título — a frase que o agente precisa</label><input id="p-titulo" value="${esc(e.titulo)}" maxlength="${L.titulo + 50}"><div class="counter" id="c-titulo"></div><div id="parecidas"></div>
          <label>Corpo — por quê + como aplicar (Markdown curto)</label><textarea id="p-corpo" style="min-height:140px">${esc(e.corpo_md)}</textarea><div class="counter" id="c-corpo"></div>
          ${modo === 'substituta' ? `<label>Id da substituta</label><input id="p-id" value="${esc(e.id)}-v${(e.versao || 1) + 1}" class="mono">` : ''}</div>
        <div class="card"><div class="kicker">Campos do tipo <span id="tipo-e" class="muted" style="text-transform:none;letter-spacing:0;font-weight:400"></span></div><div id="campos">${camposForm(e.tipo, e.dados)}</div></div>
        <div class="card"><div class="kicker">Onde vale e quando o agente puxa</div>
          <div class="row" style="gap:14px;align-items:flex-start"><div style="flex:1"><label>Domínio</label><select id="p-dom">${ESQ.dominios.map((d) => `<option ${d === e.dominio ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
            <div style="flex:1"><label>Nível</label><select id="p-niv">${ESQ.niveis.map((d) => `<option ${d === e.nivel ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
            <div style="flex:1"><label>Confiança</label><select id="p-conf">${ESQ.confiancas.map((d) => `<option ${d === e.confianca ? 'selected' : ''}>${d}</option>`).join('')}</select></div></div>
          <label>Escopo</label><div class="row"><select id="p-esc" style="width:150px">${['geral', 'template', 'funil', 'cliente', 'campanha'].map((k) => `<option ${k === escKind ? 'selected' : ''}>${k}</option>`).join('')}</select><input id="p-alvo" placeholder="slug (template, funil, cliente ou campanha)" value="${esc(escAlvo)}" style="flex:1" ${escKind === 'geral' ? 'hidden' : ''}></div>
          <label>Tags (vírgula)</label><input id="p-tags" value="${esc((e.tags || []).join(', '))}">
          <label>Gatilhos — quando o agente puxa</label><div class="row" style="gap:10px 16px">${ESQ.gatilhos.filter((g) => g.id !== 'sempre').map((g) => `<label><input type="checkbox" data-gat="${g.id}" ${(e.gatilho || []).includes(g.id) ? 'checked' : ''}> ${esc(g.label)}</label>`).join('')}</div>
          ${isEditor() ? `<label style="margin-top:14px"><input type="checkbox" id="p-sempre" ${e.sempre ? 'checked' : ''}> entra em toda chamada do MCP ("sempre", cota de ${L.sempre})</label>` : ''}</div>
        <div class="card"><div class="kicker">Por quê</div>
          <label>Motivo — o que aconteceu que mostrou a falta ou o erro</label><input id="p-motivo" placeholder="ex.: a análise de ontem somou CPL de dois canais">
          <label>Urgência</label>
          <div style="display:flex;flex-direction:column;gap:6px">
            <label><input type="radio" name="urg" value="normal" checked> normal <span class="muted sm">conhecimento novo ou melhoria — editor ou votos</span></label>
            <label><input type="radio" name="urg" value="baixa"> baixa <span class="muted sm">aparência, redação, exemplo — pode esperar o lote</span></label>
            <label><input type="radio" name="urg" value="urgente"> urgente <span class="muted sm">cálculo/métrica/regra de dado errada que contamina as próximas análises — só editor aprova; até lá o agente pergunta ao consultor</span></label></div>
          <div id="evid" hidden><label>Evidência — o número ou cálculo errado</label><textarea id="p-evid" style="min-height:60px" placeholder="ex.: ROAS 1,78 onde era 0,78 (bruto no lugar do líquido)"></textarea></div></div>
      </div>
      <div class="side-col"><div class="card"><div class="kicker">Enviar</div>
        ${isEditor() ? '<label><input type="checkbox" id="p-aprovar"> aprovar agora (você é editor)</label>' : '<p class="muted sm">Entra na fila de Pendências. Editor ou votos decidem.</p>'}
        <button class="btn btn-p" id="p-enviar" style="width:100%;justify-content:center;margin-top:10px">Propor</button>
        <p class="muted sm" style="margin:10px 0 0">Título ≤ ${L.titulo}, corpo ≤ ${L.corpo}. Sem dado pessoal.</p></div></div></div>`;

    const cnt = (inp, out, max) => { const n = inp.value.length; out.textContent = `${n}/${max}`; out.classList.toggle('over', n > max); };
    const ti = $('#p-titulo'), ct = $('#c-titulo'), co = $('#p-corpo'), cc = $('#c-corpo');
    cnt(ti, ct, L.titulo); cnt(co, cc, L.corpo);
    let timer = null;
    ti.oninput = () => { cnt(ti, ct, L.titulo); clearTimeout(timer); timer = setTimeout(parecidas, 400); };
    co.oninput = () => cnt(co, cc, L.corpo);
    async function parecidas() {
      const t = ti.value.trim(); const box = $('#parecidas'); if (t.length < 12) { box.innerHTML = ''; return; }
      const sim = await api(`/api/conhecimento/parecidas?titulo=${encodeURIComponent(t)}${id ? `&excluir=${encodeURIComponent(id)}` : ''}`).catch(() => []);
      box.innerHTML = sim.length ? `<div class="parecidas"><b>Parecidas já existentes</b> — é a mesma coisa? Abra e proponha edição lá em vez de duplicar.<br>${sim.map((s) => `<a href="#/conhecimento/${esc(s.id)}">${esc(s.titulo)}</a> <span class="muted">(${esc(s.tipo)})</span>`).join('<br>')}</div>` : '';
    }
    const st = $('#p-tipo'); const setE = () => { const d = tipoDef(st.value); $('#tipo-e').textContent = d ? `— ${d.e}` : ''; };
    setE(); st.onchange = () => { $('#campos').innerHTML = camposForm(st.value, {}); setE(); };
    const es = $('#p-esc'), al = $('#p-alvo'); es.onchange = () => { al.hidden = es.value === 'geral'; if (!al.hidden) al.focus(); };
    for (const r of app().querySelectorAll('input[name=urg]')) r.onchange = () => { $('#evid').hidden = r.value !== 'urgente' || !r.checked; };
    $('#p-enviar').onclick = async () => {
      const b = $('#p-enviar'); b.disabled = true;
      try {
        const dados = lerCampos($('#campos'));
        const escopo = es.value === 'geral' ? 'geral' : `${es.value}:${al.value.trim().toLowerCase()}`;
        const conteudo = { tipo: st.value, titulo: ti.value.trim(), corpo_md: co.value, dados, dominio: $('#p-dom').value, nivel: $('#p-niv').value, confianca: $('#p-conf').value, escopo,
          tags: $('#p-tags').value.split(',').map((x) => x.trim()).filter(Boolean), gatilho: [...app().querySelectorAll('[data-gat]:checked')].map((x) => x.dataset.gat) };
        if ($('#p-sempre')) conteudo.sempre = $('#p-sempre').checked;
        if (modo === 'substituta') conteudo.id = $('#p-id').value.trim();
        const urgencia = app().querySelector('input[name=urg]:checked').value;
        const evid = $('#p-evid').value.trim();
        const r = await api('/api/propostas', { method: 'POST', body: { entrada_id: id || null, modo, urgencia, conteudo, motivo: $('#p-motivo').value.trim(), evidencia: evid ? [{ trecho: evid }] : [] } });
        if (r.duplicada) { toast('Proposta idêntica já aberta: contou mais uma ocorrência'); location.hash = `#/pendencias/${r.proposta.id}`; return; }
        if ($('#p-aprovar') && $('#p-aprovar').checked) {
          const d = await api(`/api/propostas/${r.proposta.id}/decidir`, { method: 'POST', body: { decisao: 'aprovada' } });
          toast('Aprovada: já vale para o MCP'); G.refreshNav(); location.hash = `#/conhecimento/${d.entrada_id || id}`; return;
        }
        toast('Proposta enviada para Pendências'); G.refreshNav(); location.hash = `#/pendencias/${r.proposta.id}`;
      } catch (err) {
        if (/recusad/i.test(err.message) || /409/.test(err.message)) toast(err.message, true); else toast(err.message, true);
      } finally { b.disabled = false; }
    };
  }

  async function renderFechar(id) {
    skeleton('doc');
    let e; try { e = await api(`/api/conhecimento/${encodeURIComponent(id)}`); } catch (err) { app().innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    app().innerHTML = `<div class="row sm" style="margin-bottom:12px"><a href="#/conhecimento/${esc(id)}"><code>← ${esc(id)}</code></a></div>
      <div class="head"><div><h1>Fechar resultado</h1><p class="muted sm">${esc(e.titulo)}</p></div></div>
      <div class="card" style="max-width:640px"><label>Resultado</label><select id="f-res"><option value="confirmado">confirmado — deu certo, a ação vale</option><option value="refutado">refutado — não deu certo (baixa a confiança do que ela sustenta)</option></select>
        <label>Número que fecha (o fato)</label><input id="f-num" placeholder="ex.: custo por checkout R$ 31 → R$ 24 em 7d">
        <label>Aprendizado (uma frase)</label><input id="f-apr">
        <label>Motivo / contexto</label><input id="f-mot" placeholder="quando e como foi medido">
        ${isEditor() ? '<label style="margin-top:14px"><input type="checkbox" id="f-aprovar" checked> aprovar agora</label>' : ''}
        <div class="actions"><button class="btn btn-p" id="f-enviar">Fechar resultado</button></div></div>`;
    $('#f-enviar').onclick = async () => {
      try {
        const r = await api('/api/propostas', { method: 'POST', body: { entrada_id: id, modo: 'fechar_resultado', conteudo: { resultado: $('#f-res').value, numero: $('#f-num').value.trim(), aprendizado: $('#f-apr').value.trim() }, motivo: $('#f-mot').value.trim() || 'fechar resultado' } });
        if ($('#f-aprovar') && $('#f-aprovar').checked) { await api(`/api/propostas/${r.proposta.id}/decidir`, { method: 'POST', body: { decisao: 'aprovada' } }); toast('Resultado fechado'); location.hash = `#/conhecimento/${id}`; }
        else { toast('Proposta enviada'); location.hash = `#/pendencias/${r.proposta.id}`; }
        G.refreshNav();
      } catch (err) { toast(err.message, true); }
    };
  }

  // ── propostas (cards, pendências, detalhe) ────────────────────────────
  function cardProposta(p) {
    const c = p.conteudo || {};
    return `<div class="pcard ${esc(p.urgencia)}" data-pid="${esc(p.id)}">
      <div class="meta"><span class="pill ${p.urgencia === 'urgente' ? 'urg' : p.urgencia === 'baixa' ? 'leitor' : 'editor'}">${esc(p.urgencia)}</span><b>${esc(MODO_LABEL[p.modo] || p.modo)}</b>${c.tipo ? `<span class="pill">${esc(c.tipo)}</span>` : ''}${p.entrada_id ? `<a href="#/conhecimento/${esc(p.entrada_id)}"><code>${esc(p.entrada_id)}</code></a>` : ''}
        <span>· ${esc(p.autor)} · ${esc(fmtAt(p.criado_em))}${p.origem.startsWith('mcp') ? ' · pelo agente' : ''}</span>${p.ocorrencias > 1 ? `<span class="pill draft">${p.ocorrencias}× proposta</span>` : ''}
        <span style="margin-left:auto"><code>+${p.votos} −${p.votos_contra}</code>${p.votos_editor ? ' <span class="muted">(editor ✓)</span>' : ''}</span></div>
      <p class="q">${esc(tituloProposta(p))}</p>
      ${p.motivo ? `<p class="a" style="margin:0">${esc(p.motivo)}</p>` : ''}
      <div class="foot"><a href="#/pendencias/${esc(p.id)}">Abrir</a>
        <span style="margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="vote"><button data-voto="1" title="concordo / é melhor">👍</button><button data-voto="-1" title="não">👎</button></span>
        ${isEditor() ? '<button class="btn btn-ok" data-dec="aprovada">Aprovar</button><button class="btn btn-drop" data-dec="recusada">Recusar</button>' : ''}</span></div></div>`;
  }
  function wireCards() {
    for (const card of app().querySelectorAll('[data-pid]')) {
      const pid = card.dataset.pid;
      for (const b of card.querySelectorAll('[data-voto]')) b.onclick = async () => { try { const r = await api(`/api/propostas/${pid}/votar`, { method: 'POST', body: { valor: Number(b.dataset.voto) } }); toast(r.aprovada ? 'Aprovada por votos' : r.recusada ? 'Recusada por votos' : 'Voto registrado'); G.refreshNav(); G.route(); } catch (err) { toast(err.message, true); } };
      for (const b of card.querySelectorAll('[data-dec]')) b.onclick = async () => {
        const dec = b.dataset.dec; let motivo = null;
        if (dec === 'recusada') { motivo = prompt('Por que recusar? (fica lembrado: a mesma proposta não reabre por 90 dias)'); if (motivo === null) return; }
        try { await api(`/api/propostas/${pid}/decidir`, { method: 'POST', body: { decisao: dec, motivo } }); toast(dec === 'aprovada' ? 'Aprovada: já vale para o MCP' : 'Recusada'); G.refreshNav(); G.route(); } catch (err) { toast(err.message, true); }
      };
    }
  }

  const PEND_TABS = [['propostas', 'Propostas'], ['votos', 'Aprovadas por votos'], ['pendentes', 'Casos e testes pendentes'], ['triagem', 'Triagem do agente']];
  async function renderPendencias() {
    skeleton('rows');
    await esquema();
    const t = PEND_TABS.some(([k]) => k === params().get('t')) ? params().get('t') : 'propostas';
    const [abertas, porVotos, pend, tri] = await Promise.all([
      api('/api/propostas?estado=aberta&limit=500'), api(`/api/propostas?estado=aprovada&desde=${encodeURIComponent(dias(30))}&limit=200`).then((r) => r.filter((p) => p.aprovada_por === 'votos')),
      api('/api/conhecimento?tipo=caso,teste&resultado=pendente&limit=200'), api('/api/atividade/resumo?evento=aprofundamento,sugestao,feedback&veredito=sem').catch(() => ({ sem_veredito: 0 })),
    ]);
    const urg = abertas.filter((p) => p.urgencia === 'urgente');
    const n = { propostas: abertas.length, votos: porVotos.length, pendentes: pend.length, triagem: tri.sem_veredito || 0 };
    let corpo = '';
    if (t === 'propostas') corpo = `${urg.length ? `<div class="banner">⚠ <b>${urg.length} urgente${urg.length > 1 ? 's' : ''}</b> — só editor aprova; até lá o agente mostra ao consultor antes de gerar.</div>` : ''}
      <div class="list-cards">${abertas.map(cardProposta).join('') || '<div class="empty">Nenhuma proposta aberta.</div>'}</div>`;
    else if (t === 'votos') corpo = `<p class="muted sm">Entraram sem editor, pelos votos do time. Reverter volta a entrada à versão anterior (o histórico fica).</p>
      <div class="list-cards">${porVotos.map((p) => `<div class="pcard normal"><div class="meta"><b>${esc(MODO_LABEL[p.modo] || p.modo)}</b>${p.entrada_id ? `<a href="#/conhecimento/${esc(p.entrada_id)}"><code>${esc(p.entrada_id)}</code></a>` : ''}<span>· ${esc(p.autor)} · aprovada ${esc(fmtAt(p.decidido_em))}</span><span style="margin-left:auto"><code>+${p.votos} −${p.votos_contra}</code></span></div>
        <p class="q">${esc(tituloProposta(p))}</p><div class="foot"><a href="#/pendencias/${esc(p.id)}">Abrir</a>${isEditor() ? `<button class="btn btn-drop" data-rev="${esc(p.id)}" style="margin-left:auto">Reverter</button>` : ''}</div></div>`).join('') || '<div class="empty">Nada aprovado por votos nos últimos 30 dias.</div>'}</div>`;
    else if (t === 'pendentes') corpo = `<p class="muted sm">Casos e testes nascem pendentes; fechar o resultado é o que separa acerto de sorte.</p>
      <div class="krows">${pend.map((e) => `<a class="krow" href="#/conhecimento/${esc(e.id)}/fechar"><div>${pillFam(e)}</div><div><div class="kt">${esc(e.titulo)}</div><div class="km"><span>${esc(e.id)}</span>${e.dados.data ? `<span>· ${esc(e.dados.data)}</span>` : ''}${e.dados.campanha_id ? `<span class="chip esc">campanha:${esc(e.dados.campanha_id)}</span>` : ''}</div></div><div class="kr"><span class="pill draft">pendente</span><span>fechar resultado →</span></div></a>`).join('') || '<div class="empty">Nenhum caso ou teste pendente.</div>'}</div>`;
    else corpo = `<p class="muted sm">Aprofundamentos, sugestões de regra de template e feedbacks de uso que o agente registrou e ainda não têm veredito.</p>
      <div class="card row"><b class="sm" style="color:var(--amber)">${n.triagem} ${n.triagem === 1 ? 'item' : 'itens'} sem veredito</b><a class="btn btn-p" href="#/atividade?seg=sem" style="margin-left:auto">Abrir a triagem</a></div>`;
    app().innerHTML = `<div class="head"><div><h1>Pendências</h1><p class="muted sm">O que espera decisão: propostas do time e do agente, o que entrou por votos, resultados a fechar e a triagem.</p></div><a class="btn btn-p" href="#/conhecimento/novo">+ Propor entrada</a></div>
      <div class="tabs">${PEND_TABS.map(([k, l]) => `<button class="tab ${k === t ? 'on' : ''}" data-t="${k}">${l} <code>${n[k]}</code></button>`).join('')}</div>${corpo}`;
    for (const b of app().querySelectorAll('[data-t]')) b.onclick = () => { const p2 = new URLSearchParams(); if (b.dataset.t !== 'propostas') p2.set('t', b.dataset.t); location.hash = '#/pendencias' + (p2.toString() ? '?' + p2 : ''); };
    wireCards();
    for (const b of app().querySelectorAll('[data-rev]')) b.onclick = async () => { const motivo = prompt('Por que reverter?'); if (motivo === null) return; try { await api(`/api/propostas/${b.dataset.rev}/reverter`, { method: 'POST', body: { motivo } }); toast('Revertida'); G.route(); } catch (err) { toast(err.message, true); } };
  }

  async function renderProposta(id) {
    skeleton('doc');
    await esquema();
    let p; try { p = await api(`/api/propostas/${encodeURIComponent(id)}`); } catch (err) { app().innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }
    const c = p.conteudo || {}; const e = p.entrada;
    const meu = (p.votos_lista || []).find((v) => v.email === G.me().email);
    const bloco = (titulo, corpo, dados) => `<div><div class="kicker">${titulo}</div><b>${esc(String(corpo.titulo || ''))}</b>\n${esc(String(corpo.corpo_md || ''))}${dados && Object.keys(dados).length ? `\n<code>${esc(JSON.stringify(dados))}</code>` : ''}</div>`;
    let conteudo = '';
    if (p.modo === 'nova') conteudo = `<div class="card"><div class="kicker">A entrada proposta</div><p style="font-weight:600;font-size:15px">${esc(String(c.titulo || ''))}</p><div class="kbody">${md(String(c.corpo_md || ''))}</div>${camposHtml({ tipo: c.tipo, dados: c.dados || {} })}<p class="muted sm" style="margin-top:10px">${esc(c.tipo)} · ${esc(c.dominio || 'analise')} · ${esc(c.nivel || 'tatico')} · escopo ${esc(c.escopo || 'geral')}${Array.isArray(c.tags) && c.tags.length ? ` · ${esc(c.tags.join(', '))}` : ''}</p></div>`;
    else if (p.modo === 'edicao' || p.modo === 'substituta') conteudo = `<div class="card"><div class="diffcol">${e ? bloco('Atual', e, e.dados) : '<div>(entrada não existe mais)</div>'}${bloco(p.modo === 'edicao' ? 'Proposta' : 'Substituta', { titulo: c.titulo ?? (e && e.titulo), corpo_md: c.corpo_md ?? (e && e.corpo_md) }, c.dados)}</div></div>`;
    else if (p.modo === 'fechar_resultado') conteudo = `<div class="card"><div class="kicker">Fechar resultado</div><p><span class="pill ${c.resultado === 'confirmado' ? 'pub' : 'off'}">${esc(c.resultado)}</span>${c.numero ? ` <b>${esc(c.numero)}</b>` : ''}</p>${c.aprendizado ? `<p class="sm">${esc(c.aprendizado)}</p>` : ''}</div>`;
    else conteudo = `<div class="card"><div class="kicker">${esc(MODO_LABEL[p.modo] || p.modo)}</div><pre class="sm">${esc(JSON.stringify(c, null, 2))}</pre></div>`;
    app().innerHTML = `<div class="row sm" style="margin-bottom:12px"><a href="#/pendencias"><code>← pendências</code></a></div>
      <div class="head"><div><h1 style="max-width:40ch">${esc(tituloProposta(p))}</h1>
        <div class="row sm" style="margin-top:6px"><span class="pill ${p.urgencia === 'urgente' ? 'urg' : p.urgencia === 'baixa' ? 'leitor' : 'editor'}">${esc(p.urgencia)}</span><b>${esc(MODO_LABEL[p.modo] || p.modo)}</b>${p.entrada_id ? `<a href="#/conhecimento/${esc(p.entrada_id)}"><code>${esc(p.entrada_id)}</code></a>` : ''}
          <span class="pill ${p.estado === 'aberta' ? 'draft' : p.estado === 'aprovada' ? 'pub' : 'off'}">${esc(p.estado)}</span><code class="muted">${esc(p.autor)} · ${esc(fmtAt(p.criado_em))} · ${esc(p.origem)}${p.ocorrencias > 1 ? ` · ${p.ocorrencias}× proposta` : ''}</code></div></div></div>
      <div class="two"><div style="display:flex;flex-direction:column;gap:12px;min-width:0">
        ${conteudo}
        <div class="card"><div class="kicker">Motivo</div><p style="margin:0">${esc(p.motivo || '—')}</p>${(p.evidencia || []).length ? `<div class="kicker" style="margin-top:12px">Evidência</div>${p.evidencia.map((x) => `<p class="sm" style="margin:0 0 4px">${esc(typeof x === 'string' ? x : x.trecho || JSON.stringify(x))}${x.atividade ? ` <a href="#/atividade/${esc(x.atividade)}"><code>atividade</code></a>` : ''}</p>`).join('')}` : ''}</div>
        <div class="card"><div class="kicker">Votos</div>${(p.votos_lista || []).map((v) => `<p class="sm" style="margin:0 0 4px"><code>${v.valor > 0 ? '+1' : '−1'}</code> ${esc(v.email)}${v.comentario ? ` — ${esc(v.comentario)}` : ''} <span class="muted">${esc(fmtAt(v.at))}</span></p>`).join('') || '<p class="muted sm" style="margin:0">Ninguém votou ainda.</p>'}</div>
      </div>
      <div class="side-col"><div class="card"><div class="kicker">Sua decisão</div>
        ${p.estado === 'aberta' ? `<label>Comentário (opcional)</label><input id="v-com">
          <div class="vote" style="margin-top:8px;width:100%"><button data-v="1" class="${meu && meu.valor > 0 ? 'on' : ''}" style="flex:1">👍 concordo${p.modo !== 'nova' ? ' / é melhor' : ''}</button><button data-v="-1" class="${meu && meu.valor < 0 ? 'on' : ''}" style="flex:1">👎 não</button></div>
          ${p.urgencia === 'urgente' ? '<p class="muted sm" style="margin-top:8px">Urgente: votos não aprovam; um editor decide.</p>' : `<p class="muted sm" style="margin-top:8px">Aprova sozinha com votos líquidos = N da org (Configurações).</p>`}
          ${isEditor() ? '<button class="choice ok" id="d-ok" style="margin-top:10px"><b>Aprovar</b><span>Vale para o MCP na próxima chamada</span></button><button class="choice drop" id="d-no"><b>Recusar</b><span>Fica lembrado por 90 dias</span></button>' : ''}` :
          `<p class="sm">${esc(p.estado)} ${p.aprovada_por ? `por <b>${esc(p.aprovada_por)}</b>` : p.decidido_por ? `por ${esc(p.decidido_por)}` : ''} em ${esc(fmtAt(p.decidido_em))}${p.motivo_decisao ? `<br><span class="muted">${esc(p.motivo_decisao)}</span>` : ''}</p>${isEditor() && p.estado === 'aprovada' ? '<button class="choice drop" id="d-rev"><b>Reverter</b><span>A entrada volta à versão anterior</span></button>' : ''}`}</div></div></div>`;
    for (const b of app().querySelectorAll('[data-v]')) b.onclick = async () => { try { const r = await api(`/api/propostas/${p.id}/votar`, { method: 'POST', body: { valor: Number(b.dataset.v), comentario: $('#v-com').value.trim() || null } }); toast(r.aprovada ? 'Aprovada por votos' : r.recusada ? 'Recusada por votos' : 'Voto registrado'); G.refreshNav(); G.route(); } catch (err) { toast(err.message, true); } };
    const ok = $('#d-ok'); if (ok) ok.onclick = async () => { try { await api(`/api/propostas/${p.id}/decidir`, { method: 'POST', body: { decisao: 'aprovada', motivo: $('#v-com').value.trim() || null } }); toast('Aprovada'); G.refreshNav(); G.route(); } catch (err) { toast(err.message, true); } };
    const no = $('#d-no'); if (no) no.onclick = async () => { const motivo = $('#v-com').value.trim() || prompt('Por que recusar?'); if (motivo === null) return; try { await api(`/api/propostas/${p.id}/decidir`, { method: 'POST', body: { decisao: 'recusada', motivo } }); toast('Recusada'); G.refreshNav(); G.route(); } catch (err) { toast(err.message, true); } };
    const rv = $('#d-rev'); if (rv) rv.onclick = async () => { const motivo = prompt('Por que reverter?'); if (motivo === null) return; try { await api(`/api/propostas/${p.id}/reverter`, { method: 'POST', body: { motivo } }); toast('Revertida'); G.route(); } catch (err) { toast(err.message, true); } };
  }

  // ── configurações ─────────────────────────────────────────────────────
  async function renderConfig() {
    if (!isEditor()) { app().innerHTML = '<div class="empty">Só editores.</div>'; return; }
    const c = await api('/api/config');
    app().innerHTML = `<div class="head"><div><h1>Configurações</h1><p class="muted sm">Como o conhecimento é aprovado e quanto cabe em cada chamada do MCP.</p></div></div>
      <div class="two"><div class="card"><div class="kicker">Aprovação</div>
        <label>Votos líquidos que aprovam uma proposta sem editor</label><input id="c-votos" type="number" min="1" max="20" value="${c.votos}" style="width:120px">
        <p class="muted sm">Editor aprova a qualquer momento; urgente só por editor. Aprovadas por votos ficam 30 dias no painel com Reverter.</p>
        <label>Dias até um caso/teste pendente aparecer na Saúde</label><input id="c-dias" type="number" min="1" value="${c.dias_pendente}" style="width:120px">
        <div class="actions"><button class="btn btn-p" id="c-save">Salvar</button></div></div>
      <div class="card"><div class="kicker">Limites (fixos no código)</div><dl class="kv"><dt>título</dt><dd>${c.limites.titulo} caracteres</dd><dt>corpo</dt><dd>${c.limites.corpo} caracteres</dd><dt>sempre</dt><dd>${c.limites.sempre} entradas · ${Math.round(c.limites.nivel0_bytes / 1024)} KB por chamada</dd><dt>índice</dt><dd>${c.limites.indice} linhas · ${Math.round(c.limites.indice_bytes / 1024)} KB</dd><dt>tool completo</dt><dd>${c.limites.tool_completo} entradas</dd><dt>tool índice</dt><dd>${c.limites.tool_indice} entradas</dd></dl></div></div>`;
    $('#c-save').onclick = async () => { try { await api('/api/config', { method: 'PUT', body: { votos: Number($('#c-votos').value), dias_pendente: Number($('#c-dias').value) } }); toast('Salvo'); } catch (err) { toast(err.message, true); } };
  }

  // ── saúde (bloco usado pela tela Saúde do app.js) ─────────────────────
  function saudeBlock(k) {
    const s = k.sempre; const pctN = Math.round(100 * s.n / s.limite_n); const pctB = Math.round(100 * s.bytes / s.limite_bytes);
    const cls = (p) => (p >= 100 ? 'bad' : p >= 80 ? 'mid' : '');
    return `<h2>Conhecimento</h2>
      <div class="stats">
        <div class="stat"><div class="stat-k">Entradas ativas</div><div class="stat-v">${k.por_tipo.reduce((a, x) => a + x.n, 0)} <small>${k.por_tipo.slice(0, 4).map((x) => `${x.n} ${x.tipo}`).join(' · ')}</small></div></div>
        <div class="stat ${pctB >= 100 || pctN >= 100 ? 'warn-k' : ''}"><div class="stat-k">Sempre (nível 0)</div><div class="stat-v">${s.n}<small>/${s.limite_n} · ${(s.bytes / 1024).toFixed(1)} KB de ${Math.round(s.limite_bytes / 1024)}</small></div><span class="bar ${cls(Math.max(pctN, pctB))}" style="display:block;margin-top:6px"><span style="width:${Math.min(100, Math.max(pctN, pctB))}%"></span></span></div>
        <div class="stat ${k.propostas.urgentes_24h ? 'warn-k' : ''}"><div class="stat-k">Propostas</div><div class="stat-v"><a href="#/pendencias">${k.propostas.abertas}</a> <small>abertas · ${k.propostas.urgentes} urgentes${k.propostas.urgentes_24h ? ` · ${k.propostas.urgentes_24h} há +24h` : ''} · ${k.propostas.por_votos_30d} por votos</small></div></div>
        <div class="stat ${k.verificacao_vencida ? 'warn-k' : ''}"><div class="stat-k">Verificação</div><div class="stat-v"><a href="#/conhecimento?verif=nao">${k.nao_verificadas}</a> <small>sem verificar · ${k.verificacao_vencida} vencidas</small></div></div>
        <div class="stat ${k.pendentes ? 'warn-k' : ''}"><div class="stat-k">Resultados a fechar</div><div class="stat-v"><a href="#/pendencias?t=pendentes">${k.pendentes}</a> <small>casos/testes · ${k.contradicoes_abertas} contradições</small></div></div>
      </div>`;
  }

  window.KB = { route, saudeBlock };
})();
