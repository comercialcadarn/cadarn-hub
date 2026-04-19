/* ========================================================= */
/* LÓGICA DE ENGENHARIA E GESTÃO: ÁREA DO SÓCIO              */
/* ========================================================= */

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

// Variáveis de Controle do Modal (Rascunho)
let projetoModalAberto = null;
let isCriandoNovo = false;
let etapasTemporarias = [];
let usuarioLogado = localStorage.getItem('cadarn_user') || 'Sócio';

async function initSegurancaSocios() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
    const { getFirestore, collection, onSnapshot, doc, updateDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");

    firestore = { collection, onSnapshot, doc, updateDoc, setDoc };

    const firebaseConfig = {
        apiKey: "AIzaSyAnClCbOU3JRBehpGvrKj8RrcS86lyl3gg",
        authDomain: "cadarn-hub.firebaseapp.com",
        projectId: "cadarn-hub",
        storageBucket: "cadarn-hub.firebasestorage.app",
        messagingSenderId: "1078276499614",
        appId: "1:1078276499614:web:135e544d9c26e3bd2f338f"
    };

    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    const auth = getAuth(app);

    onAuthStateChanged(auth, (user) => {
        if (!user || !emailsSocios.includes(user.email.toLowerCase().trim())) {
            window.location.href = 'index.html'; 
        } else {
            document.getElementById('conteudo-restrito').style.display = 'block';
            iniciarListeners();
        }
    });
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
        popularSelectFiltro();
    });

    firestore.onSnapshot(firestore.collection(db, "colaboradores"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            bdColabs[change.doc.id] = change.doc.data();
        });
        popularSelectFiltro();
        renderWorkload();
    });

    inicializarDragAndDrop();
}

function switchTab(tab) {
    const vProj = document.getElementById('view-projetos');
    const vPess = document.getElementById('view-pessoas');
    
    vProj.style.opacity = '0'; vPess.style.opacity = '0';

    setTimeout(() => {
        vProj.style.display = tab === 'projetos' ? 'block' : 'none';
        vPess.style.display = tab === 'pessoas' ? 'block' : 'none';
        setTimeout(() => { vProj.style.opacity = '1'; vPess.style.opacity = '1'; }, 50);
    }, 150);

    document.getElementById('tab-btn-projetos').classList.toggle('active', tab === 'projetos');
    document.getElementById('tab-btn-pessoas').classList.toggle('active', tab === 'pessoas');
}

function popularSelectFiltro() {
    const select = document.getElementById('filtro-responsavel');
    const valorAtual = select.value;
    let options = '<option value="">Todos os Colaboradores</option>';
    Object.keys(bdColabs).sort().forEach(nome => { options += `<option value="${nome}">${nome}</option>`; });
    select.innerHTML = options; select.value = valorAtual;
}

function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban(); renderWorkload();
}

function showToast(message, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ==========================================
// KANBAN E RENDERIZAÇÃO
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
        const isVisivel = proj.visivelHub ? '<span title="Visível no Hub da Equipe" style="color:#47e299;">👁️</span>' : '<span title="Rascunho (Oculto da equipe)" style="color:#ffc107;">🙈</span>';
        
        let temAtraso = etapas.some(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) < hoje);
        let borderStyle = temAtraso ? 'border-color: #dc3545; box-shadow: 0 0 10px rgba(220,53,69,0.3);' : '';
        let atrasoBadge = temAtraso ? '<span style="background:rgba(220,53,69,0.2); color:#ff8793; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; text-transform:uppercase;">Atrasado</span>' : '';

        const card = `
            <div class="kanban-card" style="${borderStyle}" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="kanban-card-title">${proj.nome || 'Sem Nome'} ${isVisivel}</div>
                    ${atrasoBadge}
                </div>
                <div class="kanban-card-meta">${proj.cliente || 'Sem Cliente'}</div>
                <div style="margin-top: 10px; font-size: 11px; color: var(--cadarn-cinza); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                    📝 ${etapas.filter(t => t.status === 'concluido').length}/${etapas.length} Etapas concluídas
                </div>
            </div>
        `;

        if (statusCrm === 'negociacao') htmlNegociacao += card;
        else if (statusCrm === 'andamento') htmlAndamento += card;
        else if (statusCrm === 'concluido') htmlConcluido += card;
    }

    document.getElementById('col-negociacao').innerHTML = htmlNegociacao || '<div style="font-size:12px; color:var(--cadarn-cinza);">Vazio</div>';
    document.getElementById('col-andamento').innerHTML = htmlAndamento || '<div style="font-size:12px; color:var(--cadarn-cinza);">Vazio</div>';
    document.getElementById('col-concluidos').innerHTML = htmlConcluido || '<div style="font-size:12px; color:var(--cadarn-cinza);">Vazio</div>';
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
                    try { await firestore.updateDoc(firestore.doc(db, "projetos", projetoId), { status_crm: novoStatus }); } 
                    catch (e) { console.error(e); }
                }
            },
        });
    });
}

// ==========================================
// CRIAÇÃO E SALVAMENTO DE PROJETOS (MODAL)
// ==========================================
function novoProjetoSocio() {
    isCriandoNovo = true;
    projetoModalAberto = 'proj_' + Date.now();
    etapasTemporarias = [{ titulo: 'Planejamento Inicial', responsavel: '', prazo: '', status: 'pendente' }];
    
    // Limpa a tela
    document.getElementById('modal-proj-nome').value = '';
    document.getElementById('modal-proj-cliente').value = '';
    document.getElementById('modal-lider').value = usuarioLogado;
    document.getElementById('modal-desc').value = '';
    document.getElementById('modal-tags').value = '';
    document.getElementById('modal-equipe').value = '';
    document.getElementById('modal-licoes').value = '';
    document.getElementById('modal-proj-visivel').checked = false;

    renderTarefasModalTemporario();
    document.getElementById('modal-projeto').classList.add('active');
}

function abrirModalProjeto(id) {
    isCriandoNovo = false;
    projetoModalAberto = id;
    const proj = bdProjetos[id];
    
    document.getElementById('modal-proj-nome').value = proj.nome || '';
    document.getElementById('modal-proj-cliente').value = proj.cliente || '';
    document.getElementById('modal-lider').value = proj.lider || '';
    document.getElementById('modal-desc').value = proj.descricao || '';
    document.getElementById('modal-tags').value = (proj.tags || []).join(', ');
    document.getElementById('modal-equipe').value = (proj.equipeAtual || []).join(', ');
    document.getElementById('modal-licoes').value = proj.licoes || '';
    document.getElementById('modal-proj-visivel').checked = proj.visivelHub === true;

    // Copia as etapas do banco para a memória (Rascunho local)
    etapasTemporarias = proj.etapas ? JSON.parse(JSON.stringify(proj.etapas)) : [];
    
    renderTarefasModalTemporario();
    document.getElementById('modal-projeto').classList.add('active');
}

function fecharModalProjeto(e) {
    if(!e || e.target === document.getElementById('modal-projeto') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-projeto').classList.remove('active');
        projetoModalAberto = null;
        etapasTemporarias = [];
    }
}

// ==========================================
// TAREFAS/ETAPAS (EM MEMÓRIA ANTES DE SALVAR)
// ==========================================
function renderTarefasModalTemporario() {
    let html = '';
    let optionsColabs = '<option value="">Atribuir a...</option>';
    Object.keys(bdColabs).sort().forEach(nome => { optionsColabs += `<option value="${nome}">${nome}</option>`; });

    etapasTemporarias.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel || ''}"`, `value="${t.responsavel || ''}" selected`);
        
        html += `
            <div class="task-row">
                <input type="text" value="${t.titulo || ''}" placeholder="Descrição da etapa" onchange="atualizarEtapaMemoria(${idx}, 'titulo', this.value)">
                <select onchange="atualizarEtapaMemoria(${idx}, 'responsavel', this.value)">${optionsResps}</select>
                <input type="date" value="${t.prazo || ''}" onchange="atualizarEtapaMemoria(${idx}, 'prazo', this.value)">
                <select onchange="atualizarEtapaMemoria(${idx}, 'status', this.value)">
                    <option value="pendente" ${t.status === 'pendente'?'selected':''}>Pendente</option>
                    <option value="ativo" ${t.status === 'ativo'?'selected':''}>Ativo/Fazendo</option>
                    <option value="concluido" ${t.status === 'concluido'?'selected':''}>Concluída</option>
                </select>
                <button class="sp-btn-edit" style="background: rgba(220,53,69,0.2); color: #ff8793; border-color: transparent; padding: 6px;" onclick="removerEtapaMemoria(${idx})" title="Excluir">🗑️</button>
            </div>
        `;
    });

    if(etapasTemporarias.length === 0) html = '<div style="color:var(--cadarn-cinza); font-size:13px; padding:15px; text-align:center;">Nenhuma tarefa estruturada.</div>';
    document.getElementById('lista-tarefas').innerHTML = html;
}

function adicionarNovaTarefaModal() {
    etapasTemporarias.push({ titulo: '', responsavel: '', prazo: '', status: 'pendente' });
    renderTarefasModalTemporario();
}

function atualizarEtapaMemoria(idx, campo, valor) {
    if(etapasTemporarias[idx]) etapasTemporarias[idx][campo] = valor;
}

function removerEtapaMemoria(idx) {
    etapasTemporarias.splice(idx, 1);
    renderTarefasModalTemporario();
}

// ==========================================
// SALVAMENTO DEFINITIVO (MANDA PRO FIREBASE)
// ==========================================
async function salvarProjetoSocio() {
    if (!projetoModalAberto) return;

    // Coleta todos os dados preenchidos
    const projData = {
        nome: document.getElementById('modal-proj-nome').value || 'Projeto Sem Nome',
        cliente: document.getElementById('modal-proj-cliente').value || 'Cliente Não Informado',
        lider: document.getElementById('modal-lider').value.trim(),
        descricao: document.getElementById('modal-desc').value,
        tags: document.getElementById('modal-tags').value.split(',').map(s=>s.trim()).filter(Boolean),
        equipeAtual: document.getElementById('modal-equipe').value.split(',').map(s=>s.trim()).filter(Boolean),
        licoes: document.getElementById('modal-licoes').value,
        visivelHub: document.getElementById('modal-proj-visivel').checked,
        etapas: etapasTemporarias, // Manda a lista atualizada
        arquivado: false
    };

    if (isCriandoNovo) {
        projData.status_crm = 'negociacao';
        projData.dataCriacao = Date.now();
        projData.dataConclusao = null;
        projData.equipeAntiga = [];
    }

    try {
        // Envia para o banco de dados de verdade
        await firestore.setDoc(firestore.doc(db, "projetos", projetoModalAberto), projData, { merge: true });
        showToast('Projeto salvo com sucesso!', 'success');
        fecharModalProjeto(); // Fecha o modal após salvar
    } catch (e) {
        console.error("Erro ao salvar projeto:", e);
        showToast('Erro ao salvar no banco de dados.', 'danger');
    }
}

// ==========================================
// MOTOR DE ALOCAÇÃO (WORKLOAD) - Lê a nova chave 'etapas'
// ==========================================
function renderWorkload() {
    const workload = {};
    const hoje = new Date(new Date().setHours(0,0,0,0));

    Object.keys(bdColabs).forEach(nome => { workload[nome] = { ativas: 0, atrasadas: 0, concluidas: 0, tarefasRefs: [] }; });

    for (const [pId, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.status_crm === 'concluido') continue;
        
        // Agora usamos proj.etapas para garantir 100% de compatibilidade com o Hub
        (proj.etapas || []).forEach(t => {
            if (t.responsavel && workload[t.responsavel] !== undefined) {
                if (t.status === 'concluido') {
                    workload[t.responsavel].concluidas++;
                } else {
                    workload[t.responsavel].ativas++;
                    let isAtrasada = t.prazo && new Date(t.prazo) < hoje;
                    if(isAtrasada) workload[t.responsavel].atrasadas++;
                    
                    workload[t.responsavel].tarefasRefs.push(`
                        <div style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between;">
                            <span style="color: ${isAtrasada ? '#ff8793' : 'var(--cadarn-branco)'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${t.titulo || 'Sem nome'}</span>
                            <span style="color:var(--cadarn-roxo-claro); font-size:10px;">${proj.cliente}</span>
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
                    <div style="font-size:16px; font-weight:700; color:white;">👤 ${nome}</div>
                    <div class="wl-status-badge ${statusClass}">${statusText}</div>
                </div>
                <div class="wl-stats">
                    <div class="wl-stat-box">
                        <div style="font-size:10px; color:var(--cadarn-cinza); text-transform:uppercase;">Tarefas Ativas</div>
                        <div style="font-size:20px; font-weight:800; color:white;">${data.ativas}</div>
                    </div>
                    <div class="wl-stat-box" style="border: 1px solid ${data.atrasadas > 0 ? '#dc3545' : 'transparent'}; background: ${data.atrasadas > 0 ? 'rgba(220,53,69,0.1)' : 'rgba(0,0,0,0.3)'};">
                        <div style="font-size:10px; color: ${data.atrasadas > 0 ? '#ff8793' : 'var(--cadarn-cinza)'}; text-transform:uppercase;">Atrasadas</div>
                        <div style="font-size:20px; font-weight:800; color:${data.atrasadas > 0 ? '#ff8793' : 'white'};">${data.atrasadas}</div>
                    </div>
                </div>
                <div>
                    <div style="font-size:11px; color:var(--cadarn-cinza); margin-bottom:8px; text-transform:uppercase; font-weight:700;">Lista de Foco (A Fazer)</div>
                    <div class="wl-tasks-list">
                        ${data.tarefasRefs.length > 0 ? data.tarefasRefs.join('') : '<div style="color:#666; font-style:italic;">Nenhuma tarefa ativa no momento.</div>'}
                    </div>
                </div>
            </div>
        `;
    });

    document.getElementById('workload-container').innerHTML = html;
}

initSegurancaSocios();

// Expondo as funções para os botões do HTML
window.switchTab = switchTab;
window.aplicarFiltros = aplicarFiltros;
window.abrirModalProjeto = abrirModalProjeto;
window.fecharModalProjeto = fecharModalProjeto;
window.novoProjetoSocio = novoProjetoSocio;
window.salvarProjetoSocio = salvarProjetoSocio;
window.adicionarNovaTarefaModal = adicionarNovaTarefaModal;
window.atualizarEtapaMemoria = atualizarEtapaMemoria;
window.removerEtapaMemoria = removerEtapaMemoria;
