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
    'juliana.deoracki@cadarnconsultoria.com.br'
];
const emailsDEV = [
    'victor.mendes@cadarnconsultoria.com.br'
];
const emailsRH = [
    'barbara.figueiredo@cadarnconsultoria.com.br'
];

function getSocioRole(email) {
    if (!email) return 'Visitante';
    const e = email.toLowerCase().trim();
    if (emailsSocios.includes(e)) return 'Sócio';
    if (emailsDEV.includes(e)) return 'DEV';
    if (emailsRH.includes(e)) return 'RH';
    return 'Visitante'; // Barrado
}

let db;
let firestore = {};
let bdProjetos = {};
let bdColabs = {};
let filtroResponsavel = "";

let projetoModalAberto = null;
let isCriandoNovo = false;
let etapasTemporarias = [];
let usuarioLogado = localStorage.getItem('cadarn_user') || 'Sócio';
window.userRole = getSocioRole(localStorage.getItem('cadarn_user_email') || '');

// Controle do Calendário
let dataAtualCalendario = new Date();
function tempoRelativoSocio(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60)    return 'agora mesmo';
    if (diff < 3600)  return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
    return new Date(timestamp).toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
}

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
        const role = getSocioRole(user ? user.email : '');
        // Se não for Sócio, DEV ou RH, toma "kick" pra tela inicial
        if (!user || role === 'Visitante') {
            window.location.href = 'index.html'; 
        } else {
            window.userRole = role;
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

    // CORTA ACESSO FINANCEIRO DO RH
    if (window.userRole === 'RH') {
        const btnFinanceiro = document.getElementById('tab-btn-financeiro');
        if (btnFinanceiro) btnFinanceiro.style.display = 'none';
        
        const barraFinanceiraTopo = document.querySelector('.financial-health-bar');
        if (barraFinanceiraTopo) barraFinanceiraTopo.style.display = 'none';
        
        // Bloqueia a aba de inputs financeiros de contrato caso tentem editar
        const campoFinContrato = document.getElementById('modal-valor-contrato');
        if (campoFinContrato) campoFinContrato.parentElement.parentElement.style.display = 'none';
    }
}

function iniciarListeners() {
    // Monitora a coleção de PROJETOS
    firestore.onSnapshot(firestore.collection(db, "projetos"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === "removed") delete bdProjetos[id];
            else bdProjetos[id] = change.doc.data();
        });

        renderKanban(); 
        renderWorkload();
        renderCronograma('gantt-master-container', filtroResponsavel);
        renderCalendario();
        renderTeamAvailability();
        renderFinancialHealth();
    });

    // Monitora a coleção de COLABORADORES (Gestão de Acessos / IAM)
    firestore.onSnapshot(firestore.collection(db, "colaboradores"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const nome = change.doc.id;
            if (change.type === "removed") delete bdColabs[nome];
            else bdColabs[nome] = change.doc.data();
        });
        renderDossieList(); // Atualiza a lista de dossiês automaticamente
    });

    inicializarDragAndDrop();
    verificarAlertasDoDia();
}

function switchTab(tab) {
    const views = ['projetos', 'pessoas', 'cronograma', 'calendario', 'dossie', 'financeiro'];
    
    // 1. Esconde todas as telas com transição
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if(el) {
            el.style.opacity = '0';
            setTimeout(() => { if (el.style.opacity === '0') el.style.display = 'none'; }, 300);
        }
        const btn = document.getElementById(`tab-btn-${v}`);
        if(btn) btn.classList.remove('active');
    });

    // 2. Mostra a tela selecionada
    const targetView = document.getElementById(`view-${tab}`);
    const targetBtn = document.getElementById(`tab-btn-${tab}`);
    
    setTimeout(() => {
        if(targetView) {
            if (tab === 'projetos') {
                targetView.style.display = 'grid';
            } else {
                targetView.style.display = 'block';
            }
            
            // Força o reflow para aplicar a animação de opacidade
            void targetView.offsetWidth;
            
            if(targetBtn) targetBtn.classList.add('active');
            targetView.style.opacity = '1';
            
            if(tab === 'cronograma') renderCronograma('gantt-master-container', filtroResponsavel);
            if(tab === 'dossie') renderDossieList();
            if(tab === 'calendario') renderCalendario();
            if(tab === 'financeiro') renderFinanceiroPremium();
        }
    }, 300);
}

function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban(); 
    renderWorkload(); 
    renderCronograma('gantt-master-container', filtroResponsavel);
}

// Melhoria UX: Toasts Animados com Ícones
function showToast(message, type='info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ℹ️';
    if(type === 'success') icon = '✅';
    if(type === 'danger') icon = '🚨';
    if(type === 'warning') icon = '⚠️';

    toast.innerHTML = `<span style="font-size: 18px;">${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => { 
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0'; 
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}

function sanitize(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
    return String(str).replace(/[&<>"'/]/ig, (match) => map[match]);
}

// ==========================================
// KANBAN RENDER
// ==========================================
function renderKanban() {
    let htmlNegociacao = ''; let htmlAndamento = ''; let htmlIniciado = '';
    const hoje = new Date(new Date().setHours(0,0,0,0));

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;

        if (filtroResponsavel) {
            const temTarefaResponsavel = (proj.etapas || []).some(t => t.responsavel === filtroResponsavel);
            if (!temTarefaResponsavel && proj.lider !== filtroResponsavel && !(proj.equipeAtual || []).includes(filtroResponsavel)) continue;
        }

        const statusCrm = proj.status_crm || 'negociacao';
        const etapas = proj.etapas || [];
        const isVisivel = proj.visivelHub ? '<span title="Visível no Hub da Equipe" style="color:#47e299;">👁️ Equipe Vê</span>' : '<span title="Oculto da equipe" style="color:#ffc107;">🙈 Rascunho</span>';
        
        let temAtraso = etapas.some(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) < hoje);
        let borderStyle = temAtraso ? 'border-color: rgba(220,53,69,0.5); box-shadow: 0 0 15px rgba(220,53,69,0.2);' : '';
        let atrasoBadge = temAtraso ? '<span style="background:rgba(220,53,69,0.2); color:#ff8793; padding:4px 8px; border-radius:6px; font-size:9px; font-weight:800; text-transform:uppercase;">⚠️ Atrasado</span>' : '';
        
        const tagsHtml = (proj.tags || []).slice(0,3).map(t => `<span style="background: rgba(131, 46, 255, 0.15); color: #c5a3ff; font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 12px; border: 1px solid rgba(131,46,255,0.3);">${sanitize(t)}</span>`).join('');

        const contractBadge = proj.valorContrato > 0 ? `<div class="badge-contract" style="background: linear-gradient(135deg, #FFC107, #FF9800); color: #000; padding: 4px 10px; border-radius: 8px; font-size: 10px; font-weight: 900; display: inline-block;">R$ ${proj.valorContrato.toLocaleString('pt-BR')}</div>` : '';

        const card = `
            <div class="kanban-card" style="${borderStyle}" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px;">
                    <div class="kanban-card-title">${sanitize(proj.nome || 'Sem Nome')}</div>
                    ${atrasoBadge}
                </div>
                <div style="font-size: 13px; color: var(--cadarn-cinza); margin-bottom: 15px; font-weight: 500;">🏢 ${sanitize(proj.cliente || 'Sem Cliente')}</div>
                <div style="display:flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; align-items: center;">
                    ${tagsHtml}
                    ${contractBadge}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 15px; font-size: 11px;">
                    <div style="color: var(--cadarn-cinza); font-weight:600; background: rgba(255,255,255,0.05); padding: 4px 10px; border-radius: 12px;">📝 ${etapas.filter(t => t.status === 'concluido').length}/${etapas.length} Etapas</div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                        <div style="font-weight: bold; font-size: 10px;">${isVisivel}</div>
                        ${proj.ultimaEdicao ? `<div style="font-size:9px; color:rgba(255,255,255,0.3);">✏️ ${tempoRelativoSocio(proj.ultimaEdicao)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;

        if (statusCrm === 'negociacao') htmlNegociacao += card;
        else if (statusCrm === 'andamento') htmlAndamento += card;
        else if (statusCrm === 'concluido' || statusCrm === 'iniciado') htmlIniciado += card;
    }

    // Melhoria UX: Empty states elegantes
    const emptyState = (msg) => `<div style="padding:30px 20px; text-align:center; background:rgba(255,255,255,0.02); border: 2px dashed rgba(255,255,255,0.05); border-radius:16px; color:var(--cadarn-cinza); font-size:13px; font-weight:600;">${msg}</div>`;

    document.getElementById('col-negociacao').innerHTML = htmlNegociacao || emptyState('Nenhum projeto em negociação.');
    document.getElementById('col-andamento').innerHTML = htmlAndamento || emptyState('Nenhum projeto em andamento.');
    document.getElementById('col-iniciados').innerHTML = htmlIniciado || emptyState('Nenhum projeto concluído.');
    
    // Re-inicializa Sortable após trocar innerHTML (fix bug drag-and-drop)
    inicializarDragAndDrop();
}

// Guarda instâncias para destruir antes de recriar
let _sortableInstances = [];

function inicializarDragAndDrop() {
    // Destrói instâncias antigas para evitar handlers duplicados
    _sortableInstances.forEach(s => { try { s.destroy(); } catch(e) {} });
    _sortableInstances = [];
    
    const colunas = [
        document.getElementById('col-negociacao'), 
        document.getElementById('col-andamento'), 
        document.getElementById('col-iniciados')
    ];
    
    colunas.forEach(coluna => {
        if (!coluna) return;
        const inst = new Sortable(coluna, {
            group: 'kanban_socios', 
            animation: 250, 
            ghostClass: 'sortable-ghost',
            filter: '.kanban-no-drag',
            onEnd: async function (evt) {
                const itemEl = evt.item; 
                const toList = evt.to;
                const projetoId = itemEl.getAttribute('data-id');
                const novoStatus = toList.getAttribute('data-status');

                if (projetoId && novoStatus && bdProjetos[projetoId]) {
                    // Atualiza localmente primeiro (feedback imediato)
                    bdProjetos[projetoId].status_crm = novoStatus;
                    
                    // Atualiza contadores
                    atualizarContadoresKanban();
                    
                    try { 
                        await firestore.setDoc(
                            firestore.doc(db, "projetos", projetoId), 
                            { status_crm: novoStatus }, 
                            { merge: true }
                        ); 
                        showToast('Pipeline atualizado.', 'success');
                    } catch (e) { 
                        console.error("Erro ao mover card:", e); 
                        showToast('Erro ao salvar no servidor.', 'danger');
                    }
                }
            },
        });
        _sortableInstances.push(inst);
    });
}

function atualizarContadoresKanban() {
    const contar = (colId) => document.getElementById(colId)?.querySelectorAll('.kanban-card').length || 0;
    const countNeg = document.getElementById('count-negociacao');
    const countAnd = document.getElementById('count-andamento');
    const countConc = document.getElementById('count-iniciado');
    if (countNeg) countNeg.textContent = contar('col-negociacao');
    if (countAnd) countAnd.textContent = contar('col-andamento');
    if (countConc) countConc.textContent = contar('col-iniciados');
}

/* ========================================================= */
/* DOSSIÊ CONFIDENCIAL — SAÚDE / CONTRATOS                   */
/* ========================================================= */
function verificarAcessoDossie(resourceOwnerId) {
    const role = window.userRole || 'Estagiário';
    const emailAtual = localStorage.getItem('cadarn_user_email') || '';
    if (role === 'Sócio' || role === 'RH' || role === 'DEV') return true;
    // Dono pode ver o próprio dossie
    const primeiroNome = (usuarioLogado || '').split(' ')[0].toLowerCase();
    if (resourceOwnerId && resourceOwnerId.toLowerCase().includes(primeiroNome)) return true;
    return false;
}

async function salvarDossie(nomeColaborador, dados) {
    if (!verificarAcessoDossie(nomeColaborador)) {
        showToast('Acesso Negado: Apenas Sócios e RH podem editar dossiês.', 'danger');
        return;
    }
    try {
        await firestore.setDoc(
            firestore.doc(db, "dossies", nomeColaborador.replace(/\s+/g, '_')), 
            { ...dados, atualizadoEm: Date.now(), atualizadoPor: usuarioLogado }, 
            { merge: true }
        );
        showToast('Dossiê atualizado com sucesso.', 'success');
    } catch(e) {
        showToast('Erro ao salvar dossiê.', 'danger');
    }
}

async function abrirDossieColaborador(nomeColaborador) {
    window.isDossieEditing = false;
    if (!verificarAcessoDossie(nomeColaborador)) {
        showToast('Acesso Negado. Restrito a Sócios e RH.', 'danger');
        return;
    }
    
    // Busca dados do dossiê no Firebase
    let dossieData = {};
    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        const snap = await getDoc(firestore.doc(db, "dossies", nomeColaborador.replace(/\s+/g, '_')));
        if (snap.exists()) dossieData = snap.data();
    } catch(e) { console.warn('Dossie não encontrado:', e); }
    
    const modalEl = document.createElement('div');
    modalEl.id = 'modal-dossie';
    modalEl.className = 'modal-overlay active';
    modalEl.onclick = (e) => { if(e.target === modalEl) modalEl.remove(); };
    
    const canEdit = window.userRole === 'Sócio' || window.userRole === 'RH';
    
    modalEl.innerHTML = `
        <div id="dossie-modal-box" class="modal-content" style="max-width:600px; padding:35px; background:rgba(15,15,18,0.98); border:1px solid rgba(255,193,7,0.3);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:25px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:20px;">
                <div>
                    <div style="font-size:11px;color:#ffc107;text-transform:uppercase;font-weight:800;letter-spacing:2px;margin-bottom:8px;">🔒 Dossiê Confidencial</div>
                    <h2 style="font-size:28px;font-weight:900;color:#fff;font-family:'Outfit',sans-serif;">${sanitize(nomeColaborador)}</h2>
                </div>
                <div style="display: flex; gap: 10px;">
                    ${canEdit ? `<button id="btn-toggle-edit-dossie" onclick="window.toggleEditDossie()" style="background:rgba(131,46,255,0.15); border:1px solid rgba(131,46,255,0.3); color:#c5a3ff; padding: 10px 18px; border-radius:10px; cursor:pointer; font-size:13px; font-weight:700; transition:0.3s;" onmouseover="this.style.background='rgba(131,46,255,0.3)'" onmouseout="this.style.background='rgba(131,46,255,0.15)'">✏️ Editar</button>` : ''}
                    <button onclick="document.getElementById('modal-dossie').remove()" style="background:rgba(255,255,255,0.08);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:16px; transition:0.2s;" onmouseover="this.style.background='rgba(220,53,69,0.8)'" onmouseout="this.style.background='rgba(255,255,255,0.08)'">✕</button>
                </div>
            </div>
            
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:25px;">
                <div>
                    <label style="font-size:11px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:800;display:block;margin-bottom:8px;">📅 Data de Admissão</label>
                    <input type="date" id="dossie-admissao" class="dossie-field" value="${dossieData.admissao || ''}" readonly style="width:100%;background:rgba(255,255,255,0.05);border:1px solid transparent;color:#fff;padding:12px;border-radius:10px;font-size:14px;outline:none;transition:0.3s;">
                </div>
                <div>
                    <label style="font-size:11px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:800;display:block;margin-bottom:8px;">📋 Tipo de Contrato</label>
                    <select id="dossie-contrato" class="dossie-field" disabled style="width:100%;background:rgba(255,255,255,0.05);border:1px solid transparent;color:#fff;padding:12px;border-radius:10px;font-size:14px;outline:none;transition:0.3s;-webkit-appearance:none;">
                        <option value="" ${!dossieData.tipoContrato ? 'selected' : ''}>Não definido</option>
                        <option value="CLT" ${dossieData.tipoContrato === 'CLT' ? 'selected' : ''}>CLT</option>
                        <option value="PJ" ${dossieData.tipoContrato === 'PJ' ? 'selected' : ''}>PJ</option>
                        <option value="Estagio" ${dossieData.tipoContrato === 'Estagio' ? 'selected' : ''}>Estágio</option>
                        <option value="Freelancer" ${dossieData.tipoContrato === 'Freelancer' ? 'selected' : ''}>Freelancer</option>
                    </select>
                </div>
            </div>
            
            <div style="margin-bottom:25px;">
                <label style="font-size:11px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:800;display:block;margin-bottom:8px;">📝 Observações de Saúde / Bem-estar</label>
                <textarea id="dossie-saude" class="dossie-field" readonly placeholder="Nenhuma observação registrada..." style="width:100%;background:rgba(255,255,255,0.05);border:1px solid transparent;color:#fff;padding:12px;border-radius:10px;font-size:14px;resize:none;min-height:100px;outline:none;transition:0.3s;font-family:'Inter',sans-serif;">${dossieData.observacoesSaude || ''}</textarea>
            </div>
            
            <div style="margin-bottom:25px;">
                <label style="font-size:11px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:800;display:block;margin-bottom:12px;">📎 Documentos Anexados</label>
                <div id="dossie-docs-list" style="margin-bottom:15px; display:flex; flex-direction:column; gap:8px;">
                    ${(dossieData.documentos || []).map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 15px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:13px;color:#c5a3ff;border:1px solid rgba(255,255,255,0.05);">📄 ${sanitize(d.nome)} <span style="color:var(--cadarn-cinza);font-size:11px;font-weight:600;">${new Date(d.data).toLocaleDateString('pt-BR')}</span></div>`).join('')}
                    ${(dossieData.documentos || []).length === 0 ? '<p style="font-size:13px;color:var(--cadarn-cinza);text-align:center;padding:15px;background:rgba(255,255,255,0.02);border-radius:10px;border:1px dashed rgba(255,255,255,0.1);">Nenhum documento anexado.</p>' : ''}
                </div>
                <div id="dossie-upload-area" style="display:none;">
                    <input type="file" id="dossie-file-upload" accept=".pdf,.doc,.docx,.jpg,.png" style="display:none" onchange="processarArquivoDossie(event, '${sanitize(nomeColaborador)}')">
                    <button onclick="document.getElementById('dossie-file-upload').click()" style="padding:12px;background:rgba(131,46,255,0.1);border:1px dashed rgba(131,46,255,0.5);color:#c5a3ff;border-radius:10px;cursor:pointer;font-size:13px;font-weight:700;width:100%;transition:0.3s;" onmouseover="this.style.background='rgba(131,46,255,0.2)'" onmouseout="this.style.background='rgba(131,46,255,0.1)'">📎 Anexar PDF / Imagem</button>
                </div>
            </div>
            
            <button id="btn-salvar-dossie" onclick="salvarDossieForm('${sanitize(nomeColaborador)}')" style="display:none; width:100%;padding:16px;background:linear-gradient(135deg,#198754,#146c43);border:none;color:#fff;border-radius:12px;cursor:pointer;font-size:15px;font-weight:800;letter-spacing:0.5px;box-shadow:0 8px 20px rgba(25,135,84,0.3);transition:0.3s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">💾 Salvar Alterações</button>
        </div>
    `;
    document.body.appendChild(modalEl);
}

async function salvarDossieForm(nomeColaborador) {
    const btn = document.getElementById('btn-salvar-dossie');
    if(btn) {
        btn.innerHTML = '⏳ Salvando...';
        btn.disabled = true;
    }
    
    const dados = {
        admissao: document.getElementById('dossie-admissao')?.value || '',
        tipoContrato: document.getElementById('dossie-contrato')?.value || '',
        observacoesSaude: document.getElementById('dossie-saude')?.value || '',
    };

    try {
        await salvarDossie(nomeColaborador, dados);
        window.isDossieEditing = true; 
        window.toggleEditDossie(); 
    } catch(e) {
        // Erro já tratado no salvarDossie
    } finally {
        if(btn) {
            btn.innerHTML = '💾 Salvar Alterações';
            btn.disabled = false;
        }
    }
}

async function processarArquivoDossie(event, nomeColaborador) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Arquivo muito grande (máx 5MB).', 'danger'); return; }
    
    showToast(`Anexando "${file.name}"...`, 'info');
    // Em produção: fazer upload para Firebase Storage e salvar URL
    // Por ora: salva metadados localmente
    const docMeta = { nome: file.name, data: Date.now(), tipo: file.type };
    
    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
        const snap = await getDoc(firestore.doc(db, "dossies", nomeColaborador.replace(/\s+/g, '_')));
        const existing = snap.exists() ? snap.data() : {};
        const docs = [...(existing.documentos || []), docMeta];
        await salvarDossie(nomeColaborador, { documentos: docs });
        
        const list = document.getElementById('dossie-docs-list');
        if (list) {
            // Remove o empty state se existir
            if(list.querySelector('p')) list.innerHTML = '';
            list.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 15px;background:rgba(255,255,255,0.05);border-radius:10px;font-size:13px;color:#c5a3ff;border:1px solid rgba(255,255,255,0.05);">📄 ${sanitize(file.name)} <span style="color:var(--cadarn-cinza);font-size:11px;font-weight:600;">Agora mesmo</span></div>`;
        }
    } catch(e) { showToast('Erro ao salvar documento.', 'danger'); }
}


// ==========================================
// CONTROLE DO MODAL DE PROJETOS
// ==========================================
function novoProjetoSocio() {
    isCriandoNovo = true;
    projetoModalAberto = 'proj_' + Date.now();
    etapasTemporarias = [{ titulo: 'Planejamento Inicial', responsavel: '', prazo: '', status: 'pendente', kickoff: '' }];
    
    const camposParaLimpar = ['modal-proj-nome', 'modal-proj-cliente', 'modal-desc', 'modal-tags', 'modal-equipe', 'modal-valor-contrato', 'modal-horas-orcadas', 'modal-horas-reais'];
    camposParaLimpar.forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });

    const elLider = document.getElementById('modal-lider');
    if (elLider) elLider.value = usuarioLogado;
    
    // Ativa validação em tempo real
    setTimeout(() => {
        ['modal-proj-nome', 'modal-proj-cliente', 'modal-lider', 'modal-desc'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', validarFormularioProjeto);
        });
        validarFormularioProjeto(); // Estado inicial
    }, 100);
    
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
    setVal('modal-valor-contrato', proj.valorContrato || '');
    setVal('modal-horas-orcadas', proj.horasOrcadas || '');
    setVal('modal-horas-reais', proj.horasReais || '');

    const elVisivel = document.getElementById('modal-proj-visivel');
    if (elVisivel) elVisivel.checked = proj.visivelHub === true;

    etapasTemporarias = proj.etapas ? JSON.parse(JSON.stringify(proj.etapas)) : [];
    
    renderTarefasModalTemporario();
    const modal = document.getElementById('modal-projeto');
    if (modal) modal.classList.add('active');

    setTimeout(validarFormularioProjeto, 100);
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

    // Estilo mestre padronizado para os inputs do modal
    const inputStyle = "width: 100%; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); color: white; padding: 12px 14px; border-radius: 10px; font-size: 13px; outline: none; transition: 0.3s; font-family: 'Inter', sans-serif;";
    
    etapasTemporarias.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel || ''}"`, `value="${t.responsavel || ''}" selected`);
        
        html += `
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; margin-bottom: 15px; overflow: hidden; transition: 0.3s;" onmouseover="this.style.borderColor='rgba(131, 46, 255, 0.5)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.4)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.boxShadow='none'">
                
                <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr auto; gap: 12px; padding: 18px; border-bottom: 1px solid rgba(255,255,255,0.05); align-items: center;">
                    <input type="text" style="${inputStyle}" value="${t.titulo || ''}" placeholder="Qual a entrega?" onchange="atualizarEtapaMemoria(${idx}, 'titulo', this.value)" onfocus="this.style.borderColor='var(--cadarn-roxo)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'responsavel', this.value)" onfocus="this.style.borderColor='var(--cadarn-roxo)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${optionsResps}</select>
                    
                    <input type="date" style="${inputStyle}" value="${t.prazo || ''}" onchange="atualizarEtapaMemoria(${idx}, 'prazo', this.value)" onfocus="this.style.borderColor='var(--cadarn-roxo)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'status', this.value)" onfocus="this.style.borderColor='var(--cadarn-roxo)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                        <option value="pendente" ${t.status === 'pendente'?'selected':''}>Pendente</option>
                        <option value="ativo" ${t.status === 'ativo'?'selected':''}>Em Andamento</option>
                        <option value="concluido" ${t.status === 'concluido'?'selected':''}>Concluída</option>
                    </select>
                    
                    <button style="background: rgba(220,53,69,0.15); color: #ff8793; border: none; padding: 12px; border-radius: 10px; cursor: pointer; transition: 0.2s; font-size:16px;" onmouseover="this.style.background='rgba(220,53,69,0.3)'" onmouseout="this.style.background='rgba(220,53,69,0.15)'" onclick="removerEtapaMemoria(${idx})" title="Excluir Etapa">🗑️</button>
                </div>

                <div style="padding: 12px 18px; background: rgba(0,0,0,0.4);">
                    <textarea style="${inputStyle} min-height: 50px; resize: vertical;" placeholder="🔗 Kick-off: Links, documentos ou instruções..." onchange="atualizarEtapaMemoria(${idx}, 'kickoff', this.value)" onfocus="this.style.borderColor='var(--cadarn-roxo)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${t.kickoff || ''}</textarea>
                </div>
            </div>
        `;
    });

    if(etapasTemporarias.length === 0) html = '<div style="color:var(--cadarn-cinza); font-size:14px; padding:30px; text-align:center; background: rgba(255,255,255,0.02); border-radius: 14px; border: 2px dashed rgba(255,255,255,0.1);">Nenhuma tarefa estruturada neste projeto. Clique em "Nova Tarefa" para começar.</div>';
    document.getElementById('lista-tarefas').innerHTML = html;
}

function adicionarNovaTarefaModal() {
    etapasTemporarias.push({ titulo: '', responsavel: '', prazo: '', status: 'pendente', kickoff: '' });
    renderTarefasModalTemporario();
}

function atualizarEtapaMemoria(idx, campo, valor) { if(etapasTemporarias[idx]) etapasTemporarias[idx][campo] = valor; }
function removerEtapaMemoria(idx) { etapasTemporarias.splice(idx, 1); renderTarefasModalTemporario(); }

/* ========================================================= */
/* BOTÃO REVISAR + NUVEM DE TAGS COM IA                      */
/* ========================================================= */
function validarFormularioProjeto() {
    const nome = document.getElementById('modal-proj-nome')?.value?.trim();
    const cliente = document.getElementById('modal-proj-cliente')?.value?.trim();
    const desc = document.getElementById('modal-desc')?.value?.trim();
    const lider = document.getElementById('modal-lider')?.value?.trim();
    
    const btnRevisar = document.getElementById('btn-revisar-ia');
    const btnSalvar = document.getElementById('btn-salvar-definitivo');
    
    const isValid = nome && cliente && lider;
    
    if (btnSalvar) {
        btnSalvar.disabled = !isValid;
        btnSalvar.style.opacity = isValid ? '1' : '0.5';
        btnSalvar.style.cursor = isValid ? 'pointer' : 'not-allowed';
    }
    if (btnRevisar) {
        btnRevisar.disabled = !desc;
        btnRevisar.style.opacity = desc ? '1' : '0.5';
        btnRevisar.style.cursor = desc ? 'pointer' : 'not-allowed';
    }
    return isValid;
}

async function revisarProjetoComIA() {
    const desc = document.getElementById('modal-desc')?.value?.trim();
    const tags = document.getElementById('modal-tags')?.value?.trim() || '';
    const categoria = tags.split(',').pop().trim() || 'Estratégia';
    
    if (!desc) { showToast('Escreva o escopo para gerar tags.', 'warning'); return; }
    
    const btnRevisar = document.getElementById('btn-revisar-ia');
    if (btnRevisar) { btnRevisar.disabled = true; btnRevisar.innerHTML = '🔄 Analisando...'; }
    
    const tagContainer = document.getElementById('tag-cloud-container');
    if (tagContainer) tagContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--cadarn-cinza);font-size:13px;font-weight:600;">🤖 IA extraindo inteligência...</div>';
    
    try {
        const prompt = `Analise o seguinte escopo de projeto e extraia 6 a 8 palavras-chave estratégicas. Responda APENAS com um JSON no formato: {"tags": ["tag1", "tag2"]}. A última tag deve ser a categoria ampla do projeto. Escopo: "${desc.substring(0, 800)}"`;
        
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "claude-sonnet-4-20250514",
                max_tokens: 300,
                messages: [{ role: "user", content: prompt }]
            })
        });
        
        const data = await response.json();
        let rawText = (data.content || []).map(b => b.text || '').join('');
        
        const match = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('JSON Inválido');
        
        const parsed = JSON.parse(match[0]);
        let keywordTags = parsed.tags || [];
        
        if (categoria && !keywordTags.includes(categoria)) {
            keywordTags = [...keywordTags.slice(0, -1), categoria];
        }
        
        renderTagCloud(keywordTags, tagContainer);
        document.getElementById('modal-tags').value = keywordTags.join(', ');
        showToast('✨ Tags geradas via IA com sucesso!', 'success');
        
    } catch(e) {
        console.error('Erro ao gerar tags:', e);
        const palavras = desc.toLowerCase()
            .replace(/[^a-záàãâéêíóôõúüç\s]/g, ' ')
            .split(/\s+/)
            .filter(p => p.length > 4)
            .slice(0, 5)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1));
        palavras.push(categoria);
        renderTagCloud(palavras, tagContainer);
        showToast('IA indisponível. Tags extraídas localmente.', 'info');
    } finally {
        if (btnRevisar) { btnRevisar.disabled = false; btnRevisar.innerHTML = '✨ Revisar com IA'; }
    }
}

function renderTagCloud(tags, container) {
    if (!container) return;
    const cores = ['#832EFF', '#c5a3ff', '#47e299', '#ffc107', '#ff8793', '#20c997', '#4cc9f0'];
    const sizes = [15, 14, 16, 13, 15, 14, 16, 18]; 
    
    let html = '<div style="display:flex;flex-wrap:wrap;gap:10px;padding:15px 0;justify-content:flex-end;">';
    tags.forEach((tag, i) => {
        const isCategoria = i === tags.length - 1;
        const cor = isCategoria ? '#FFC107' : cores[i % cores.length];
        const fsize = isCategoria ? 18 : sizes[i % sizes.length];
        const border = isCategoria ? `2px solid ${cor}` : `1px solid ${cor}50`;
        html += `<span style="font-size:${fsize}px;color:${cor};font-weight:700;border:${border};padding:6px 14px;border-radius:20px;background:${cor}15;cursor:default;">${sanitize(tag)}${isCategoria ? ' 🏷️' : ''}</span>`;
    });
    html += '</div>';
    container.innerHTML = html;
}

async function salvarProjetoSocio() {
    if (!projetoModalAberto) return;

    const botaoSalvar = document.getElementById('btn-salvar-definitivo');
    const textoOriginal = botaoSalvar ? botaoSalvar.innerHTML : '';
    if (botaoSalvar) {
        botaoSalvar.disabled = true;
        botaoSalvar.innerHTML = '⏳ Salvando Nuvem...';
    }

    const projData = {
        nome: document.getElementById('modal-proj-nome')?.value?.trim() || 'Projeto',
        ultimaEdicao: Date.now(),
        cliente: document.getElementById('modal-proj-cliente')?.value?.trim() || 'Cliente',
        lider: document.getElementById('modal-lider')?.value?.trim() || usuarioLogado,
        descricao: document.getElementById('modal-desc')?.value || '',
        tags: document.getElementById('modal-tags')?.value ? document.getElementById('modal-tags').value.split(',').map(s => s.trim()).filter(Boolean) : [],
        equipeAtual: document.getElementById('modal-equipe')?.value ? document.getElementById('modal-equipe').value.split(',').map(s => s.trim()).filter(Boolean) : [],
        visivelHub: document.getElementById('modal-proj-visivel')?.checked || false,
        etapas: etapasTemporarias,
        arquivado: false,
        valorContrato: Number(document.getElementById('modal-valor-contrato')?.value) || 0,
        horasOrcadas: Number(document.getElementById('modal-horas-orcadas')?.value) || 0,
        horasReais: Number(document.getElementById('modal-horas-reais')?.value) || 0
    };

    if (isCriandoNovo) {
        projData.status_crm = 'negociacao';
        projData.dataCriacao = Date.now();
    }

    try {
        await firestore.setDoc(firestore.doc(db, "projetos", projetoModalAberto), projData, { merge: true });
        showToast('Projeto sincronizado com sucesso!', 'success');
        fecharModalProjeto();
    } catch (e) {
        console.error("Erro ao salvar projeto:", e);
        showToast(`Erro ao salvar.`, 'danger');
        if (botaoSalvar) {
            botaoSalvar.disabled = false;
            botaoSalvar.innerHTML = textoOriginal;
        }
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
                if (t.status === 'concluido') { workload[t.responsavel].concluidas++; } 
                else {
                    workload[t.responsavel].ativas++;
                    let isAtrasada = t.prazo && new Date(t.prazo) < hoje;
                    if(isAtrasada) workload[t.responsavel].atrasadas++;
                    
                    let corBorda = isAtrasada ? '#ff8793' : '#832EFF';
                    let corFundo = isAtrasada ? 'rgba(220,53,69,0.08)' : 'rgba(255,255,255,0.03)';
                    
                    workload[t.responsavel].tarefasRefs.push(`
                        <div style="background: ${corFundo}; border-left: 3px solid ${corBorda}; border-radius: 8px; padding: 12px; margin-bottom: 8px; transition: 0.2s;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
                            <div style="color: ${isAtrasada ? '#ff8793' : '#fff'}; font-size: 13px; font-weight: 700; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sanitize(t.titulo) || 'Tarefa'}</div>
                            <div style="color: var(--cadarn-cinza); font-size: 11px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📁 ${sanitize(proj.nome)}</div>
                        </div>
                    `);
                }
            }
        });
    }

    const termoBusca = (window._workloadBusca || '').toLowerCase();
    let html = '';
    
    Object.keys(workload).sort().forEach(nome => {
        if (filtroResponsavel && nome !== filtroResponsavel) return;
        if (termoBusca && !nome.toLowerCase().includes(termoBusca)) return;

        const data = workload[nome];
        let statusClass = 'wl-status-ideal'; let statusText = 'Equilibrado'; let statusCor = '#47e299';
        if (data.ativas <= 1) { statusClass = 'wl-status-ocioso'; statusText = 'Ocioso'; statusCor = '#c5a3ff'; }
        if (data.ativas >= 5 || data.atrasadas >= 2) { statusClass = 'wl-status-sobrecarga'; statusText = 'Sobrecarga'; statusCor = '#ffc107'; }

        html += `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 25px; transition: 0.3s; display: flex; flex-direction: column; cursor: pointer; box-shadow: 0 4px 20px rgba(0,0,0,0.2);" onmouseover="this.style.borderColor='rgba(131,46,255,0.4)'; this.style.boxShadow='0 12px 30px rgba(0,0,0,0.5)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.boxShadow='0 4px 20px rgba(0,0,0,0.2)'" onclick="abrirModalColaborador('${sanitize(nome)}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px; margin-bottom: 15px;">
                    <div>
                        <div style="font-size:18px; font-weight:800; color:white; letter-spacing:-0.5px; margin-bottom: 8px;">👤 ${sanitize(nome)}</div>
                        <div style="background: ${statusCor}20; color: ${statusCor}; border: 1px solid ${statusCor}50; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 700; display: inline-block;">${statusText}</div>
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: rgba(0,0,0,0.4); border-radius: 12px; padding: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size:11px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:800; letter-spacing: 0.5px; margin-bottom: 5px;">Ativas</div>
                        <div style="font-size:32px; font-weight:900; color:white; line-height: 1; font-family: 'Outfit', sans-serif;">${data.ativas}</div>
                    </div>
                    <div style="background: ${data.atrasadas > 0 ? 'rgba(220,53,69,0.1)' : 'rgba(0,0,0,0.4)'}; border-radius: 12px; padding: 15px; text-align: center; border: 1px solid ${data.atrasadas > 0 ? 'rgba(220,53,69,0.3)' : 'rgba(255,255,255,0.05)'};">
                        <div style="font-size:11px; color:${data.atrasadas > 0 ? '#ff8793' : 'var(--cadarn-cinza)'}; text-transform:uppercase; font-weight:800; letter-spacing: 0.5px; margin-bottom: 5px;">Atrasos</div>
                        <div style="font-size:32px; font-weight:900; color:${data.atrasadas > 0 ? '#ff8793' : 'white'}; line-height: 1; font-family: 'Outfit', sans-serif;">${data.atrasadas}</div>
                    </div>
                </div>
                <div style="flex-grow: 1; display: flex; flex-direction: column;">
                    <div style="font-size:12px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:800; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                        <span>🎯 Foco Principal</span>
                        <div style="height: 1px; background: rgba(255,255,255,0.1); flex-grow: 1;"></div>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto; padding-right: 5px; flex-grow: 1;">
                        ${data.tarefasRefs.length > 0 ? data.tarefasRefs.join('') : '<div style="background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); padding: 25px; border-radius: 12px; text-align:center; color: var(--cadarn-cinza); font-size: 13px; font-weight:600;">Livre. Nenhuma entrega pendente.</div>'}
                    </div>
                </div>
            </div>
        `;
    });

    const barraHtml = `
        <div style="margin-bottom: 25px; display: flex; gap: 20px; align-items: center;">
            <div style="position: relative; flex-grow: 1;">
                <input type="text" id="workload-search" placeholder="🔍 Buscar colaborador..." value="${window._workloadBusca || ''}" oninput="window._workloadBusca = this.value; renderWorkload();" style="width:100%; background:rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); color:white; padding:15px 20px; border-radius:14px; font-size:15px; font-family:'Inter',sans-serif; outline:none; transition:0.3s; box-shadow: 0 4px 15px rgba(0,0,0,0.2);" onfocus="this.style.borderColor='var(--cadarn-roxo)'; this.style.boxShadow='0 4px 20px rgba(131,46,255,0.2)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                ${termoBusca ? `<button onclick="window._workloadBusca=''; renderWorkload();" style="position:absolute;right:15px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--cadarn-cinza);cursor:pointer;font-size:18px;">✕</button>` : ''}
            </div>
            <button onclick="abrirModalColaborador('')" style="background: linear-gradient(135deg, var(--cadarn-roxo), #420a9a); border: 1px solid rgba(131,46,255,0.5); color: white; padding: 15px 30px; border-radius: 14px; font-weight: 800; font-size: 14px; cursor: pointer; white-space: nowrap; box-shadow: 0 5px 20px rgba(131,46,255,0.3); transition: 0.3s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 25px rgba(131,46,255,0.5)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 5px 20px rgba(131,46,255,0.3)';">
                👤+ Novo Colaborador
            </button>
        </div>
    `;

    const wContainer = document.getElementById('workload-container');
    wContainer.innerHTML = barraHtml + (html || `<div style="padding:50px;text-align:center;color:var(--cadarn-cinza);font-size:16px;">Nenhum colaborador encontrado para "<strong style="color:white;">${termoBusca}</strong>".</div>`);

    const searchEl = document.getElementById('workload-search');
    if (searchEl && document.activeElement?.id === 'workload-search') {
        const pos = searchEl.value.length;
        searchEl.focus(); searchEl.setSelectionRange(pos, pos);
    }
}

// ==========================================
// CRONOGRAMA GANTT (NOVO E EXPLOSIVO)
// ==========================================
function renderCronograma(containerId, filterUser = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const startDate = new Date(); 
    startDate.setDate(startDate.getDate() - 10);
    startDate.setHours(0,0,0,0);
    const totalDays = 60;
    const colWidth = 40; 

    let headersHtml = '';
    const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];
    
    for(let i=0; i<totalDays; i++) {
        let d = new Date(startDate); d.setDate(d.getDate() + i);
        let isHoje = d.getTime() === new Date(new Date().setHours(0,0,0,0)).getTime();
        headersHtml += `<div class="gantt-day-col ${isHoje ? 'hoje' : ''}"><div class="gantt-day-name">${diasSemana[d.getDay()]}</div><div class="gantt-day-num">${d.getDate()}</div></div>`;
    }

    let sidebarHtml = `<div class="gantt-sidebar-header">Projetos e Entregas</div>`;
    let timelineHtml = `<div class="gantt-header-row" style="width: ${totalDays * colWidth}px;">${headersHtml}</div><div class="gantt-body" style="width: ${totalDays * colWidth}px;">`;
    let temProjetos = false;

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if(proj.arquivado) return; 
        let etapasProj = proj.etapas || [];
        
        if(filterUser) {
            etapasProj = etapasProj.filter(e => e.responsavel === filterUser);
            if(etapasProj.length === 0 && proj.lider !== filterUser && !(proj.equipeAtual || []).includes(filterUser)) return;
        }

        temProjetos = true;
        sidebarHtml += `<div class="gantt-sidebar-item gantt-sidebar-proj" onclick="abrirModalProjeto('${id}')">📁 ${sanitize(proj.nome)}</div>`;
        timelineHtml += `<div class="gantt-row" style="background: rgba(255,255,255,0.02);"></div>`;

        etapasProj.forEach(t => {
            if(!t.prazo) return; 
            
            let deadline = new Date(t.prazo); deadline.setMinutes(deadline.getMinutes() + deadline.getTimezoneOffset()); deadline.setHours(0,0,0,0);
            let startTask = new Date(deadline); startTask.setDate(startTask.getDate() - 4);

            let startDiff = Math.floor((startTask - startDate) / (1000 * 60 * 60 * 24));
            let endDiff = Math.floor((deadline - startDate) / (1000 * 60 * 60 * 24));

            if(endDiff < 0 || startDiff >= totalDays) return; 

            startDiff = Math.max(0, startDiff); endDiff = Math.min(totalDays - 1, endDiff);
            let widthPx = (endDiff - startDiff + 1) * colWidth; let leftPx = startDiff * colWidth;

            let colorClass = 'gb-pendente';
            if(t.status === 'concluido') colorClass = 'gb-concluido';
            else if(t.status === 'ativo') colorClass = 'gb-ativo';
            else if(deadline < new Date(new Date().setHours(0,0,0,0))) colorClass = 'gb-atrasado';

            const respNome = t.responsavel ? t.responsavel.split(' ')[0] : 'S/ Dono';
            const respInicial = respNome.charAt(0).toUpperCase();

            sidebarHtml += `<div class="gantt-sidebar-item" style="padding-left: 30px; color: var(--cadarn-cinza);" onclick="abrirModalProjeto('${id}')">↳ ${sanitize(t.titulo)}</div>`;
            timelineHtml += `<div class="gantt-row"><div class="gantt-bar-wrapper" style="left: ${leftPx}px; width: ${widthPx}px;"><div class="gantt-bar ${colorClass}" title="${sanitize(t.titulo)} - Responsável: ${sanitize(t.responsavel)}" onclick="abrirModalProjeto('${id}')"><div class="gantt-bar-avatar">${respInicial}</div>${sanitize(t.titulo)}</div></div></div>`;
        });
    });

    if(!temProjetos) {
        container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--cadarn-cinza); font-size:14px; font-style:italic;">Nenhuma entrega com prazo mapeada no filtro atual.</div>`;
        return;
    }
    timelineHtml += `</div>`;
    container.innerHTML = `<div class="gantt-wrapper" style="border:1px solid rgba(255,255,255,0.08); border-radius:16px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.3);"><div class="gantt-sidebar">${sidebarHtml}</div><div class="gantt-timeline-container">${timelineHtml}</div></div>`;
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

// ==========================================
// MOTOR DO CALENDÁRIO MENSAL (GRID)
// ==========================================
function renderCalendario() {
    const calendarBody = document.getElementById('calendar-body');
    if (!calendarBody) return;

    const year = dataAtualCalendario.getFullYear();
    const month = dataAtualCalendario.getMonth();
    
    const mesesStr = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const elTitulo = document.getElementById('cal-month-year');
    if(elTitulo) elTitulo.innerText = `${mesesStr[month]} ${year}`;

    let tarefasPorData = {};
    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        (proj.etapas || []).forEach(t => {
            if (t.prazo && (!filtroResponsavel || t.responsavel === filtroResponsavel)) {
                if (!tarefasPorData[t.prazo]) tarefasPorData[t.prazo] = [];
                tarefasPorData[t.prazo].push({ ...t, projId: id, projNome: proj.nome });
            }
        });
    }
    let primeiroDia = new Date(year, month, 1).getDay();
    let indexPrimeiroDia = primeiroDia === 0 ? 6 : primeiroDia - 1; 
    let diasNoMes = new Date(year, month + 1, 0).getDate();
    
    let html = '';
    const hojeStr = new Date().toISOString().split('T')[0];
    const dataDeHoje = new Date(new Date().setHours(0,0,0,0));

    const diasMesAnterior = new Date(year, month, 0).getDate();
    for (let i = indexPrimeiroDia - 1; i >= 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date">${diasMesAnterior - i}</div></div>`;
    }

    for (let i = 1; i <= diasNoMes; i++) {
        const dataKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isHoje = dataKey === hojeStr ? 'today' : '';
        
        let tarefasHtml = '';
        if (tarefasPorData[dataKey]) {
            tarefasPorData[dataKey].forEach(t => {
                let statusClass = t.status;
                if (statusClass !== 'concluido' && new Date(t.prazo) < dataDeHoje) statusClass = 'atrasado';
                tarefasHtml += `
                    <div class="cal-task ${statusClass}" onclick="abrirModalProjeto('${t.projId}')" title="${sanitize(t.titulo)}">
                        <span>${sanitize(t.titulo)}</span>
                    </div>
                `;
            });
        }
        const projsNoDia = Object.entries(bdProjetos).filter(([id, proj]) => {
            if (proj.arquivado) return false;
            return (proj.etapas || []).some(t => t.prazo === dataKey);
        });
        const hasProjs = projsNoDia.length > 0;
        const clickHandler = hasProjs ? `onclick="abrirModalDiaCalendario('${dataKey}')"` : '';
        
        html += `<div class="calendar-day ${isHoje} ${hasProjs ? 'has-events' : ''}" ${clickHandler}><div class="calendar-date">${i}${hasProjs ? `<span style="float:right; font-size:10px; background:rgba(131,46,255,0.4); color:#fff; padding:2px 6px; border-radius:10px; font-weight:800; box-shadow:0 0 10px rgba(131,46,255,0.3);">${projsNoDia.length}</span>` : ''}</div>${tarefasHtml}</div>`;
    }

    const diasFaltando = 42 - (indexPrimeiroDia + diasNoMes);
    for (let i = 1; i <= diasFaltando; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date">${i}</div></div>`;
    }
    calendarBody.innerHTML = html;
}

/* ========================================================= */
/* MODAL DO DIA DO CALENDÁRIO                                 */
/* ========================================================= */
function abrirModalDiaCalendario(dataKey) {
    const [ano, mes, dia] = dataKey.split('-');
    const dataFormatada = `${dia}/${mes}/${ano}`;
    
    let items = [];
    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        const tarefasDoDia = (proj.etapas || []).filter(t => t.prazo === dataKey);
        tarefasDoDia.forEach(t => {
            items.push({ projId: id, projNome: proj.nome, projCliente: proj.cliente, tarefa: t });
        });
    }
    
    if (items.length === 0) return;
    
    const old = document.getElementById('modal-dia-calendario');
    if (old) old.remove();
    
    let tarefasHtml = items.map(item => {
        const isAtrasado = item.tarefa.status !== 'concluido' && new Date(item.tarefa.prazo) < new Date(new Date().setHours(0,0,0,0));
        let statusCor = item.tarefa.status === 'concluido' ? '#47e299' : (item.tarefa.status === 'ativo' ? '#b68aff' : '#ffc107');
        let statusLabel = item.tarefa.status === 'concluido' ? '✅ Concluído' : (item.tarefa.status === 'ativo' ? '🔵 Ativo' : '⏳ Pendente');
        
        if(isAtrasado) { statusCor = '#ff8793'; statusLabel = '⚠️ Atrasado'; }

        return `
        <div style="padding:15px; background:rgba(255,255,255,0.03); border-radius:12px; border-left:4px solid ${statusCor}; cursor:pointer; transition:0.2s; box-shadow:0 4px 10px rgba(0,0,0,0.2);" onclick="abrirModalProjeto('${item.projId}'); fecharModalDiaCalendario();" onmouseover="this.style.background='rgba(255,255,255,0.08)'; this.style.transform='translateX(4px)';" onmouseout="this.style.background='rgba(255,255,255,0.03)'; this.style.transform='translateX(0)';">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                <strong style="font-size:14px; color:#fff;">${sanitize(item.tarefa.titulo)}</strong>
                <span style="font-size:11px; color:${statusCor}; font-weight:800; background:${statusCor}20; padding:2px 8px; border-radius:10px;">${statusLabel}</span>
            </div>
            <div style="font-size:12px; color:var(--cadarn-cinza); margin-bottom:4px;">📁 ${sanitize(item.projNome)} · ${sanitize(item.projCliente)}</div>
            ${item.tarefa.responsavel ? `<div style="font-size:11px; color:#c5a3ff; margin-top:5px; font-weight:600;">👤 ${sanitize(item.tarefa.responsavel)}</div>` : ''}
        </div>`;
    }).join('');
    
    const modal = document.createElement('div');
    modal.id = 'modal-dia-calendario';
    modal.className = 'modal-overlay active';
    modal.onclick = (e) => { if (e.target === modal) fecharModalDiaCalendario(); };
    modal.innerHTML = `
        <div class="modal-content" style="max-width:500px; padding:35px; background:rgba(18,18,20,0.98); border:1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <div>
                    <div style="font-size:11px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:800; letter-spacing:1px;">📅 Agenda do Dia</div>
                    <h3 style="font-size:26px; font-weight:900; color:#fff; margin-top:5px; font-family:'Outfit',sans-serif;">${dataFormatada}</h3>
                </div>
                <button onclick="fecharModalDiaCalendario()" style="background:rgba(255,255,255,0.1); border:none; color:#fff; width:36px; height:36px; border-radius:50%; cursor:pointer; font-size:16px; transition:0.2s;" onmouseover="this.style.background='rgba(220,53,69,0.8)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">✕</button>
            </div>
            <div style="font-size:12px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:800; letter-spacing:0.5px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05);">${items.length} entrega${items.length > 1 ? 's' : ''} mapeada${items.length > 1 ? 's' : ''}</div>
            <div style="display:flex; flex-direction:column; gap:12px; max-height: 50vh; overflow-y:auto; padding-right:5px;">
                ${tarefasHtml}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function fecharModalDiaCalendario() {
    const m = document.getElementById('modal-dia-calendario');
    if (m) m.remove();
}

function mudarMes(delta) {
    dataAtualCalendario.setMonth(dataAtualCalendario.getMonth() + delta);
    renderCalendario();
}

function irParaHoje() {
    dataAtualCalendario = new Date();
    renderCalendario();
}

/* ========================================================= */
/* BANNER DE ALERTA DO DIA                                   */
/* ========================================================= */
function verificarAlertasDoDia() {
    const hoje = new Date().toISOString().split('T')[0];
    let vencendoHoje = [];
    let atrasados = [];

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        (proj.etapas || []).forEach(t => {
            if (t.status === 'concluido' || !t.prazo) return;
            if (t.prazo === hoje) vencendoHoje.push({ proj: proj.nome, etapa: t.titulo, id });
            if (t.prazo < hoje) atrasados.push({ proj: proj.nome, etapa: t.titulo, id });
        });
    }

    let banner = document.getElementById('alerta-dia-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'alerta-dia-banner';
        const conteudo = document.getElementById('conteudo-restrito');
        if (conteudo) conteudo.prepend(banner);
    }

    if (vencendoHoje.length === 0 && atrasados.length === 0) {
        banner.style.display = 'none';
        return;
    }

    const partes = [];
    if (atrasados.length > 0)
        partes.push(`<strong>⚠️ ${atrasados.length} entrega${atrasados.length > 1 ? 's' : ''} atrasada${atrasados.length > 1 ? 's' : ''}</strong>`);
    if (vencendoHoje.length > 0)
        partes.push(`<strong>🔥 ${vencendoHoje.length} entrega${vencendoHoje.length > 1 ? 's' : ''} vence${vencendoHoje.length > 1 ? 'm' : ''} hoje</strong>`);

    const cor = atrasados.length > 0 ? 'rgba(220,53,69,0.2)' : 'rgba(255,193,7,0.15)';
    const borda = atrasados.length > 0 ? 'rgba(220,53,69,0.5)' : 'rgba(255,193,7,0.5)';

    banner.style.cssText = `
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 40px; background:${cor};
        border-bottom: 1px solid ${borda};
        font-size: 13px; color: white; gap: 15px; backdrop-filter: blur(10px);
    `;
    banner.innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
            ${partes.join(' <span style="color:rgba(255,255,255,0.2)">|</span> ')}
            <span style="color:var(--cadarn-cinza); font-size:12px;">— verifique o Kanban ou Cronograma para reagendar.</span>
        </div>
        <button onclick="this.parentElement.style.display='none'" 
            style="background:none;border:none;color:rgba(255,255,255,0.6);cursor:pointer;font-size:18px;flex-shrink:0;transition:0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">✕</button>
    `;
}

/* ========================================================= */
/* EXPORTAÇÃO DE PROJETOS COMO CSV                           */
/* ========================================================= */
function exportarProjetosCSV() {
    const linhas = [
        ['Nome', 'Cliente', 'Líder', 'Status CRM', 'Visível no Hub', 'Etapas Totais', 'Etapas Concluídas', 'Atrasadas', 'Valor Contrato (R$)', 'Horas Orçadas', 'Horas Reais', 'Tags']
    ];

    const hoje = new Date(new Date().setHours(0,0,0,0));

    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado) continue;
        const etapas = proj.etapas || [];
        const concluidas = etapas.filter(e => e.status === 'concluido').length;
        const atrasadas = etapas.filter(e => e.status !== 'concluido' && e.prazo && new Date(e.prazo) < hoje).length;
        const statusLabel = { negociacao: 'Negociação', andamento: 'Em Andamento', concluido: 'Concluído' }[proj.status_crm] || proj.status_crm;

        linhas.push([
            proj.nome || '',
            proj.cliente || '',
            proj.lider || '',
            statusLabel,
            proj.visivelHub ? 'Sim' : 'Não',
            etapas.length,
            concluidas,
            atrasadas,
            proj.valorContrato || 0,
            proj.horasOrcadas || 0,
            proj.horasReais || 0,
            (proj.tags || []).join('; ')
        ]);
    }

    const csvContent = linhas.map(row =>
        row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cadarn-projetos-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast(`${linhas.length - 1} projeto(s) exportados com sucesso!`, 'success');
}

// =========================================================
// MOTOR DE IMPORTAÇÃO DE PLANILHAS (CSV)
// =========================================================
async function importarDados(event, tipo) {
    const file = event.target.files[0];
    if (!file) return;

    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const textLimpo = text.replace(/^\uFEFF/, '');
        const rows = textLimpo.split('\n');
        
        let processados = 0;
        
        for (let i = 1; i < rows.length; i++) {
            const rowData = rows[i].split(',');
            if(!rowData[0] || rowData[0].trim() === "") continue;
            
            const id = 'proj_import_' + Date.now() + i;
            
            let etapasBrutas = rowData[5] ? rowData[5].split(';') : [];
            let etapasProcessadas = etapasBrutas.map(etapaStr => {
                const partes = etapaStr.split('|');
                return {
                    titulo: partes[0]?.trim() || "Nova Entrega",
                    responsavel: partes[1]?.trim() || rowData[2]?.trim() || "",
                    prazo: partes[2]?.trim() || "",
                    status: 'pendente',
                    kickoff: rowData[6]?.trim() || ""
                };
            });

            if(etapasProcessadas.length === 0) {
                etapasProcessadas.push({ titulo: 'Kick-off e Alinhamento', responsavel: rowData[2], prazo: '', status: 'pendente', kickoff: rowData[6]?.trim() || '' });
            }

            const novoProjeto = {
                nome: rowData[0]?.trim(),
                cliente: rowData[1]?.trim(),
                lider: rowData[2]?.trim(),
                descricao: rowData[3]?.trim(),
                tags: rowData[4] ? rowData[4].split(';').map(s=>s.trim()) : [],
                equipeAtual: rowData[7] ? rowData[7].split(';').map(s=>s.trim()) : [],
                licoes: rowData[8]?.trim() || "Ainda em andamento.", 
                etapas: etapasProcessadas,
                status_crm: tipo === 'pipe' ? 'negociacao' : 'andamento',
                visivelHub: true, 
                arquivado: false,
                dataCriacao: Date.now(),
                valorContrato: Number(rowData[9]) || 0,
                horasOrcadas: Number(rowData[10]) || 0,
                horasReais: Number(rowData[11]) || 0
            };

            try {
                await setDoc(doc(db, "projetos", id), novoProjeto);
                processados++;
            } catch (err) {
                console.error("Erro na linha " + i, err);
            }
        }
        showToast(`${processados} projetos importados! O Dashboard foi atualizado.`, 'success');
        event.target.value = ''; 
    };
    reader.readAsText(file, 'UTF-8');
}

// ==========================================
// RINGS DE ALOCAÇÃO DA EQUIPE (ÁREA DO SÓCIO)
// ==========================================
function renderTeamAvailability() {
    let workload = {};
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado) continue;
        const todasConcluidas = proj.etapas && proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
        if (todasConcluidas) continue; 
        
        (proj.etapas || []).forEach(t => {
            if(t.responsavel && t.status !== 'concluido') {
                let nome = t.responsavel.split('(')[0].trim();
                if(nome) {
                    if(!workload[nome]) workload[nome] = { p: 0 };
                    workload[nome].p++;
                }
            }
        });
    }
    
    const MAX_PROJECTS = 5; 
    const members = Object.keys(workload).map(nome => {
        return { nome, p: workload[nome].p, pct: Math.min(Math.round((workload[nome].p / MAX_PROJECTS) * 100), 100) };
    });
    
    members.sort((a, b) => b.pct - a.pct);

    const container = document.getElementById('teamAvailabilityContainer');
    if (!container) return;

    if (members.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:13px; font-weight:600; padding:10px;">Ninguém da equipe está com entregas ativas no momento.</div>';
        return;
    }
    
    container.innerHTML = members.map(m => {
        let ringColor = '#47e299'; // Verde
        if (m.pct >= 80) ringColor = '#ff8793'; // Vermelho
        else if (m.pct >= 50) ringColor = '#ffc107'; // Amarelo

        const inicial = m.nome.charAt(0).toUpperCase();

        return `
            <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer; gap:10px; min-width: 70px; flex-shrink: 0; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" onclick="window._workloadBusca = '${m.nome}'; switchTab('pessoas');">
                <div style="width: 54px; height: 54px; border-radius: 50%; background: conic-gradient(${ringColor} ${m.pct}%, rgba(255,255,255,0.05) 0); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px ${ringColor}30;">
                    <div style="width: 46px; height: 46px; border-radius: 50%; background: var(--bg-card, #121215); display: flex; align-items: center; justify-content: center; color: white; font-weight: 800; font-size: 18px;">
                        ${inicial}
                    </div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:12px; font-weight:700; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width: 70px;">${m.nome.split(' ')[0]}</div>
                    <div style="font-size:11px; color:${ringColor}; font-weight:800;">${m.pct}%</div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// PAINEL DE SAÚDE FINANCEIRA DO PORTFÓLIO
// ==========================================
function renderFinancialHealth() {
    let feeTotal = 0;
    let margens = [];
    let alertas = 0;

    Object.values(bdProjetos).forEach(proj => {
        if (proj.arquivado || proj.status_crm === 'concluido') return; 

        feeTotal += (proj.valorContrato || 0);

        if (proj.valorContrato > 0) {
            const custoHoras = (proj.horasReais || 0) * 150; 
            const margem = (proj.valorContrato - custoHoras) / proj.valorContrato;
            margens.push(margem);
        }

        if (proj.horasOrcadas > 0 && proj.horasReais >= (proj.horasOrcadas * 0.9)) {
            alertas++;
        }
    });

    const margemMedia = margens.length > 0 ? (margens.reduce((a, b) => a + b) / margens.length) * 100 : 0;

    const elFee = document.getElementById('fin-fee-total');
    const elMargem = document.getElementById('fin-margem-media');
    const elAlertas = document.getElementById('fin-alertas-escopo');

    if (elFee) elFee.innerText = `R$ ${feeTotal.toLocaleString('pt-BR')}`;
    if (elAlertas) elAlertas.innerText = `${alertas} Projeto${alertas !== 1 ? 's' : ''}`;

    const barraEl = document.getElementById('fin-margem-barra');
    if (barraEl) {
        const pct = Math.min(Math.max(margemMedia, 0), 100);
        const cor = margemMedia < 20 ? '#dc3545' : margemMedia < 40 ? '#ffc107' : '#47e299';
        barraEl.style.width = pct + '%';
        barraEl.style.background = cor;
        barraEl.style.boxShadow = `0 0 10px ${cor}80`;
    }

    const cardAlerta = document.getElementById('fin-alertas-escopo')?.closest('.fin-card');
    if (alertas >= 2 && cardAlerta) {
        cardAlerta.style.borderColor = 'rgba(220,53,69,0.5)';
        cardAlerta.style.background = 'rgba(220,53,69,0.1)';
    } else if (cardAlerta) {
        cardAlerta.style.borderColor = 'rgba(255,255,255,0.08)';
        cardAlerta.style.background = 'rgba(255,255,255,0.02)';
    }
    
    if (elMargem) {
        elMargem.innerText = `${margemMedia.toFixed(1)}%`;
        elMargem.style.color = margemMedia < 20 ? '#ff8793' : (margemMedia < 40 ? '#FFC107' : '#47e299');
    }
}

// ==========================================
// MOTOR: MODO REUNIÃO DE SÓCIOS (APRESENTAÇÃO)
// ==========================================
let reuniaoSlides = [];
let reuniaoCurrentSlide = 0;

function abrirModoReuniao() {
    reuniaoSlides = [];
    reuniaoCurrentSlide = 0;
    const hoje = new Date(new Date().setHours(0,0,0,0));

    let ativos = 0, negociacao = 0, concluidos = 0;
    let todasEntregas = [];
    let projetosAndamento = [];

    // 1. Mineração de Dados
    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (proj.arquivado) return;
        
        if (proj.status_crm === 'negociacao') negociacao++;
        else if (proj.status_crm === 'andamento') {
            ativos++;
            projetosAndamento.push({ id, ...proj });
        }
        else if (proj.status_crm === 'concluido') concluidos++;

        if (proj.status_crm === 'andamento' && proj.etapas) {
            proj.etapas.forEach(e => {
                if (e.status !== 'concluido' && e.prazo) {
                    let d = new Date(e.prazo);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                    todasEntregas.push({ projNome: proj.nome, etapa: e.titulo, prazo: d });
                }
            });
        }
    });

    // 2. Montagem do Slide 0 (Overview)
    todasEntregas.sort((a,b) => a.prazo - b.prazo);
    const top3 = todasEntregas.slice(0, 3);

    reuniaoSlides.push({
        type: 'overview',
        ativos, negociacao, concluidos, top3
    });

    // 3. Montagem dos Slides de Projeto (Apenas os Ativos)
    projetosAndamento.sort((a, b) => a.nome.localeCompare(b.nome));

    projetosAndamento.forEach(proj => {
        let proximaEntrega = null;
        let isAtrasado = false;

        if (proj.etapas) {
            let pendentes = proj.etapas.filter(e => e.status !== 'concluido' && e.prazo).map(e => {
                let d = new Date(e.prazo);
                d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                return {...e, dateObj: d};
            });
            
            pendentes.sort((a,b) => a.dateObj - b.dateObj);
            
            if (pendentes.length > 0) {
                proximaEntrega = pendentes[0];
                if (proximaEntrega.dateObj < hoje) isAtrasado = true;
            }
        }

        reuniaoSlides.push({
            type: 'project',
            nome: proj.nome,
            cliente: proj.cliente,
            lider: proj.lider,
            equipe: proj.equipeAtual || [],
            proximaEntrega,
            isAtrasado
        });
    });

    if (reuniaoSlides.length === 1 && ativos === 0) {
        showToast("Não há projetos ativos para apresentar no momento.", "warning");
        return;
    }

    // 4. Trigger do Fullscreen e Renderização
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log("Erro de fullscreen:", err));

    const modalReuniao = document.getElementById('reuniao-modal');
    modalReuniao.style.display = 'flex';
    modalReuniao.style.opacity = '0';
    setTimeout(() => { modalReuniao.style.opacity = '1'; modalReuniao.style.transition = 'opacity 0.4s ease'; }, 10);
    
    renderReuniaoSlide();

    document.addEventListener('keydown', reuniaoKeyListener);
    document.addEventListener('fullscreenchange', checkFullscreenExit);
}

function fecharModoReuniao() {
    if (document.fullscreenElement) { document.exitFullscreen(); }
    const modalReuniao = document.getElementById('reuniao-modal');
    modalReuniao.style.opacity = '0';
    setTimeout(() => { modalReuniao.style.display = 'none'; }, 400);
    document.removeEventListener('keydown', reuniaoKeyListener);
    document.removeEventListener('fullscreenchange', checkFullscreenExit);
}

function checkFullscreenExit() {
    if (!document.fullscreenElement) {
        fecharModoReuniao();
    }
}

function reuniaoNextSlide() {
    if (reuniaoCurrentSlide < reuniaoSlides.length - 1) {
        reuniaoCurrentSlide++;
        renderReuniaoSlide();
    }
}

function reuniaoPrevSlide() {
    if (reuniaoCurrentSlide > 0) {
        reuniaoCurrentSlide--;
        renderReuniaoSlide();
    }
}

function reuniaoKeyListener(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') reuniaoNextSlide();
    if (e.key === 'ArrowLeft') reuniaoPrevSlide();
    if (e.key === 'Escape') fecharModoReuniao();
}

function renderReuniaoSlide() {
    const slide = reuniaoSlides[reuniaoCurrentSlide];
    const content = document.getElementById('reuniao-content');
    
    // Animação de entrada do slide
    content.style.opacity = '0';
    content.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
        document.getElementById('reuniao-counter').innerText = `Slide ${reuniaoCurrentSlide + 1} de ${reuniaoSlides.length}`;

        if (slide.type === 'overview') {
            let top3Html = slide.top3.map(t => `
                <div style="background: rgba(255,255,255,0.05); padding: 25px 30px; border-radius: 16px; margin-bottom: 20px; border-left: 5px solid var(--cadarn-roxo); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                    <span style="font-size: 24px;"><strong>${sanitize(t.projNome)}:</strong> ${sanitize(t.etapa)}</span>
                    <span style="font-size: 22px; color: #ffc107; font-family: 'Outfit', sans-serif; font-weight: 800; background:rgba(255,193,7,0.1); padding: 8px 16px; border-radius: 12px; border:1px solid rgba(255,193,7,0.3);">${t.prazo.toLocaleDateString('pt-BR')}</span>
                </div>
            `).join('');

            if (!top3Html) top3Html = '<div style="color: var(--cadarn-cinza); font-size: 20px; font-style:italic;">Nenhuma entrega com prazo mapeada no portfólio.</div>';

            content.innerHTML = `
                <div style="width: 100%; max-width: 1300px; padding: 40px;">
                    <h1 style="font-size: 58px; margin-bottom: 60px; color: white; font-weight: 900; letter-spacing: -2px;">Visão Geral do Portfólio</h1>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-bottom: 70px;">
                        <div style="background: rgba(182, 138, 255, 0.1); border: 1px solid rgba(182, 138, 255, 0.3); padding: 60px; border-radius: 24px; text-align: center; box-shadow: 0 10px 40px rgba(131,46,255,0.15);">
                            <div style="font-size: 20px; color: #c5a3ff; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 15px;">Em Execução</div>
                            <div style="font-size: 100px; font-weight: 900; color: white; font-family:'Outfit',sans-serif;">${slide.ativos}</div>
                        </div>
                        <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); padding: 60px; border-radius: 24px; text-align: center; box-shadow: 0 10px 40px rgba(255,193,7,0.15);">
                            <div style="font-size: 20px; color: #ffc107; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 15px;">Negociação</div>
                            <div style="font-size: 100px; font-weight: 900; color: white; font-family:'Outfit',sans-serif;">${slide.negociacao}</div>
                        </div>
                        <div style="background: rgba(71, 226, 153, 0.1); border: 1px solid rgba(71, 226, 153, 0.3); padding: 60px; border-radius: 24px; text-align: center; box-shadow: 0 10px 40px rgba(71,226,153,0.15);">
                            <div style="font-size: 20px; color: #47e299; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 15px;">Concluídos</div>
                            <div style="font-size: 100px; font-weight: 900; color: white; font-family:'Outfit',sans-serif;">${slide.concluidos}</div>
                        </div>
                    </div>
                    <h2 style="font-size: 24px; color: var(--cadarn-cinza); margin-bottom: 30px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">⚡ Próximas Entregas Críticas</h2>
                    ${top3Html}
                </div>
            `;
        } else if (slide.type === 'project') {
            const borderClass = slide.isAtrasado ? 'border: 2px solid rgba(220,53,69,0.5); box-shadow: 0 0 100px rgba(220,53,69,0.15);' : 'border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 20px 50px rgba(0,0,0,0.5);';
            const statusBadge = slide.isAtrasado 
                ? '<span style="background: rgba(220,53,69,0.15); color: #ff8793; padding: 12px 24px; border-radius: 12px; font-size: 18px; font-weight: 900; text-transform: uppercase; border: 1px solid rgba(220,53,69,0.5); letter-spacing: 1px;">⚠️ Atrasado</span>'
                : '<span style="background: rgba(71,226,153,0.1); color: #47e299; padding: 12px 24px; border-radius: 12px; font-size: 18px; font-weight: 900; text-transform: uppercase; border: 1px solid rgba(71,226,153,0.3); letter-spacing: 1px;">✅ Em Dia</span>';

            let entregaHtml = '<div style="font-size: 28px; color: var(--cadarn-cinza); font-style:italic;">Nenhuma entrega com prazo pendente para este projeto.</div>';
            if (slide.proximaEntrega) {
                entregaHtml = `
                    <div style="font-size: 16px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 20px;">Próxima Entrega Crítica:</div>
                    <div style="font-size: 42px; color: white; font-weight: 700; display: flex; align-items: center; gap: 25px; line-height: 1.2;">
                        ${sanitize(slide.proximaEntrega.titulo)} 
                        <span style="font-size: 34px; font-family: 'Outfit', sans-serif; font-weight: 800; color: ${slide.isAtrasado ? '#ff8793' : '#ffc107'}; background: rgba(0,0,0,0.4); padding: 8px 16px; border-radius:12px;">[${slide.proximaEntrega.dateObj.toLocaleDateString('pt-BR')}]</span>
                    </div>
                    <div style="font-size: 22px; color: var(--cadarn-cinza); margin-top: 20px;">Dono da Entrega: <strong style="color: white;">${sanitize(slide.proximaEntrega.responsavel || 'Não atribuído')}</strong></div>
                `;
            }

            const equipeList = slide.equipe.length > 0 ? slide.equipe.join(' • ') : 'Ninguém alocado';

            content.innerHTML = `
                <div style="width: 100%; max-width: 1400px; padding: 80px; background: rgba(20,20,22,0.9); border-radius: 32px; ${borderClass}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                        <div style="font-size: 32px; color: #c5a3ff; text-transform: uppercase; font-weight: 900; letter-spacing: 4px;">${sanitize(slide.cliente)}</div>
                        ${statusBadge}
                    </div>
                    <h1 style="font-size: 80px; font-weight: 900; color: white; line-height: 1.05; margin-bottom: 60px; letter-spacing: -2.5px; font-family:'Outfit',sans-serif;">${sanitize(slide.nome)}</h1>
                    
                    <div style="display: grid; grid-template-columns: 1fr 2.5fr; gap: 60px; margin-bottom: 70px; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1); padding: 50px 0;">
                        <div>
                            <div style="font-size: 16px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 15px;">Líder do Projeto</div>
                            <div style="font-size: 32px; color: white; font-weight: 700;">👤 ${sanitize(slide.lider)}</div>
                        </div>
                        <div>
                            <div style="font-size: 16px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 15px;">Equipe Ativa</div>
                            <div style="font-size: 28px; color: var(--cadarn-cinza); line-height: 1.6;">${sanitize(equipeList)}</div>
                        </div>
                    </div>

                    ${entregaHtml}
                </div>
            `;
        }

        // Animação de saída para entrada
        content.style.transition = 'all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    }, 50);
}

/* ========================================================= */
/* LISTA DE DOSSIÊS                                           */
/* ========================================================= */
function renderDossieList() {
    const container = document.getElementById('dossie-colab-list');
    if (!container) return;
    
    const canAccess = window.userRole === 'Sócio' || window.userRole === 'RH' || window.userRole === 'DEV';
    
    if (!canAccess) {
        container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:60px; background:rgba(255,255,255,0.02); border-radius:24px; border:1px solid rgba(255,255,255,0.05);">
                <div style="font-size:50px; margin-bottom:20px;">🔒</div>
                <h3 style="font-weight:900; color:#fff; font-size:28px; margin-bottom:15px; font-family:'Outfit',sans-serif;">Acesso Restrito</h3>
                <p style="font-size:16px; color:var(--cadarn-cinza);">Esta área é estritamente confidencial e exclusiva para Sócios e RH.</p>
            </div>`;
        return;
    }
    
    let html = '';
    const colabs = listaColaboradores;
    
    colabs.forEach(nome => {
        const conf = bdColabs[nome] || {};
        const primeiroNome = nome.split(' ')[0];
        const iniciais = nome.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
        html += `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:25px;cursor:pointer;transition:0.3s;box-shadow:0 4px 15px rgba(0,0,0,0.2);" 
             onmouseover="this.style.borderColor='rgba(255,193,7,0.5)'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 25px rgba(0,0,0,0.4)';" 
             onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 15px rgba(0,0,0,0.2)';"
             onclick="abrirDossieColaborador('${nome}')">
            <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                <div style="width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,var(--cadarn-roxo),#420a9a);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;color:#fff;flex-shrink:0;box-shadow:0 0 15px rgba(131,46,255,0.4);">${iniciais}</div>
                <div>
                    <div style="font-weight:800;font-size:16px;color:#fff;margin-bottom:4px;">${sanitize(nome)}</div>
                    <div style="font-size:12px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">Colaborador(a)</div>
                </div>
            </div>
            <div style="display:flex;justify-content:flex-end;">
                <span style="font-size:12px;color:#ffc107;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.3);padding:6px 14px;border-radius:20px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">🔒 Ver Dossiê</span>
            </div>
        </div>`;
    });
    
    container.innerHTML = html || '<p style="color:var(--cadarn-cinza); text-align:center; padding:30px; font-size:14px;">Nenhum colaborador cadastrado no banco de dados.</p>';
}

// Variáveis globais para armazenar as instâncias do Chart.js
let chartReceitaInstance = null;
let chartMargemInstance = null;

function renderFinanceiroPremium() {
    let projetosFinanceiros = [];
    let totalFee = 0;
    let totalCusto = 0;
    
    // 1. Mineração de Dados
    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (proj.arquivado || proj.status_crm === 'concluido') return;
        
        const fee = proj.valorContrato || 0;
        const custoHoras = (proj.horasReais || 0) * 150; 
        const margemPct = fee > 0 ? ((fee - custoHoras) / fee) * 100 : 0;
        
        totalFee += fee;
        totalCusto += custoHoras;

        projetosFinanceiros.push({
            nome: proj.nome,
            cliente: proj.cliente,
            fee: fee,
            custo: custoHoras,
            margem: margemPct,
            status: proj.status_crm
        });
    });

    projetosFinanceiros.sort((a, b) => b.fee - a.fee);

    // 2. Renderizar Tabela
    const tbody = document.getElementById('financeiro-tabela-body');
    if (tbody) {
        if (projetosFinanceiros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--cadarn-cinza); font-size:14px; font-weight:600;">Nenhum dado financeiro de projetos ativos registrado.</td></tr>';
        } else {
            tbody.innerHTML = projetosFinanceiros.map(p => {
                const margemColor = p.margem >= 40 ? '#47e299' : (p.margem >= 20 ? '#ffc107' : '#ff8793');
                return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 18px 20px; color: white; font-weight: 700; font-size:14px;">${sanitize(p.nome)} <br><span style="font-size:11px; color:var(--cadarn-cinza); font-weight:500;">${sanitize(p.cliente)}</span></td>
                    <td style="padding: 18px 20px; color: #FFC107; font-family: 'Outfit', sans-serif; font-weight: 800; font-size:15px;">R$ ${p.fee.toLocaleString('pt-BR')}</td>
                    <td style="padding: 18px 20px; color: #ff8793; font-family: 'Outfit', sans-serif; font-weight: 700; font-size:15px;">R$ ${p.custo.toLocaleString('pt-BR')}</td>
                    <td style="padding: 18px 20px; color: ${margemColor}; font-weight: 800; font-size:15px;">${p.margem.toFixed(1)}%</td>
                    <td style="padding: 18px 20px; text-transform: uppercase; font-size: 11px; font-weight:800; color: var(--cadarn-cinza);">${p.status}</td>
                </tr>
                `;
            }).join('');
        }
    }

    // 3. Renderizar Gráfico de Barras
    const ctxReceita = document.getElementById('chart-receita-custo');
    if (ctxReceita) {
        if (chartReceitaInstance) chartReceitaInstance.destroy();
        
        const top5 = projetosFinanceiros.slice(0, 5);
        chartReceitaInstance = new Chart(ctxReceita, {
            type: 'bar',
            data: {
                labels: top5.map(p => p.nome.substring(0, 15) + '...'),
                datasets: [
                    {
                        label: 'Fee (Receita)',
                        data: top5.map(p => p.fee),
                        backgroundColor: 'rgba(255, 193, 7, 0.9)',
                        borderRadius: 6
                    },
                    {
                        label: 'Custo Base',
                        data: top5.map(p => p.custo),
                        backgroundColor: 'rgba(220, 53, 69, 0.9)',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#a1a1aa', font: {size: 11, weight:'bold'} }, grid: { display: false } }
                },
                plugins: { legend: { labels: { color: '#fff', font: {weight:'bold'} } } }
            }
        });
    }

    // 4. Renderizar Gráfico de Margem Geral
    const ctxMargem = document.getElementById('chart-margem-geral');
    if (ctxMargem) {
        if (chartMargemInstance) chartMargemInstance.destroy();
        
        let saudaveis = 0, atencao = 0, criticos = 0;
        projetosFinanceiros.forEach(p => {
            if(p.fee > 0) {
                if(p.margem >= 40) saudaveis++;
                else if (p.margem >= 20) atencao++;
                else criticos++;
            }
        });

        chartMargemInstance = new Chart(ctxMargem, {
            type: 'doughnut',
            data: {
                labels: ['+40% (Saudável)', '20-40% (Atenção)', '<20% (Crítico)'],
                datasets: [{
                    data: [saudaveis, atencao, criticos],
                    backgroundColor: ['#47e299', '#ffc107', '#dc3545'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa', boxWidth: 12, font: {size: 11, weight:'bold'} } } }
            }
        });
    }

    // 5. Gerar Insight Dinâmico
    const insightBox = document.getElementById('financeiro-insight-texto');
    if (insightBox) {
        const margemGeral = totalFee > 0 ? ((totalFee - totalCusto) / totalFee) * 100 : 0;
        let texto = '';
        
        if (totalFee === 0) {
            texto = "O portfólio não possui contratos com valores preenchidos. Atualize as informações na aba Projetos.";
        } else if (margemGeral < 25) {
            texto = `⚠️ **ALERTA DE RENTABILIDADE:** A margem média do portfólio está em apenas <span style="color:#ff8793;">${margemGeral.toFixed(1)}%</span>. Os custos de horas alocadas estão consumindo agressivamente os Fees. Ação recomendada: Revisar escopos dos top projetos.`;
        } else if (margemGeral >= 25 && margemGeral < 45) {
            texto = `⚖️ **PORTFÓLIO ESTÁVEL:** A margem média do portfólio está em <span style="color:#FFC107;">${margemGeral.toFixed(1)}%</span>. O volume está bom, mas há espaço para otimização de tempo em projetos de delivery longo.`;
        } else {
            texto = `🚀 **PERFORMANCE EXCELENTE:** A margem média do portfólio está em impressionantes <span style="color:#47e299;">${margemGeral.toFixed(1)}%</span>. A relação de esforço/hora versus precificação está altamente lucrativa no momento.`;
        }
        insightBox.innerHTML = texto.replace(/\*\*(.*?)\*\*/g, '<strong style="color:white; font-size:15px;">$1</strong>');
    }
}

// =========================================================
// LÓGICA FINAL: CONTROLE DE EDIÇÃO
// =========================================================

window.isDossieEditing = false;

window.toggleEditDossie = function() {
    window.isDossieEditing = !window.isDossieEditing;
    const fields = document.querySelectorAll('.dossie-field');
    const btnSalvar = document.getElementById('btn-salvar-dossie');
    const btnToggle = document.getElementById('btn-toggle-edit-dossie');
    const uploadArea = document.getElementById('dossie-upload-area');
    const box = document.getElementById('dossie-modal-box');

    if (window.isDossieEditing) {
        fields.forEach(f => {
            f.removeAttribute('readonly');
            f.removeAttribute('disabled');
            f.style.background = 'rgba(0,0,0,0.8)';
            f.style.border = '1px solid var(--cadarn-roxo)';
            if (f.tagName === 'TEXTAREA') f.style.resize = 'vertical';
        });
        if(btnSalvar) btnSalvar.style.display = 'block';
        if(uploadArea) uploadArea.style.display = 'block';
        if(btnToggle) {
            btnToggle.innerHTML = '✕ Cancelar Edição';
            btnToggle.style.color = '#ff8793';
            btnToggle.style.borderColor = 'rgba(220,53,69,0.5)';
            btnToggle.style.background = 'rgba(220,53,69,0.15)';
        }
        if(box) box.style.borderColor = 'var(--cadarn-roxo)';
    } else {
        fields.forEach(f => {
            f.setAttribute('readonly', 'true');
            f.setAttribute('disabled', 'true');
            f.style.background = 'rgba(255,255,255,0.05)';
            f.style.border = '1px solid transparent';
            if (f.tagName === 'TEXTAREA') f.style.resize = 'none';
        });
        if(btnSalvar) btnSalvar.style.display = 'none';
        if(uploadArea) uploadArea.style.display = 'none';
        if(btnToggle) {
            btnToggle.innerHTML = '✏️ Editar';
            btnToggle.style.color = '#c5a3ff';
            btnToggle.style.borderColor = 'rgba(131,46,255,0.3)';
            btnToggle.style.background = 'rgba(131,46,255,0.15)';
        }
        if(box) box.style.borderColor = 'rgba(255,193,7,0.3)';
    }
};

// =========================================================
// GESTÃO DE ACESSOS E COLABORADORES (IAM)
// =========================================================

window.abrirModalColaborador = function(nome = '') {
    const isEdit = nome !== '';
    document.getElementById('modal-colab-titulo').innerText = isEdit ? 'Acessos: ' + nome : 'Novo Colaborador';
    
    const inputNome = document.getElementById('modal-colab-nome');
    inputNome.value = isEdit ? nome : '';
    inputNome.disabled = isEdit; 
    if(isEdit) inputNome.style.color = "var(--cadarn-cinza)";
    else inputNome.style.color = "white";

    let email = '', cargo = 'Estagiário', perms = {};
    if (isEdit && bdColabs[nome]) {
        email = bdColabs[nome].email || '';
        cargo = bdColabs[nome].cargo || 'Estagiário';
        perms = bdColabs[nome].permissoes || {};
    }

    document.getElementById('modal-colab-email').value = email;
    document.getElementById('modal-colab-cargo').value = cargo;
    document.getElementById('perm-fin').checked = !!perms.verFinanceiro;
    document.getElementById('perm-dos').checked = !!perms.verDossie;
    document.getElementById('perm-edit').checked = !!perms.editarProjetos;
    document.getElementById('perm-ger').checked = !!perms.gerenciarEquipe;

    document.getElementById('modal-colaborador').classList.add('active');
};

window.fecharModalColaborador = function(e) {
    if (!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-colaborador').classList.remove('active');
    }
};

window.salvarColaborador = async function() {
    const btnSalvar = document.getElementById('btn-salvar-iam');
    const nome = document.getElementById('modal-colab-nome').value.trim();
    const email = document.getElementById('modal-colab-email').value.trim();
    const cargo = document.getElementById('modal-colab-cargo').value;

    if (!nome || !email) {
        showToast("Nome e E-mail são obrigatórios!", "warning");
        return;
    }

    const textoOriginal = btnSalvar.innerHTML;
    btnSalvar.innerHTML = '⏳ SALVANDO...';
    btnSalvar.disabled = true;
    btnSalvar.style.opacity = '0.7';

    const permissoes = {
        verFinanceiro: document.getElementById('perm-fin').checked,
        verDossie: document.getElementById('perm-dos').checked,
        editarProjetos: document.getElementById('perm-edit').checked,
        gerenciarEquipe: document.getElementById('perm-ger').checked
    };

    const dataPayload = {
        nome,
        email,
        cargo,
        permissoes,
        atualizadoEm: Date.now(),
        atualizadoPor: usuarioLogado
    };

    try {
        const { doc, setDoc } = firestore;
        await setDoc(doc(db, "colaboradores", nome), dataPayload, { merge: true });
        
        showToast("Acessos salvos com sucesso!", "success");
        window.fecharModalColaborador();
        
        if (!listaColaboradores.includes(nome)) {
            listaColaboradores.push(nome);
            listaColaboradores.sort();
            iniciarUI(); 
        }
        
    } catch(e) {
        showToast("Falha ao salvar acessos na nuvem.", "danger");
    } finally {
        btnSalvar.innerHTML = textoOriginal;
        btnSalvar.disabled = false;
        btnSalvar.style.opacity = '1';
    }
};

// EXPOSIÇÃO DE TODAS AS FUNÇÕES AO WINDOW (PARA O HTML ENXERGAR)
window.abrirDossieColaborador = abrirDossieColaborador;
window.processarArquivoDossie = processarArquivoDossie;
window.abrirModalDiaCalendario = abrirModalDiaCalendario;
window.fecharModalDiaCalendario = fecharModalDiaCalendario;
window.revisarProjetoComIA = revisarProjetoComIA;
window.validarFormularioProjeto = validarFormularioProjeto;
window.atualizarContadoresKanban = atualizarContadoresKanban;
window.renderDossieList = renderDossieList;
window.switchTab = switchTab;
window.abrirModoReuniao = abrirModoReuniao;
window.fecharModoReuniao = fecharModoReuniao;
window.reuniaoNextSlide = reuniaoNextSlide;
window.reuniaoPrevSlide = reuniaoPrevSlide;
window.renderFinanceiroPremium = renderFinanceiroPremium;
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
window.renderCalendario = renderCalendario;
window.renderCronograma = renderCronograma;
window.importarDados = importarDados;
window.exportarProjetosCSV = exportarProjetosCSV;
window.verificarAlertasDoDia = verificarAlertasDoDia;
