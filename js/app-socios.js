/* ========================================================= */
/* LÓGICA DE ENGENHARIA E GESTÃO: ÁREA DO SÓCIO              */
/* ========================================================= */

const listaColaboradores = [
    "Ana Carolina Bittencourt", "Ana Clara Fabris", "Ana Clara Yumi", "Barbara Figueiredo",
    "Carlos Oliveira", "Debora Yuan", "Eduardo Figueiredo", "Felipe Penido", "João Pedro Soares",
    "Juliana Deoracki", "Leonardo Assis", "Leonardo Pierangelli", "Louise Varela", "Manuela Pires",
    "Maria de Macedo", "Maria Eduarda Aguiar", "Maria Emília Velozo", "Matheus Zucon",
    "Otavio Pimentel", "Rafaela Avila", "Sâmia Franco", "Stefano Miceli", "Susana Vicenti",
    "Thiago Zamin", "Victor Hugo Mendes"
].sort();

const emailsSocios = [
    'debora.yuan@cadarnconsultoria.com.br',
    'felipe.penido@cadarnconsultoria.com.br',
    'leonardo.assis@cadarnconsultoria.com.br',
    'juliana.deoracki@cadarnconsultoria.com.br',
    'victor.mendes@cadarnconsultoria.com.br'
];

let db;
let firestore = {};
let bdProjetos = {};
let bdColabs = {};
let filtroResponsavel = "";

let projetoModalAberto = null;
let isCriandoNovo = false;
let etapasTemporarias = [];
let usuarioLogado = localStorage.getItem('cadarn_user') || 'Sócio';
// Controle do Calendário
let dataAtualCalendario = new Date();

async function initSegurancaSocios() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
    const { getFirestore, collection, onSnapshot, doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");

    firestore = { collection, onSnapshot, doc, setDoc };

    const firebaseConfig = {
        apiKey: "AIzaSyAnClCbOU3JRBehpGvrKj8RrcS86lyl3gg",
        authDomain: "cadarn-hub.firebaseapp.com",
        projectId: "cadarn-hub",
        storageBucket: "cadarn-hub.firebasestorage.app",
        messagingSenderId: "1078276499614",
        appId: "1:1078276499614:web:135e544d9c26e3bd2f338f"
    };

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, "cadarn-hub"); 
    const auth = getAuth(app);

    onAuthStateChanged(auth, (user) => {
        if (!user || !emailsSocios.includes(user.email.toLowerCase().trim())) {
            window.location.href = 'index.html'; 
        } else {
            document.getElementById('conteudo-restrito').style.display = 'block';
            iniciarUI();
            iniciarListeners();
        }
    });
}

function iniciarUI() {
    const selectFiltro = document.getElementById('filtro-responsavel');
    if(selectFiltro) {
        let options = '<option value="">Todos da Equipe</option>';
        listaColaboradores.forEach(nome => { options += `<option value="${nome}">${nome}</option>`; });
        selectFiltro.innerHTML = options;
    }

    const datalistLider = document.getElementById('lista-nomes-datalist');
    if(datalistLider) {
        datalistLider.innerHTML = listaColaboradores.map(nome => `<option value="${nome}">`).join('');
    }
    setupAutocompleteMulti(document.getElementById("modal-equipe"), listaColaboradores);
}

function iniciarListeners() {
    firestore.onSnapshot(firestore.collection(db, "projetos"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === "removed") delete bdProjetos[id];
            else bdProjetos[id] = change.doc.data();
        });
        renderKanban();
        renderWorkload();
        renderCronograma('gantt-master-container', filtroResponsavel); // NOVO
    });
    inicializarDragAndDrop();
}

function switchTab(tab) {
    const views = ['projetos', 'pessoas', 'cronograma'];
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if(el) el.style.opacity = '0';
    });

    setTimeout(() => {
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if(el) el.style.display = (tab === v) ? 'block' : 'none';
        });
        setTimeout(() => { 
            views.forEach(v => {
                const el = document.getElementById(`view-${v}`);
                if(el) el.style.opacity = '1';
            });
            if(tab === 'cronograma') renderCronograma('gantt-master-container', filtroResponsavel);
        }, 50);
    }, 150);

    views.forEach(v => {
        const btn = document.getElementById(`tab-btn-${v}`);
        if(btn) btn.classList.toggle('active', tab === v);
    });
}

function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban(); 
    renderWorkload(); 
    renderCronograma('gantt-master-container', filtroResponsavel); // NOVO
}

function showToast(message, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function sanitize(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
    return String(str).replace(/[&<>"'/]/ig, (match) => map[match]);
}

// ==========================================
// KANBAN
// ==========================================
function renderKanban() {
    let htmlNegociacao = ''; let htmlAndamento = ''; let htmlConcluido = '';
    const hoje = new Date(new Date().setHours(0,0,0,0));

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;

        if (filtroResponsavel) {
            const temTarefaResponsavel = (proj.etapas || []).some(t => t.responsavel === filtroResponsavel);
            if (!temTarefaResponsavel && proj.lider !== filtroResponsavel && !(proj.equipeAtual || []).includes(filtroResponsavel)) continue;
        }

        const statusCrm = proj.status_crm || 'negociacao';
        const etapas = proj.etapas || [];
        const isVisivel = proj.visivelHub ? '<span title="Visível no Hub da Equipe" style="color:#47e299;">👁️ Equipe Vê</span>' : '<span title="Oculto da equipe" style="color:#ffc107;">🙈 Rascunho Sócio</span>';
        
        let temAtraso = etapas.some(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) < hoje);
        let borderStyle = temAtraso ? 'border-color: #dc3545; box-shadow: 0 0 10px rgba(220,53,69,0.3);' : '';
        let atrasoBadge = temAtraso ? '<span style="background:rgba(220,53,69,0.2); color:#ff8793; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:bold; text-transform:uppercase;">Atrasado</span>' : '';
        
        const tagsHtml = (proj.tags || []).slice(0,3).map(t => `<span style="background: rgba(131, 46, 255, 0.15); color: #c5a3ff; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 12px; border: 1px solid rgba(131,46,255,0.3);">${sanitize(t)}</span>`).join('');

        const card = `
            <div class="kanban-card" style="${borderStyle} padding: 18px;" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px;">
                    <div style="font-size: 16px; font-weight: 700; color: white;">${sanitize(proj.nome || 'Sem Nome')}</div>
                    ${atrasoBadge}
                </div>
                <div style="font-size: 12px; color: var(--cadarn-cinza); margin-bottom: 10px; font-weight: 500;">${sanitize(proj.cliente || 'Sem Cliente')}</div>
                <div style="display:flex; gap: 5px; flex-wrap: wrap; margin-bottom: 15px;">${tagsHtml}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; font-size: 11px;">
                    <div style="color: var(--cadarn-cinza);">📝 ${etapas.filter(t => t.status === 'concluido').length}/${etapas.length} Etapas</div>
                    <div style="font-weight: bold; font-size: 10px;">${isVisivel}</div>
                </div>
            </div>
        `;

        if (statusCrm === 'negociacao') htmlNegociacao += card;
        else if (statusCrm === 'andamento') htmlAndamento += card;
        else if (statusCrm === 'concluido') htmlConcluido += card;
    }

    document.getElementById('col-negociacao').innerHTML = htmlNegociacao || '<div style="font-size:12px; color:var(--cadarn-cinza);">Nenhum projeto no backlog.</div>';
    document.getElementById('col-andamento').innerHTML = htmlAndamento || '<div style="font-size:12px; color:var(--cadarn-cinza);">Nenhum projeto em delivery.</div>';
    document.getElementById('col-concluidos').innerHTML = htmlConcluido || '<div style="font-size:12px; color:var(--cadarn-cinza);">Vazio.</div>';
}

function inicializarDragAndDrop() {
    const colunas = [document.getElementById('col-negociacao'), document.getElementById('col-andamento'), document.getElementById('col-concluidos')];
    colunas.forEach(coluna => {
        new Sortable(coluna, {
            group: 'kanban_socios', animation: 150, ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                const itemEl = evt.item; const toList = evt.to;
                const projetoId = itemEl.getAttribute('data-id');
                const novoStatus = toList.getAttribute('data-status');

                if(projetoId && novoStatus) {
                    try { await firestore.setDoc(firestore.doc(db, "projetos", projetoId), { status_crm: novoStatus }, { merge: true }); } 
                    catch (e) { console.error("Erro ao mover card:", e); }
                }
            },
        });
    });
}

// ==========================================
// MODAL DO PROJETO
// ==========================================
function novoProjetoSocio() {
    isCriandoNovo = true;
    projetoModalAberto = 'proj_' + Date.now();
    etapasTemporarias = [{ titulo: 'Planejamento Inicial', responsavel: '', prazo: '', status: 'pendente', kickoff: '' }];
    
    const camposParaLimpar = ['modal-proj-nome', 'modal-proj-cliente', 'modal-desc', 'modal-tags', 'modal-equipe', 'modal-licoes'];
    camposParaLimpar.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });

    const elLider = document.getElementById('modal-lider');
    if (elLider) elLider.value = usuarioLogado;
    
    const elVisivel = document.getElementById('modal-proj-visivel');
    if (elVisivel) elVisivel.checked = false;

    renderTarefasModalTemporario();
    const modal = document.getElementById('modal-projeto');
    if (modal) modal.classList.add('active');
}

function abrirModalProjeto(id) {
    isCriandoNovo = false;
    projetoModalAberto = id;
    const proj = bdProjetos[id];
    
    const setVal = (elementId, val) => { const el = document.getElementById(elementId); if(el) el.value = val; };
    setVal('modal-proj-nome', proj.nome || '');
    setVal('modal-proj-cliente', proj.cliente || '');
    setVal('modal-lider', proj.lider || '');
    setVal('modal-desc', proj.descricao || '');
    setVal('modal-tags', (proj.tags || []).join(', '));
    setVal('modal-equipe', (proj.equipeAtual || []).join(', '));
    setVal('modal-licoes', proj.licoes || '');

    const elVisivel = document.getElementById('modal-proj-visivel');
    if (elVisivel) elVisivel.checked = proj.visivelHub === true;

    etapasTemporarias = proj.etapas ? JSON.parse(JSON.stringify(proj.etapas)) : [];
    
    renderTarefasModalTemporario();
    const modal = document.getElementById('modal-projeto');
    if (modal) modal.classList.add('active');
}

function fecharModalProjeto(e) {
    if(!e || e.target === document.getElementById('modal-projeto') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-projeto').classList.remove('active');
        projetoModalAberto = null;
        etapasTemporarias = [];
    }
}

function renderTarefasModalTemporario() {
    let html = '';
    let optionsColabs = '<option value="">Responsável...</option>';
    listaColaboradores.forEach(nome => { optionsColabs += `<option value="${nome}">${nome}</option>`; });

    etapasTemporarias.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel || ''}"`, `value="${t.responsavel || ''}" selected`);
        html += `
            <div class="task-container">
                <div class="task-row">
                    <input type="text" value="${t.titulo || ''}" placeholder="Qual a entrega?" onchange="atualizarEtapaMemoria(${idx}, 'titulo', this.value)">
                    <select onchange="atualizarEtapaMemoria(${idx}, 'responsavel', this.value)">${optionsResps}</select>
                    <input type="date" value="${t.prazo || ''}" onchange="atualizarEtapaMemoria(${idx}, 'prazo', this.value)">
                    <select onchange="atualizarEtapaMemoria(${idx}, 'status', this.value)">
                        <option value="pendente" ${t.status === 'pendente'?'selected':''}>Pendente</option>
                        <option value="ativo" ${t.status === 'ativo'?'selected':''}>Fazendo</option>
                        <option value="concluido" ${t.status === 'concluido'?'selected':''}>Concluída</option>
                    </select>
                    <button class="sp-btn-edit" style="background: rgba(220,53,69,0.2); color: #ff8793; border-color: transparent; padding: 6px 12px;" onclick="removerEtapaMemoria(${idx})" title="Excluir">✕</button>
                </div>
                <div class="task-kickoff">
                    <textarea placeholder="🔗 Kick-off: Cole links e instruções..." onchange="atualizarEtapaMemoria(${idx}, 'kickoff', this.value)">${t.kickoff || ''}</textarea>
                </div>
            </div>
        `;
    });
    if(etapasTemporarias.length === 0) html = '<div style="color:var(--cadarn-cinza); font-size:13px; padding:15px; text-align:center;">Nenhuma tarefa estruturada.</div>';
    document.getElementById('lista-tarefas').innerHTML = html;
}

function adicionarNovaTarefaModal() {
    etapasTemporarias.push({ titulo: '', responsavel: '', prazo: '', status: 'pendente', kickoff: '' });
    renderTarefasModalTemporario();
}

function atualizarEtapaMemoria(idx, campo, valor) { if(etapasTemporarias[idx]) etapasTemporarias[idx][campo] = valor; }
function removerEtapaMemoria(idx) { etapasTemporarias.splice(idx, 1); renderTarefasModalTemporario(); }

async function salvarProjetoSocio() {
    if (!projetoModalAberto) return;
    const elNome = document.getElementById('modal-proj-nome');
    const elCliente = document.getElementById('modal-proj-cliente');
    const elLider = document.getElementById('modal-lider');
    const elDesc = document.getElementById('modal-desc');
    const elTags = document.getElementById('modal-tags');
    const elEquipe = document.getElementById('modal-equipe');
    const elLicoes = document.getElementById('modal-licoes');
    const elVisivel = document.getElementById('modal-proj-visivel');

    const projData = {
        nome: elNome?.value?.trim() || 'Projeto Estratégico',
        cliente: elCliente?.value?.trim() || 'Cliente Não Informado',
        lider: elLider?.value?.trim() || usuarioLogado,
        descricao: elDesc?.value || '',
        tags: elTags?.value ? elTags.value.split(',').map(s=>s.trim()).filter(Boolean) : [],
        equipeAtual: elEquipe?.value ? elEquipe.value.split(',').map(s=>s.trim()).filter(Boolean) : [],
        licoes: elLicoes?.value || '',
        visivelHub: elVisivel?.checked || false,
        etapas: etapasTemporarias,
        arquivado: false
    };

    if (isCriandoNovo) {
        projData.status_crm = 'negociacao';
        projData.dataCriacao = Date.now();
        projData.dataConclusao = null;
        projData.equipeAntiga = [];
    }

    try {
        await firestore.setDoc(firestore.doc(db, "projetos", projetoModalAberto), projData, { merge: true });
        showToast('✅ Projeto salvo e sincronizado na nuvem!', 'success');
        fecharModalProjeto(); 
    } catch (e) {
        alert("ALERTA DE SEGURANÇA: O Firebase rejeitou a gravação.\nMotivo: " + e.message); 
    }
}

// ==========================================
// MOTOR DE ALOCAÇÃO (WORKLOAD)
// ==========================================
function renderWorkload() {
    const workload = {};
    const hoje = new Date(new Date().setHours(0,0,0,0));

    listaColaboradores.forEach(nome => { workload[nome] = { ativas: 0, atrasadas: 0, concluidas: 0, tarefasRefs: [] }; });

    for (const [pId, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.status_crm === 'concluido') continue;
        
        (proj.etapas || []).forEach(t => {
            if (t.responsavel && workload[t.responsavel] !== undefined) {
                if (t.status === 'concluido') {
                    workload[t.responsavel].concluidas++;
                } else {
                    workload[t.responsavel].ativas++;
                    let isAtrasada = t.prazo && new Date(t.prazo) < hoje;
                    if(isAtrasada) workload[t.responsavel].atrasadas++;
                    
                    workload[t.responsavel].tarefasRefs.push(`
                        <div style="padding: 8px; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; gap:4px;">
                            <span style="color: ${isAtrasada ? '#ff8793' : 'var(--cadarn-branco)'}; font-size:12px; font-weight:600;">${t.titulo || 'Tarefa sem nome'}</span>
                            <span style="color:var(--cadarn-roxo-claro); font-size:10px;">${proj.nome} (${proj.cliente})</span>
                        </div>
                    `);
                }
            }
        });
    }

    let html = '';
    Object.keys(workload).sort().forEach(nome => {
        if (filtroResponsavel && nome !== filtroResponsavel) return;

        const data = workload[nome];
        let statusClass = 'wl-status-ideal'; let statusText = 'Equilibrado';
        if (data.ativas <= 1) { statusClass = 'wl-status-ocioso'; statusText = 'Ocioso (Capacidade)'; }
        if (data.ativas >= 5 || data.atrasadas >= 2) { statusClass = 'wl-status-sobrecarga'; statusText = 'Sobrecarga / Risco'; }

        html += `
            <div class="wl-card">
                <div class="wl-header">
                    <div style="font-size:16px; font-weight:800; color:white; letter-spacing:-0.5px;">👤 ${nome}</div>
                    <div class="wl-status-badge ${statusClass}">${statusText}</div>
                </div>
                <div class="wl-stats">
                    <div class="wl-stat-box">
                        <div style="font-size:10px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:700;">Tarefas Ativas</div>
                        <div style="font-size:24px; font-weight:800; color:white;">${data.ativas}</div>
                    </div>
                    <div class="wl-stat-box" style="border: 1px solid ${data.atrasadas > 0 ? 'rgba(220,53,69,0.5)' : 'transparent'}; background: ${data.atrasadas > 0 ? 'rgba(220,53,69,0.1)' : 'rgba(255,255,255,0.02)'};">
                        <div style="font-size:10px; color: ${data.atrasadas > 0 ? '#ff8793' : 'var(--cadarn-cinza)'}; text-transform:uppercase; font-weight:700;">Atrasadas</div>
                        <div style="font-size:24px; font-weight:800; color:${data.atrasadas > 0 ? '#ff8793' : 'white'};">${data.atrasadas}</div>
                    </div>
                </div>
                <div style="margin-top: 5px;">
                    <div style="font-size:11px; color:var(--cadarn-cinza); margin-bottom:10px; text-transform:uppercase; font-weight:800;">Lista de Foco (A Fazer)</div>
                    <div class="wl-tasks-list">
                        ${data.tarefasRefs.length > 0 ? data.tarefasRefs.join('') : '<div style="color:#666; font-style:italic; padding:10px; text-align:center;">Nenhuma entrega mapeada.</div>'}
                    </div>
                </div>
            </div>
        `;
    });
    document.getElementById('workload-container').innerHTML = html;
}

// ==========================================
// CRONOGRAMA GANTT (NOVO E EXPLOSIVO)
// ==========================================
function renderCronograma(containerId, filterUser = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Janela de Tempo: 10 dias atrás até 50 dias no futuro (Total 60 dias de visão)
    const startDate = new Date(); 
    startDate.setDate(startDate.getDate() - 10);
    startDate.setHours(0,0,0,0);
    const totalDays = 60;
    const colWidth = 40; // Pixels por dia

    // 1. Constrói o Cabeçalho de Dias
    let headersHtml = '';
    const mesesStr = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];
    
    for(let i=0; i<totalDays; i++) {
        let d = new Date(startDate); d.setDate(d.getDate() + i);
        let isHoje = d.getTime() === new Date(new Date().setHours(0,0,0,0)).getTime();
        
        headersHtml += `
            <div class="gantt-day-col ${isHoje ? 'hoje' : ''}">
                <div class="gantt-day-name">${diasSemana[d.getDay()]}</div>
                <div class="gantt-day-num">${d.getDate()}</div>
            </div>
        `;
    }

    // 2. Constrói o Corpo (Barra Lateral Esquerda + Grid Direito)
    let sidebarHtml = `<div class="gantt-sidebar-header">Projetos e Entregas</div>`;
    let timelineHtml = `<div class="gantt-header-row" style="width: ${totalDays * colWidth}px;">${headersHtml}</div><div class="gantt-body" style="width: ${totalDays * colWidth}px;">`;

    let temProjetos = false;

    // Filtra e desenha os projetos
    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if(proj.arquivado) return; // Sócios veem tudo, mas não o lixo
        
        let etapasProj = proj.etapas || [];
        
        if(filterUser) {
            etapasProj = etapasProj.filter(e => e.responsavel === filterUser);
            if(etapasProj.length === 0 && proj.lider !== filterUser && !(proj.equipeAtual || []).includes(filterUser)) return;
        }

        temProjetos = true;

        // Desenha a linha do Título do Projeto (Esquerda e Direita vazia)
        sidebarHtml += `<div class="gantt-sidebar-item gantt-sidebar-proj" onclick="abrirModalProjeto('${id}')">📁 ${sanitize(proj.nome)}</div>`;
        timelineHtml += `<div class="gantt-row" style="background: rgba(255,255,255,0.02);"></div>`;

        // Desenha as barras de tarefas desse projeto
        etapasProj.forEach(t => {
            if(!t.prazo) return; // Se não tem data, não vai pro Gantt
            
            let deadline = new Date(t.prazo);
            deadline.setMinutes(deadline.getMinutes() + deadline.getTimezoneOffset());
            deadline.setHours(0,0,0,0);

            // Simula um "Início de Tarefa" 4 dias antes do prazo para dar aquele visual de barra (já que o sistema atual só tem Deadline)
            let startTask = new Date(deadline); 
            startTask.setDate(startTask.getDate() - 4);

            let startDiff = Math.floor((startTask - startDate) / (1000 * 60 * 60 * 24));
            let endDiff = Math.floor((deadline - startDate) / (1000 * 60 * 60 * 24));

            if(endDiff < 0 || startDiff >= totalDays) return; // Tarefa totalmente fora do radar da tela

            // Ajusta corte se a barra vazar as bordas da tela
            startDiff = Math.max(0, startDiff);
            endDiff = Math.min(totalDays - 1, endDiff);
            
            let widthPx = (endDiff - startDiff + 1) * colWidth;
            let leftPx = startDiff * colWidth;

            // Cores baseadas no Status
            let colorClass = 'gb-pendente';
            if(t.status === 'concluido') colorClass = 'gb-concluido';
            else if(t.status === 'ativo') colorClass = 'gb-ativo';
            else if(deadline < new Date(new Date().setHours(0,0,0,0))) colorClass = 'gb-atrasado';

            const respNome = t.responsavel ? t.responsavel.split(' ')[0] : 'S/ Dono';
            const respInicial = respNome.charAt(0).toUpperCase();

            // Esquerda (Nome da Tarefa)
            sidebarHtml += `<div class="gantt-sidebar-item" style="padding-left: 30px; color: var(--cadarn-cinza);" onclick="abrirModalProjeto('${id}')">↳ ${sanitize(t.titulo)}</div>`;
            
            // Direita (A Barra Colorida)
            timelineHtml += `
                <div class="gantt-row">
                    <div class="gantt-bar-wrapper" style="left: ${leftPx}px; width: ${widthPx}px;">
                        <div class="gantt-bar ${colorClass}" title="${sanitize(t.titulo)} - Responsável: ${sanitize(t.responsavel)}" onclick="abrirModalProjeto('${id}')">
                            <div class="gantt-bar-avatar">${respInicial}</div>
                            ${sanitize(t.titulo)}
                        </div>
                    </div>
                </div>
            `;
        });
    });

    if(!temProjetos) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--cadarn-cinza);">Nenhuma entrega com prazo mapeada no filtro atual.</div>`;
        return;
    }

    timelineHtml += `</div>`; // Fecha corpo

    container.innerHTML = `
        <div class="gantt-wrapper">
            <div class="gantt-sidebar">${sidebarHtml}</div>
            <div class="gantt-timeline-container">${timelineHtml}</div>
        </div>
    `;
}

// ==========================================
// ALGORITMO MULTIVALOR (Autocomplete)
// ==========================================
function setupAutocompleteMulti(inputElement, arr) {
    if(!inputElement) return;
    let currentFocus;
    inputElement.addEventListener("input", function(e) {
        let a, b, i, val = this.value;
        closeAllLists();
        if (!val) return false;
        currentFocus = -1;
        
        let segments = val.split(',');
        let currentSegment = segments[segments.length - 1].trim().toLowerCase();
        if(!currentSegment) return false;

        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);

        for (i = 0; i < arr.length; i++) {
            if (arr[i].toLowerCase().includes(currentSegment)) {
                b = document.createElement("DIV");
                const matchIndex = arr[i].toLowerCase().indexOf(currentSegment);
                b.innerHTML = arr[i].substring(0, matchIndex) + "<strong><span style='color: #c5a3ff;'>" + arr[i].substring(matchIndex, matchIndex + currentSegment.length) + "</span></strong>" + arr[i].substring(matchIndex + currentSegment.length);
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener("click", function(e) {
                    segments[segments.length - 1] = " " + this.getElementsByTagName("input")[0].value;
                    inputElement.value = segments.join(',').trim() + ", ";
                    closeAllLists();
                    inputElement.focus();
                });
                a.appendChild(b);
            }
        }
    });

    inputElement.addEventListener("keydown", function(e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { currentFocus++; addActive(x); }
        else if (e.keyCode == 38) { currentFocus--; addActive(x); }
        else if (e.keyCode == 13) { e.preventDefault(); if (currentFocus > -1) { if (x) x[currentFocus].click(); } }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) { for (let i = 0; i < x.length; i++) { x[i].classList.remove("autocomplete-active"); } }
    function closeAllLists(elmnt) {
        const x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) { if (elmnt != x[i] && elmnt != inputElement) { x[i].parentNode.removeChild(x[i]); } }
    }
    document.addEventListener("click", function (e) { closeAllLists(e.target); });
}

initSegurancaSocios();

window.switchTab = switchTab;
window.aplicarFiltros = aplicarFiltros;
window.abrirModalProjeto = abrirModalProjeto;
window.fecharModalProjeto = fecharModalProjeto;
window.novoProjetoSocio = novoProjetoSocio;
window.salvarProjetoSocio = salvarProjetoSocio;
window.adicionarNovaTarefaModal = adicionarNovaTarefaModal;
window.atualizarEtapaMemoria = atualizarEtapaMemoria;
window.removerEtapaMemoria = removerEtapaMemoria;
window.mudarMes = mudarMes;
window.irParaHoje = irParaHoje;
