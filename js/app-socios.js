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
let projetoModalAberto = null;

async function initSegurancaSocios() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
    const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
    const { getFirestore, collection, onSnapshot, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");

    firestore = { collection, onSnapshot, doc, updateDoc };

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

    // GATEKEEPER DE SEGURANÇA
    onAuthStateChanged(auth, (user) => {
        if (!user || !emailsSocios.includes(user.email.toLowerCase().trim())) {
            window.location.href = 'index.html'; // Expulsa intrusos
        } else {
            document.getElementById('conteudo-restrito').style.display = 'block';
            iniciarListeners();
        }
    });
}

// ==========================================
// 1. SINCRONIZAÇÃO EM TEMPO REAL (FIREBASE)
// ==========================================
function iniciarListeners() {
    // Escuta Projetos
    firestore.onSnapshot(firestore.collection(db, "projetos"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === "removed") delete bdProjetos[id];
            else bdProjetos[id] = change.doc.data();
        });
        renderKanban();
        renderWorkload();
        popularSelectFiltro();
        if(projetoModalAberto) renderTarefasProjeto(projetoModalAberto);
    });

    // Escuta Colaboradores
    firestore.onSnapshot(firestore.collection(db, "colaboradores"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            bdColabs[change.doc.id] = change.doc.data();
        });
        popularSelectFiltro();
        renderWorkload();
    });

    inicializarDragAndDrop();
}

// ==========================================
// 2. INTERFACE E NAVEGAÇÃO
// ==========================================
function switchTab(tab) {
    document.getElementById('view-projetos').style.display = tab === 'projetos' ? 'block' : 'none';
    document.getElementById('view-pessoas').style.display = tab === 'pessoas' ? 'block' : 'none';
    document.getElementById('tab-btn-projetos').classList.toggle('active', tab === 'projetos');
    document.getElementById('tab-btn-pessoas').classList.toggle('active', tab === 'pessoas');
}

function popularSelectFiltro() {
    const select = document.getElementById('filtro-responsavel');
    const valorAtual = select.value;
    let options = '<option value="">Todos os Colaboradores</option>';
    
    Object.keys(bdColabs).sort().forEach(nome => {
        options += `<option value="${nome}">${nome}</option>`;
    });
    
    select.innerHTML = options;
    select.value = valorAtual;
}

function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban();
    renderWorkload();
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
// 3. MÓDULO: KANBAN E PROJETOS
// ==========================================
function renderKanban() {
    let htmlNegociacao = ''; let htmlAndamento = ''; let htmlConcluido = '';
    const hoje = new Date(new Date().setHours(0,0,0,0));

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;

        // Lógica de Filtro
        if (filtroResponsavel) {
            const temTarefaResponsavel = (proj.tarefas || []).some(t => t.responsavel === filtroResponsavel);
            if (!temTarefaResponsavel && proj.lider !== filtroResponsavel) continue;
        }

        const statusCrm = proj.status_crm || 'negociacao';
        const tarefas = proj.tarefas || [];
        
        // Verifica atrasos em tarefas do projeto
        let temAtraso = tarefas.some(t => t.status !== 'concluida' && t.prazo && new Date(t.prazo) < hoje);
        let borderStyle = temAtraso ? 'border-color: #dc3545; box-shadow: 0 0 10px rgba(220,53,69,0.3);' : '';
        let atrasoBadge = temAtraso ? '<span style="background:rgba(220,53,69,0.2); color:#ff8793; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; text-transform:uppercase;">Atrasado</span>' : '';

        const card = `
            <div class="kanban-card" style="${borderStyle}" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div class="kanban-card-title">${proj.nome || 'Sem Nome'}</div>
                    ${atrasoBadge}
                </div>
                <div class="kanban-card-meta">${proj.cliente || 'Sem Cliente'}</div>
                <div style="margin-top: 10px; font-size: 11px; color: var(--cadarn-cinza); border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                    📝 ${tarefas.filter(t => t.status === 'concluida').length}/${tarefas.length} Tarefas concluídas
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
    const colunas = [
        document.getElementById('col-negociacao'),
        document.getElementById('col-andamento'),
        document.getElementById('col-concluidos')
    ];

    colunas.forEach(coluna => {
        new Sortable(coluna, {
            group: 'kanban_socios', 
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                const itemEl = evt.item; 
                const toList = evt.to;
                
                const projetoId = itemEl.getAttribute('data-id');
                const novoStatus = toList.getAttribute('data-status');

                if(projetoId && novoStatus) {
                    try {
                        const projRef = firestore.doc(db, "projetos", projetoId);
                        await firestore.updateDoc(projRef, { status_crm: novoStatus });
                        showToast('Status do projeto atualizado.', 'success');
                    } catch (e) {
                        console.error("Erro ao mover card", e);
                        showToast('Erro ao atualizar projeto.', 'danger');
                    }
                }
            },
        });
    });
}

// ==========================================
// 4. MÓDULO: GESTÃO DE TAREFAS (MODAL)
// ==========================================
function abrirModalProjeto(id) {
    projetoModalAberto = id;
    const proj = bdProjetos[id];
    document.getElementById('modal-proj-nome').innerText = proj.nome;
    document.getElementById('modal-proj-cliente').innerText = proj.cliente;
    renderTarefasProjeto(id);
    document.getElementById('modal-projeto').classList.add('active');
}

function fecharModalProjeto(e) {
    if(!e || e.target === document.getElementById('modal-projeto') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-projeto').classList.remove('active');
        projetoModalAberto = null;
    }
}

function renderTarefasProjeto(id) {
    const proj = bdProjetos[id];
    if (!proj) return;
    
    let tarefas = proj.tarefas || [];
    let html = '';
    
    // Select dinâmico com os nomes dos colaboradores do banco
    let optionsColabs = '<option value="">Atribuir a...</option>';
    Object.keys(bdColabs).sort().forEach(nome => { optionsColabs += `<option value="${nome}">${nome}</option>`; });

    tarefas.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel}"`, `value="${t.responsavel}" selected`);
        
        html += `
            <div class="task-row">
                <input type="text" value="${t.titulo || ''}" placeholder="Descrição da tarefa" onchange="salvarAlteracaoTarefa('${id}', ${idx}, 'titulo', this.value)">
                <select onchange="salvarAlteracaoTarefa('${id}', ${idx}, 'responsavel', this.value)">${optionsResps}</select>
                <input type="date" value="${t.prazo || ''}" onchange="salvarAlteracaoTarefa('${id}', ${idx}, 'prazo', this.value)">
                <select onchange="salvarAlteracaoTarefa('${id}', ${idx}, 'status', this.value)">
                    <option value="pendente" ${t.status === 'pendente'?'selected':''}>Pendente</option>
                    <option value="andamento" ${t.status === 'andamento'?'selected':''}>Fazendo</option>
                    <option value="concluida" ${t.status === 'concluida'?'selected':''}>Concluída</option>
                </select>
                <button class="sp-btn-edit" style="background: rgba(220,53,69,0.2); color: #ff8793; border-color: transparent; padding: 6px;" onclick="excluirTarefa('${id}', ${idx})" title="Excluir">🗑️</button>
            </div>
        `;
    });

    if(tarefas.length === 0) html = '<div style="color:var(--cadarn-cinza); font-size:13px; padding:15px; text-align:center;">Nenhuma tarefa estruturada neste projeto.</div>';
    
    document.getElementById('lista-tarefas').innerHTML = html;
}

async function adicionarNovaTarefa() {
    if(!projetoModalAberto) return;
    let proj = bdProjetos[projetoModalAberto];
    let tarefas = proj.tarefas || [];
    
    tarefas.push({ titulo: '', responsavel: '', prazo: '', status: 'pendente' });
    
    try {
        await firestore.updateDoc(firestore.doc(db, "projetos", projetoModalAberto), { tarefas: tarefas });
    } catch(e) { console.error(e); }
}

async function salvarAlteracaoTarefa(projetoId, taskIndex, campo, valor) {
    let proj = bdProjetos[projetoId];
    let tarefas = proj.tarefas || [];
    
    if(tarefas[taskIndex]) {
        tarefas[taskIndex][campo] = valor;
        try {
            await firestore.updateDoc(firestore.doc(db, "projetos", projetoId), { tarefas: tarefas });
        } catch(e) { console.error("Erro ao atualizar tarefa", e); }
    }
}

async function excluirTarefa(projetoId, taskIndex) {
    let proj = bdProjetos[projetoId];
    let tarefas = proj.tarefas || [];
    tarefas.splice(taskIndex, 1);
    try {
        await firestore.updateDoc(firestore.doc(db, "projetos", projetoId), { tarefas: tarefas });
    } catch(e) { console.error(e); }
}

// ==========================================
// 5. MÓDULO: PESSOAS (WORKLOAD ALGORITHM)
// ==========================================
function renderWorkload() {
    const workload = {};
    const hoje = new Date(new Date().setHours(0,0,0,0));

    // Inicializa todos os colaboradores do banco
    Object.keys(bdColabs).forEach(nome => {
        workload[nome] = { ativas: 0, atrasadas: 0, concluidas: 0, tarefasRefs: [] };
    });

    // Varre o banco de dados cruzando informações de carga
    for (const [pId, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.status_crm === 'concluido') continue;
        
        (proj.tarefas || []).forEach(t => {
            if (t.responsavel && workload[t.responsavel] !== undefined) {
                if (t.status === 'concluida') {
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
    
    // Renderiza os cards
    Object.keys(workload).sort().forEach(nome => {
        if (filtroResponsavel && nome !== filtroResponsavel) return;

        const data = workload[nome];
        
        // Algoritmo de Saúde (Health Check)
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

// Inicializa a segurança e o Firebase ao carregar o script
initSegurancaSocios();

// Expondo para o HTML
window.switchTab = switchTab;
window.aplicarFiltros = aplicarFiltros;
window.abrirModalProjeto = abrirModalProjeto;
window.fecharModalProjeto = fecharModalProjeto;
window.adicionarNovaTarefa = adicionarNovaTarefa;
window.salvarAlteracaoTarefa = salvarAlteracaoTarefa;
window.excluirTarefa = excluirTarefa;
