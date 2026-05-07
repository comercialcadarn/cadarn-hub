/* ========================================================= */
/* LÓGICA DE ENGENHARIA E GESTÃO: ÁREA DO SÓCIO              */
/* ========================================================= */

const listaColaboradores = [
    "Ana Carolina Bittencourt", "Ana Clara Fabris", "Barbara Figueiredo",
    "Carlos Oliveira", "Debora Yuan", "Eduardo Figueiredo", "Felipe Penido", "João Pedro Soares",
    "Juliana Deoracki", "Leonardo Assis", "Leonardo Pierangelli", "Louise Varela",
    "Maria de Macedo", "Maria Eduarda Aguiar", "Maria Emília Velozo", "Matheus Zucon",
    "Otavio Pimentel", "Rafaela Avila", "Sâmia Franco", "Stefano Miceli", "Susana Vicenti", "Victor Hugo Mendes"
].sort();

const emailsSocios = [
    'debora.yuan@cadarnconsultoria.com.br',
    'felipe.penido@cadarnconsultoria.com.br',
    'leonardo.assis@cadarnconsultoria.com.br',
    'juliana.deoracki@cadarnconsultoria.com.br'
];
const emailsDEV = ['victor.mendes@cadarnconsultoria.com.br'];
const emailsRH  = ['barbara.figueiredo@cadarnconsultoria.com.br'];

function getSocioRole(email) {
    if (!email) return 'Visitante';
    const e = email.toLowerCase().trim();
    if (emailsSocios.includes(e)) return 'Sócio';
    if (emailsDEV.includes(e))    return 'DEV';
    if (emailsRH.includes(e))     return 'RH';
    return 'Visitante';
}

let db;
let firestore = {};
let bdProjetos = {};
let bdColabs   = {};
let bdPerfis   = {}; // NOVO: Armazena as matrizes de acesso dinâmicas
let filtroResponsavel = '';


let projetoModalAberto = null;
let isCriandoNovo      = false;
let etapasTemporarias  = [];
let usuarioLogado      = localStorage.getItem('cadarn_user') || 'Sócio';
window.userRole        = getSocioRole(localStorage.getItem('cadarn_user_email') || '');
window.userPermissoes  = {};

// Controle do Calendário
let dataAtualCalendario = new Date();

// =====================================================
// UTILITÁRIOS
// =====================================================
function tempoRelativoSocio(timestamp) {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60)     return 'agora mesmo';
    if (diff < 3600)   return `há ${Math.floor(diff / 60)}min`;
    if (diff < 86400)  return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `há ${Math.floor(diff / 86400)}d`;
    return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function sanitize(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
    return String(str).replace(/[&<>"'/]/ig, match => map[match]);
}

// =====================================================
// FIREBASE INIT & AUTH
// =====================================================
async function initSegurancaSocios() {
    const { initializeApp }              = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js');
    const { getAuth, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js');
    const { getFirestore, collection, onSnapshot, doc, setDoc, getDocs } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js');
firestore = { collection, onSnapshot, doc, setDoc, getDocs };

    const firebaseConfig = {
        apiKey:            'AIzaSyAnClCbOU3JRBehpGvrKj8RrcS86lyl3gg',
        authDomain:        'cadarn-hub.firebaseapp.com',
        projectId:         'cadarn-hub',
        storageBucket:     'cadarn-hub.firebasestorage.app',
        messagingSenderId: '1078276499614',
        appId:             '1:1078276499614:web:135e544d9c26e3bd2f338f'
    };

    const app  = initializeApp(firebaseConfig);
    db         = getFirestore(app, 'cadarn-hub');
    const auth = getAuth(app);

    onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }

    let role = getSocioRole(user.email);

    // Se não está nas arrays hardcoded, consulta o cargo salvo no Firestore
    if (role === 'Visitante') {
        try {
            const snap = await firestore.getDocs(firestore.collection(db, 'colaboradores'));
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if ((d.email || '').toLowerCase().trim() === user.email.toLowerCase().trim()) {
                    const cargo = d.cargo || '';
                   if (['RH', 'DEV', 'Sócio'].includes(cargo)) {
    role = cargo;
} else {
    // Cargos comuns (Estagiário, Analista): libera acesso se tiver ao menos 1 permissão ABAC ativa
    const temPermissao = Object.values(d.permissoes || {}).some(v => v === true);
    if (temPermissao) role = 'Colaborador';
}
                }
            });
        } catch (e) { console.warn('Erro ao verificar cargo no Firestore:', e); }

        if (role === 'Visitante') { window.location.href = 'index.html'; return; }
    }

    window.userRole = role;
    usuarioLogado   = user.displayName || user.email || 'Sócio';
    localStorage.setItem('cadarn_user',       usuarioLogado);
    localStorage.setItem('cadarn_user_email', user.email || '');
    document.getElementById('conteudo-restrito').style.display = 'block';

    const avatarEl = document.getElementById('header-user-avatar');
    const nameEl   = document.getElementById('header-user-name');
    if (avatarEl) avatarEl.textContent = usuarioLogado.charAt(0).toUpperCase();
    if (nameEl)   nameEl.textContent   = usuarioLogado.split(' ')[0];

    iniciarUI();
    iniciarListeners();
});
}

// =====================================================
// UI INICIAL
// =====================================================
function iniciarUI() {
    const selectFiltro = document.getElementById('filtro-responsavel');
    if (selectFiltro) {
        let options = '<option value="">Todos da Equipe</option>';
        listaColaboradores.forEach(nome => { options += `<option value="${nome}">${nome}</option>`; });
        selectFiltro.innerHTML = options;
    }

    const datalistLider = document.getElementById('lista-nomes-datalist');
    if (datalistLider) {
        datalistLider.innerHTML = listaColaboradores.map(nome => `<option value="${nome}">`).join('');
    }
    setupAutocompleteMulti(document.getElementById('modal-equipe'), listaColaboradores);

    // Restrição de acesso do RH ao módulo financeiro
    if (window.userRole === 'RH') {
        const btnFinanceiro = document.getElementById('tab-btn-financeiro');
        if (btnFinanceiro) btnFinanceiro.style.display = 'none';
        const barraFinanceiraTopo = document.querySelector('.financial-health-bar');
        if (barraFinanceiraTopo) barraFinanceiraTopo.style.display = 'none';
        const campoFinContrato = document.getElementById('modal-valor-contrato');
        if (campoFinContrato) campoFinContrato.parentElement.parentElement.style.display = 'none';
    }
    aplicarPermissoesUI();
}
// =====================================================
// PERMISSÕES ABAC — APLICAÇÃO EM TEMPO REAL
// =====================================================
function atualizarPermissoesLocais() {
    const emailAtual = (localStorage.getItem('cadarn_user_email') || '').toLowerCase().trim();

    // Estado base (Visitante restrito)
    window.userRole = 'Visitante';
    window.userPermissoes = { verFinanceiro: false, verDossie: false, editarProjetos: false, gerenciarEquipe: false, gerenciarPerfis: false };

    // ── 1. FIRESTORE É A FONTE DE VERDADE ──
    let encontrouNoBanco = false;
    for (const colab of Object.values(bdColabs)) {
        if ((colab.email || '').toLowerCase().trim() !== emailAtual) continue;
        encontrouNoBanco = true;

        const cargo = colab.cargo || 'Estagiário';
        window.userRole = cargo;

        // Recupera a matriz do Perfil (RBAC Dinâmico) do Hub
        const permissoesPerfil = bdPerfis[cargo]?.permissoes || {};

        // Recupera Permissões Individuais (ABAC Granular)
        const p = colab.permissoes || {};

        // Regra: ABAC (Individual) sobrescreve RBAC (Perfil) se existir. Senão, assume o Perfil.
        window.userPermissoes = {
            verFinanceiro:   p.verFinanceiro   !== undefined ? p.verFinanceiro   : !!permissoesPerfil.verFinanceiro,
            verDossie:       p.verDossie       !== undefined ? p.verDossie       : !!permissoesPerfil.verDossie,
            editarProjetos:  p.editarProjetos  !== undefined ? p.editarProjetos  : !!permissoesPerfil.editarProjetos,
            gerenciarEquipe: p.gerenciarEquipe !== undefined ? p.gerenciarEquipe : !!permissoesPerfil.gerenciarEquipe,
            gerenciarPerfis: p.gerenciarPerfis !== undefined ? p.gerenciarPerfis : !!permissoesPerfil.gerenciarPerfis
        };

        // Trava de segurança para impedir *lockout* da plataforma
        if (cargo === 'Sócio' || cargo === 'DEV') {
            window.userPermissoes.gerenciarPerfis = true;
        }
        break;
    }

    // ── 2. FALLBACK (Hardcode de contingência) ──
    if (!encontrouNoBanco) {
        const roleHardcoded = getSocioRole(emailAtual);
        window.userRole = roleHardcoded;
        if (roleHardcoded === 'Sócio' || roleHardcoded === 'DEV') {
            window.userPermissoes = { verFinanceiro: true, verDossie: true, editarProjetos: true, gerenciarEquipe: true, gerenciarPerfis: true };
        } else if (roleHardcoded === 'RH') {
            window.userPermissoes.verDossie = true;
        }
    }
}
function aplicarPermissoesUI() {
    atualizarPermissoesLocais();
    const p = window.userPermissoes;

    // ── verFinanceiro: aba, barra do topo e campos de valor/horas no modal ──
    const tabFin    = document.getElementById('tab-btn-financeiro');
    const barraFin  = document.querySelector('.financial-health-bar');
    if (tabFin)     tabFin.style.display   = p.verFinanceiro ? '' : 'none';
    if (barraFin)   barraFin.style.display = p.verFinanceiro ? '' : 'none';

    const campoContrato = document.getElementById('modal-valor-contrato');
    if (campoContrato && campoContrato.parentElement?.parentElement) {
        campoContrato.parentElement.parentElement.style.display = p.verFinanceiro ? '' : 'none';
    }

    // ── verDossie: aba de dossiês ──
    const tabDossie = document.getElementById('tab-btn-dossie');
    if (tabDossie)  tabDossie.style.display = p.verDossie ? '' : 'none';

    // ── editarProjetos: botão "Criar Projeto" e botões de importação ──
    const btnCriar = document.querySelector('button.btn-create[onclick="novoProjetoSocio()"]');
    if (btnCriar)   btnCriar.style.display = p.editarProjetos ? '' : 'none';

    const btnImportPipe    = document.querySelector('button[onclick*="file-import-pipe"]');
    const btnImportProj    = document.querySelector('button[onclick*="file-import-projetos"]');
    if (btnImportPipe)  btnImportPipe.style.display  = p.editarProjetos ? '' : 'none';
    if (btnImportProj)  btnImportProj.style.display  = p.editarProjetos ? '' : 'none';
// Mostra/Oculta botão do Hub de Perfis
    const btnPerfis = document.getElementById('btn-gestao-perfis');
    if (btnPerfis) btnPerfis.style.display = p.gerenciarPerfis ? 'block' : 'none';
}
// =====================================================
// LISTENERS DO FIRESTORE (TEMPO REAL)
// =====================================================
function iniciarListeners() {
    // Tratador de falha global para evitar quebra silenciosa da interface
    const tratadorDeErro = (err) => {
        console.error("Erro no Listener (Firebase):", err);
        if (err.code === 'permission-denied') {
            showToast('Aviso: Restrição de acesso detectada pelo servidor.', 'danger');
        }
    };

    // 1. OUVINTE DE PROJETOS
    firestore.onSnapshot(firestore.collection(db, 'projetos'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === 'removed') delete bdProjetos[id];
            else bdProjetos[id] = change.doc.data();
        });
        renderKanban();
        renderWorkload();
        renderCronograma('gantt-master-container', filtroResponsavel);
        renderCalendario();
        renderTeamAvailability();
        renderFinancialHealth();
    }, tratadorDeErro);

    // 2. OUVINTE DE COLABORADORES (Desvinculado de Perfis)
    firestore.onSnapshot(firestore.collection(db, 'colaboradores'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const nome = change.doc.id;
            if (change.type === 'removed') delete bdColabs[nome];
            else bdColabs[nome] = change.doc.data();
        });
        aplicarPermissoesUI();
        renderDossieList();
        renderWorkload();
        verificarAlertasDoDia();
        
        // Atualiza a tela de Perfis caso ela esteja aberta
        if (document.getElementById('modal-gestao-perfis')?.classList.contains('active')) {
            const perfilAberto = document.getElementById('perfil-id-atual')?.value;
            if (perfilAberto) renderUsuariosDoPerfil(perfilAberto);
            renderListaPerfisSidebar();
        }
    }, tratadorDeErro);

    // 3. OUVINTE DE PERFIS (RBAC) - Agora roda limpo em paralelo
    firestore.onSnapshot(firestore.collection(db, 'perfis'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === 'removed') delete bdPerfis[id];
            else bdPerfis[id] = change.doc.data();
        });
        aplicarPermissoesUI();
        if (document.getElementById('modal-gestao-perfis')?.classList.contains('active')) {
            renderListaPerfisSidebar();
        }
    }, tratadorDeErro);

    inicializarDragAndDrop();
    verificarAlertasDoDia();
}
// =====================================================
// TROCA DE ABAS
// =====================================================
function switchTab(tab) {
    const views = ['projetos', 'pessoas', 'cronograma', 'calendario', 'dossie', 'financeiro'];

    views.forEach(v => {
        const el  = document.getElementById(`view-${v}`);
        const btn = document.getElementById(`tab-btn-${v}`);
        if (el) { el.style.opacity = '0'; el.style.display = 'none'; }
        if (btn) btn.classList.remove('active');
    });

    const targetView = document.getElementById(`view-${tab}`);
    const targetBtn  = document.getElementById(`tab-btn-${tab}`);

    if (targetView) {
        targetView.style.display = tab === 'projetos' ? 'grid' : 'block';
        if (targetBtn) targetBtn.classList.add('active');

        // Pequeno delay para disparar transição de opacidade
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                targetView.style.opacity = '1';
                if (tab === 'cronograma') renderCronograma('gantt-master-container', filtroResponsavel);
                if (tab === 'dossie')     renderDossieList();
                if (tab === 'calendario') renderCalendario();
                if (tab === 'financeiro') renderFinanceiroPremium();
            });
        });
    }
}

// =====================================================
// FILTROS
// =====================================================
function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban();
    renderWorkload();
    renderCronograma('gantt-master-container', filtroResponsavel);
}

// =====================================================
// TOAST
// =====================================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// =====================================================
// KANBAN RENDER
// ✅ BUG CORRIGIDO: 4 colunas agora separadas corretamente
// ✅ BUG CORRIGIDO: atualizarContadoresKanban() chamado ao final
// ✅ MELHORIA: progress bar por card + animação sequencial
// =====================================================
function renderKanban() {
    let htmlNegociacao = '', htmlAndamento = '', htmlIniciado = '', htmlConcluido = '';
    const hoje = new Date(new Date().setHours(0, 0, 0, 0));
    let cardIndex = 0;

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;

        if (filtroResponsavel) {
            const temTarefaResponsavel = (proj.etapas || []).some(t => t.responsavel === filtroResponsavel);
            if (!temTarefaResponsavel && proj.lider !== filtroResponsavel && !(proj.equipeAtual || []).includes(filtroResponsavel)) continue;
        }

        const statusCrm = proj.status_crm || 'negociacao';
        const etapas    = proj.etapas || [];

        const isVisivel  = proj.visivelHub
            ? '<span title="Visível no Hub da Equipe" style="color:#47e299; font-size:10px;">👁️ Equipe Vê</span>'
            : '<span title="Oculto da equipe"         style="color:#ffc107; font-size:10px;">🙈 Só Sócios</span>';

        let temAtraso   = etapas.some(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) < hoje);
        let borderStyle = temAtraso ? 'border-color: #dc3545; box-shadow: 0 0 14px rgba(220,53,69,0.35), inset 0 1px 0 rgba(255,255,255,0.05); animation: pulseAlert 2s infinite;' : '';
        let atrasoBadge = temAtraso
            ? '<span style="background:rgba(220,53,69,0.2); color:#ff8793; padding:3px 8px; border-radius:4px; font-size:9px; font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">⚠️ Atrasado</span>'
            : '';

        const tagsHtml = (proj.tags || []).slice(0, 3).map(t =>
            `<span style="background: rgba(131, 46, 255, 0.15); color: #c5a3ff; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 12px; border: 1px solid rgba(131,46,255,0.3);">${sanitize(t)}</span>`
        ).join('');

        const contractBadge = proj.valorContrato > 0
            ? `<div style="background: linear-gradient(135deg, #FFC107, #FF9800); color: #000; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900; display: inline-block;">R$ ${proj.valorContrato.toLocaleString('pt-BR')}</div>`
            : '';

        // ✅ MELHORIA: barra de progresso das tarefas
        const totalEtapas     = etapas.length;
        const concluidasCount = etapas.filter(t => t.status === 'concluido').length;
        const progressPct     = totalEtapas > 0 ? Math.round((concluidasCount / totalEtapas) * 100) : 0;
        const progressColor   = progressPct === 0 ? 'rgba(255,255,255,0.1)' : (progressPct >= 90 ? '#47e299' : progressPct >= 50 ? '#ffc107' : '#832EFF');
        const progressBar     = totalEtapas > 0
            ? `<div class="card-progress-bar-bg"><div class="card-progress-bar-fill" style="width:${progressPct}%; background:${progressColor};"></div></div>`
            : '';

        // ✅ MELHORIA: animação sequencial (delay por index)
        const delay = Math.min(cardIndex * 40, 300);

        const card = `
            <div class="kanban-card" style="${borderStyle} animation-delay:${delay}ms;" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px;">
                    <div class="kanban-card-title">${sanitize(proj.nome || 'Sem Nome')}</div>
                    ${atrasoBadge}
                </div>
                <div style="font-size: 12px; color: var(--cadarn-cinza); margin-bottom: 10px; font-weight: 500;">${sanitize(proj.cliente || 'Sem Cliente')}</div>
                <div style="display:flex; gap: 5px; flex-wrap: wrap; margin-bottom: 12px; align-items: center;">
                    ${tagsHtml}
                    ${contractBadge}
                </div>
                ${progressBar}
                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; margin-top:10px; font-size: 11px;">
                    <div style="color: var(--cadarn-cinza);">📝 ${concluidasCount}/${totalEtapas} Etapas ${progressPct > 0 ? `<span style="color:${progressColor};">(${progressPct}%)</span>` : ''}</div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
                        <div style="font-weight: bold; font-size: 10px;">${isVisivel}</div>
                        ${proj.ultimaEdicao ? `<div style="font-size:9px; color:rgba(255,255,255,0.25);">✏️ ${tempoRelativoSocio(proj.ultimaEdicao)}</div>` : ''}
                    </div>
                </div>
            </div>
        `;

        // ✅ BUG CORRIGIDO: 'concluido' agora vai para htmlConcluido, não htmlIniciado
        if      (statusCrm === 'negociacao') htmlNegociacao += card;
        else if (statusCrm === 'andamento')  htmlAndamento  += card;
        else if (statusCrm === 'iniciado')   htmlIniciado   += card;
        else if (statusCrm === 'concluido')  htmlConcluido  += card;

        cardIndex++;
    }

    const emptyMsg = (msg) => `<div class="kanban-no-drag" style="text-align:center; padding:30px 15px; color:var(--cadarn-cinza); font-size:12px; border: 1px dashed rgba(255,255,255,0.06); border-radius:12px; margin: auto 0; cursor: default;">${msg}</div>`;

    document.getElementById('col-negociacao').innerHTML = htmlNegociacao || emptyMsg('Nenhuma proposta em negociação.');
    document.getElementById('col-andamento').innerHTML  = htmlAndamento  || emptyMsg('Nenhum projeto em delivery.');
    document.getElementById('col-iniciados').innerHTML  = htmlIniciado   || emptyMsg('Nenhum projeto iniciado.');
    document.getElementById('col-concluido').innerHTML  = htmlConcluido  || emptyMsg('Nenhum projeto concluído.');

    // ✅ BUG CORRIGIDO: contador agora é atualizado após renderizar
    atualizarContadoresKanban();

    // Re-inicializa drag-and-drop (fix bug de handlers duplicados)
    inicializarDragAndDrop();
}

// =====================================================
// DRAG AND DROP (SORTABLE)
// =====================================================
let _sortableInstances = [];

function inicializarDragAndDrop() {
    _sortableInstances.forEach(s => { try { s.destroy(); } catch (e) { /* ignore */ } });
    _sortableInstances = [];

    const colunas = [
        document.getElementById('col-negociacao'),
        document.getElementById('col-andamento'),
        document.getElementById('col-iniciados'),
        document.getElementById('col-concluido') // ✅ 4ª coluna incluída
    ];

    colunas.forEach(coluna => {
        if (!coluna) return;
        const inst = new Sortable(coluna, {
            group:      'kanban_socios',
            animation:  200,
            ghostClass: 'sortable-ghost',
            dragClass:  'sortable-drag',
            filter:     '.kanban-no-drag',
            onEnd: async function (evt) {
                const itemEl    = evt.item;
                const toList    = evt.to;
                const projetoId = itemEl.getAttribute('data-id');
                const novoStatus = toList.getAttribute('data-status');

                if (projetoId && novoStatus && bdProjetos[projetoId]) {
                    bdProjetos[projetoId].status_crm = novoStatus;
                    atualizarContadoresKanban();
                    try {
                        await firestore.setDoc(
                            firestore.doc(db, 'projetos', projetoId),
                            { status_crm: novoStatus },
                            { merge: true }
                        );
                        showToast('Pipeline atualizado ✓', 'success');
                    } catch (e) {
                        console.error('Erro ao mover card:', e);
                        showToast('Erro ao salvar. Tente novamente.', 'danger');
                    }
                }
            }
        });
        _sortableInstances.push(inst);
    });
}

// ✅ BUG CORRIGIDO: contador da 4ª coluna (concluido) adicionado
function atualizarContadoresKanban() {
    const contar = (colId) => document.getElementById(colId)?.querySelectorAll('.kanban-card').length || 0;
    const countNeg  = document.getElementById('count-negociacao');
    const countAnd  = document.getElementById('count-andamento');
    const countIni  = document.getElementById('count-iniciado');
    const countConc = document.getElementById('count-concluido');
    if (countNeg)  countNeg.textContent  = contar('col-negociacao');
    if (countAnd)  countAnd.textContent  = contar('col-andamento');
    if (countIni)  countIni.textContent  = contar('col-iniciados');
    if (countConc) countConc.textContent = contar('col-concluido');
}

// =====================================================
// DOSSIÊ CONFIDENCIAL
// =====================================================
function verificarAcessoDossie(resourceOwnerId) {
    const role = window.userRole || 'Estagiário';
    if (role === 'Sócio' || role === 'RH' || role === 'DEV') return true;
    if (window.userPermissoes?.verDossie) return true;
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
            firestore.doc(db, 'dossies', nomeColaborador.replace(/\s+/g, '_')),
            { ...dados, atualizadoEm: Date.now(), atualizadoPor: usuarioLogado },
            { merge: true }
        );
        showToast('Dossiê salvo com segurança.', 'success');
    } catch (e) {
        showToast('Erro ao salvar dossiê.', 'danger');
    }
}

async function abrirDossieColaborador(nomeColaborador) {
    window.isDossieEditing = false;
    if (!verificarAcessoDossie(nomeColaborador)) {
        const msg = document.createElement('div');
        msg.innerHTML = `<div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(220,53,69,0.15);border:1px solid rgba(220,53,69,0.4);border-radius:16px;padding:40px;text-align:center;z-index:99999;color:#fff;">
            <div style="font-size:40px;margin-bottom:15px;">🔒</div>
            <h3 style="font-weight:800;margin-bottom:10px;">Acesso Negado</h3>
            <p style="color:var(--cadarn-cinza);font-size:13px;">Dossiês confidenciais são restritos a Sócios, RH e ao próprio colaborador.</p>
            <button onclick="this.closest('div').parentElement.remove()" style="margin-top:15px;padding:10px 20px;background:rgba(220,53,69,0.3);border:1px solid rgba(220,53,69,0.5);color:#fff;border-radius:8px;cursor:pointer;">Fechar</button>
        </div><div onclick="this.parentElement.remove()" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:99998;"></div>`;
        document.body.appendChild(msg);
        return;
    }

    let dossieData = {};
    try {
        const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js');
        const snap = await getDoc(firestore.doc(db, 'dossies', nomeColaborador.replace(/\s+/g, '_')));
        if (snap.exists()) dossieData = snap.data();
    } catch (e) { console.warn('Dossie não encontrado:', e); }

    const modalEl = document.createElement('div');
    modalEl.id = 'modal-dossie';
    modalEl.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:99999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
    modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };

    const canEdit = window.userRole === 'Sócio' || window.userRole === 'RH' || window.userRole === 'DEV';

    modalEl.innerHTML = `
        <div id="dossie-modal-box" style="background:rgba(10,10,15,0.99);border:1px solid rgba(255,193,7,0.2);border-radius:20px;padding:35px;width:90%;max-width:600px;max-height:85vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:25px;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:20px;">
                <div>
                    <div style="font-size:11px;color:#ffc107;text-transform:uppercase;font-weight:800;letter-spacing:2px;margin-bottom:8px;">🔒 Dossiê Confidencial</div>
                    <h2 style="font-size:24px;font-weight:800;color:#fff;">${sanitize(nomeColaborador)}</h2>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    ${canEdit ? `<button id="btn-master-dossie" onclick="window.gerenciarFluxoDossie('${sanitize(nomeColaborador)}')" style="background:rgba(131,46,255,0.15); border:1px solid rgba(131,46,255,0.3); color:#c5a3ff; padding: 8px 16px; border-radius:8px; cursor:pointer; font-size:12px; font-weight:700; transition:0.2s;">✏️ Editar Informações</button>` : ''}
                    <button onclick="document.getElementById('modal-dossie').remove()" class="sp-close" style="width:35px; height:35px; border-radius:50%;">✕</button>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:25px;">
                <div>
                    <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px;">📅 Data de Admissão</label>
                    <input type="date" id="dossie-admissao" class="dossie-field" value="${dossieData.admissao || ''}" readonly style="width:100%;background:rgba(255,255,255,0.02);border:1px solid transparent;color:#fff;padding:10px;border-radius:8px;font-size:14px;outline:none;transition:0.3s;">
                </div>
                <div>
                    <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px;">📋 Tipo de Contrato</label>
                    <select id="dossie-contrato" class="dossie-field" disabled style="width:100%;background:rgba(255,255,255,0.02);border:1px solid transparent;color:#fff;padding:10px;border-radius:8px;font-size:14px;outline:none;transition:0.3s;-webkit-appearance:none;">
                        <option value=""         ${!dossieData.tipoContrato                      ? 'selected' : ''}>Não definido</option>
                        <option value="CLT"      ${dossieData.tipoContrato === 'CLT'             ? 'selected' : ''}>CLT</option>
                        <option value="PJ"       ${dossieData.tipoContrato === 'PJ'              ? 'selected' : ''}>PJ</option>
                        <option value="Estagio"  ${dossieData.tipoContrato === 'Estagio'         ? 'selected' : ''}>Estágio</option>
                        <option value="Freelancer" ${dossieData.tipoContrato === 'Freelancer'    ? 'selected' : ''}>Freelancer</option>
                    </select>
                </div>
                <div>
                    <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px;">📅 Fim do Contrato</label>
                    <input type="date" id="dossie-fim-contrato" class="dossie-field" value="${dossieData.dataFimContrato || ''}" readonly style="width:100%;background:rgba(255,255,255,0.02);border:1px solid transparent;color:#fff;padding:10px;border-radius:8px;font-size:14px;outline:none;transition:0.3s;">
                </div>
            </div>

            <div style="margin-bottom:20px;">
                <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px;">📝 Observações de Saúde / Bem-estar</label>
                <textarea id="dossie-saude" class="dossie-field" readonly placeholder="Nenhuma observação registrada..." style="width:100%;background:rgba(255,255,255,0.02);border:1px solid transparent;color:#fff;padding:10px;border-radius:8px;font-size:14px;resize:none;min-height:80px;outline:none;transition:0.3s;">${dossieData.observacoesSaude || ''}</textarea>
            </div>

            <div style="margin-bottom:20px;">
                <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:6px;">🎓 Previsão de Formatura <span style="color:rgba(255,255,255,0.25);font-size:9px;font-weight:400;text-transform:none;">(estagiários)</span></label>
                <input type="date" id="dossie-formatura" class="dossie-field" value="${dossieData.dataFormatura || ''}" readonly style="width:100%;background:rgba(255,255,255,0.02);border:1px solid transparent;color:#fff;padding:10px;border-radius:8px;font-size:14px;outline:none;transition:0.3s;">
            </div>

            <div style="margin-bottom:25px;">
                <label style="font-size:10px;color:var(--cadarn-cinza);text-transform:uppercase;font-weight:700;display:block;margin-bottom:10px;">📎 Documentos Anexados</label>
                <div id="dossie-docs-list" style="margin-bottom:10px;">
                    ${(dossieData.documentos || []).map(d => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:12px;color:#c5a3ff;">📄 ${sanitize(d.nome)} <span style="color:var(--cadarn-cinza);font-size:10px;">${new Date(d.data).toLocaleDateString('pt-BR')}</span></div>`).join('')}
                    ${(dossieData.documentos || []).length === 0 ? '<p style="font-size:12px;color:var(--cadarn-cinza);">Nenhum documento anexado.</p>' : ''}
                </div>
                <div id="dossie-upload-area" style="display:none;">
                    <input type="file" id="dossie-file-upload" accept=".pdf,.doc,.docx,.jpg,.png" style="display:none" onchange="processarArquivoDossie(event, '${sanitize(nomeColaborador)}')">
                    <button onclick="document.getElementById('dossie-file-upload').click()" style="padding:8px 16px;background:rgba(131,46,255,0.15);border:1px dashed rgba(131,46,255,0.5);color:#c5a3ff;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;width:100%;">📎 Clicar para Anexar PDF / Exame</button>
                </div>
            </div>


            ${dossieData.atualizadoPor ? `<div id="dossie-timestamp" style="text-align:center;margin-top:15px;font-size:10px;color:rgba(255,255,255,0.2);">Última atualização por ${sanitize(dossieData.atualizadoPor)}</div>` : ''}
        </div>
    `;
    document.body.appendChild(modalEl);
}

async function processarArquivoDossie(event, nomeColaborador) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('Arquivo muito grande (máx 5MB).', 'danger'); return; }

    showToast(`Anexando "${file.name}"...`, 'info');
    const docMeta = { nome: file.name, data: Date.now(), tipo: file.type };

    try {
        const { getDoc } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js');
        const snap     = await getDoc(firestore.doc(db, 'dossies', nomeColaborador.replace(/\s+/g, '_')));
        const existing = snap.exists() ? snap.data() : {};
        const docs     = [...(existing.documentos || []), docMeta];
        await salvarDossie(nomeColaborador, { documentos: docs });

        const list = document.getElementById('dossie-docs-list');
        if (list) {
            list.innerHTML += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:6px;font-size:12px;color:#c5a3ff;">📄 ${sanitize(file.name)} <span style="color:var(--cadarn-cinza);font-size:10px;">Agora</span></div>`;
        }
    } catch (e) { showToast('Erro ao salvar documento.', 'danger'); }
}

// =====================================================
// CONTROLE DO MODAL DE PROJETOS
// =====================================================
function novoProjetoSocio() {
    if (!window.userPermissoes?.editarProjetos) { showToast('Você não tem permissão para criar projetos.', 'danger'); return; }
    isCriandoNovo      = true;
    projetoModalAberto = 'proj_' + Date.now();
    etapasTemporarias  = [{ titulo: 'Planejamento Inicial', responsavel: '', prazo: '', status: 'pendente', kickoff: '' }];

    const camposParaLimpar = ['modal-proj-nome', 'modal-proj-cliente', 'modal-desc', 'modal-tags', 'modal-equipe', 'modal-licoes', 'modal-valor-contrato', 'modal-horas-orcadas', 'modal-horas-reais'];
    camposParaLimpar.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    const elLider = document.getElementById('modal-lider');
    if (elLider) elLider.value = usuarioLogado;

    const elVisivel = document.getElementById('modal-proj-visivel');
    if (elVisivel) elVisivel.checked = false;

    renderTarefasModalTemporario();
    validarFormularioProjeto();

    const modal = document.getElementById('modal-projeto');
    if (modal) modal.classList.add('active');
}

function abrirModalProjeto(id) {
    isCriandoNovo      = false;
    projetoModalAberto = id;
    const proj = bdProjetos[id];
    if (!proj) { showToast('Projeto não encontrado.', 'danger'); return; }

    const setVal = (elementId, val) => { const el = document.getElementById(elementId); if (el) el.value = val; };
    setVal('modal-proj-nome',         proj.nome         || '');
    setVal('modal-proj-cliente',      proj.cliente      || '');
    setVal('modal-lider',             proj.lider        || '');
    setVal('modal-desc',              proj.descricao    || '');
    setVal('modal-tags',              (proj.tags         || []).join(', '));
    setVal('modal-equipe',            (proj.equipeAtual  || []).join(', '));
    setVal('modal-licoes',            proj.licoes       || '');
    setVal('modal-valor-contrato',    proj.valorContrato || '');
    setVal('modal-horas-orcadas',     proj.horasOrcadas  || '');
    setVal('modal-horas-reais',       proj.horasReais    || '');

    const elVisivel = document.getElementById('modal-proj-visivel');
    if (elVisivel) elVisivel.checked = proj.visivelHub === true;

    etapasTemporarias = proj.etapas ? JSON.parse(JSON.stringify(proj.etapas)) : [];

    renderTarefasModalTemporario();
    const modal = document.getElementById('modal-projeto');
    if (modal) modal.classList.add('active');

    setTimeout(validarFormularioProjeto, 100);
}

function fecharModalProjeto(e) {
    if (!e || e.target === document.getElementById('modal-projeto') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-projeto').classList.remove('active');
        projetoModalAberto = null;
        etapasTemporarias  = [];
    }
}

function renderTarefasModalTemporario() {
    let html = '';
    let optionsColabs = '<option value="">Responsável...</option>';
    listaColaboradores.forEach(nome => { optionsColabs += `<option value="${nome}">${nome}</option>`; });

    const inputStyle = "width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 12px; border-radius: 8px; font-size: 12px; outline: none; transition: 0.3s; font-family: 'Inter', sans-serif;";

    etapasTemporarias.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel || ''}"`, `value="${t.responsavel || ''}" selected`);

        html += `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 15px; overflow: hidden; transition: 0.3s;" onmouseover="this.style.borderColor='rgba(131, 46, 255, 0.4)'; this.style.boxShadow='0 5px 15px rgba(0,0,0,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.boxShadow='none'">
                <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr auto; gap: 10px; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.02); align-items: center;">
                    <input type="text" style="${inputStyle}" value="${sanitize(t.titulo || '')}" placeholder="Qual a entrega?" onchange="atualizarEtapaMemoria(${idx}, 'titulo', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'responsavel', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${optionsResps}</select>
                    <input type="date" style="${inputStyle}" value="${t.prazo || ''}" onchange="atualizarEtapaMemoria(${idx}, 'prazo', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'status', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                        <option value="pendente"  ${t.status === 'pendente'  ? 'selected' : ''}>Pendente</option>
                        <option value="ativo"     ${t.status === 'ativo'     ? 'selected' : ''}>Fazendo</option>
                        <option value="concluido" ${t.status === 'concluido' ? 'selected' : ''}>Concluída</option>
                    </select>
                    <button style="background: rgba(220,53,69,0.1); color: #ff8793; border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='rgba(220,53,69,0.2)'" onmouseout="this.style.background='rgba(220,53,69,0.1)'" onclick="removerEtapaMemoria(${idx})" title="Excluir Etapa">✕</button>
                </div>
                <div style="padding: 12px 15px; background: rgba(0,0,0,0.3);">
                    <textarea style="${inputStyle} min-height: 45px; resize: vertical;" placeholder="🔗 Kick-off: Cole links de pastas, documentos ou instruções..." onchange="atualizarEtapaMemoria(${idx}, 'kickoff', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${sanitize(t.kickoff || '')}</textarea>
                </div>
            </div>
        `;
    });

    if (etapasTemporarias.length === 0) {
        html = '<div style="color:var(--cadarn-cinza); font-size:13px; padding:20px; text-align:center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">Nenhuma tarefa estruturada neste projeto.</div>';
    }

    document.getElementById('lista-tarefas').innerHTML = html;
}

function adicionarNovaTarefaModal() {
    etapasTemporarias.push({ titulo: '', responsavel: '', prazo: '', status: 'pendente', kickoff: '' });
    renderTarefasModalTemporario();
}

function atualizarEtapaMemoria(idx, campo, valor) { if (etapasTemporarias[idx]) etapasTemporarias[idx][campo] = valor; }
function removerEtapaMemoria(idx) { etapasTemporarias.splice(idx, 1); renderTarefasModalTemporario(); }

// =====================================================
// VALIDAÇÃO DO FORMULÁRIO
// =====================================================
function validarFormularioProjeto() {
    const nome    = document.getElementById('modal-proj-nome')?.value?.trim();
    const cliente = document.getElementById('modal-proj-cliente')?.value?.trim();
    const desc    = document.getElementById('modal-desc')?.value?.trim();
    const lider   = document.getElementById('modal-lider')?.value?.trim();

    const btnRevisar = document.getElementById('btn-revisar-ia');
    const btnSalvar  = document.getElementById('btn-salvar-definitivo');

    const isValid = !!(nome && cliente && lider);

    if (btnSalvar) {
        btnSalvar.disabled       = !isValid;
        btnSalvar.style.opacity  = isValid ? '1' : '0.5';
        btnSalvar.style.cursor   = isValid ? 'pointer' : 'not-allowed';
    }
    if (btnRevisar) {
        btnRevisar.disabled      = !desc;
        btnRevisar.style.opacity = desc ? '1' : '0.5';
    }
    return isValid;
}

// =====================================================
// REVISÃO COM IA — GERAÇÃO DE TAGS
// =====================================================
async function revisarProjetoComIA() {
    const desc       = document.getElementById('modal-desc')?.value?.trim();
    const tags       = document.getElementById('modal-tags')?.value?.trim() || '';
    const categoria  = tags.split(',').pop().trim() || 'Consultoria';

    if (!desc) { showToast('Escreva uma descrição para gerar a nuvem de tags.', 'warning'); return; }

    const btnRevisar = document.getElementById('btn-revisar-ia');
    if (btnRevisar) { btnRevisar.disabled = true; btnRevisar.textContent = '🔄 Analisando...'; }

    const tagContainer = document.getElementById('tag-cloud-container');
    if (tagContainer) tagContainer.innerHTML = '<div style="text-align:center;padding:20px;color:var(--cadarn-cinza);font-size:12px;">🤖 IA extraindo palavras-chave...</div>';

    try {
        const prompt = `Analise o seguinte escopo de projeto e extraia 6 a 8 palavras-chave estratégicas que representam os principais temas, competências e entregas. Responda APENAS com um JSON no formato: {"tags": ["palavra1", "palavra2", ...]}. A última tag deve sempre ser a categoria mais ampla do projeto (ex: "Estratégia", "Financeiro", "TI", "RH", "Marketing"). Escopo: "${desc.substring(0, 800)}"`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model:      'claude-sonnet-4-20250514',
                max_tokens: 300,
                messages:   [{ role: 'user', content: prompt }]
            })
        });

        const data    = await response.json();
        let rawText   = (data.content || []).map(b => b.text || '').join('');
        const match   = rawText.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Formato inválido');

        const parsed      = JSON.parse(match[0]);
        let keywordTags   = parsed.tags || [];

        if (categoria && !keywordTags.includes(categoria)) {
            keywordTags = [...keywordTags.slice(0, -1), categoria];
        }

        renderTagCloud(keywordTags, tagContainer);

        const tagsInput = document.getElementById('modal-tags');
        if (tagsInput) tagsInput.value = keywordTags.join(', ');

        showToast('✨ Tags geradas pela IA com sucesso!', 'success');

    } catch (e) {
        console.error('Erro ao gerar tags:', e);
        const palavras = desc.toLowerCase()
            .replace(/[^a-záàãâéêíóôõúüç\s]/g, ' ')
            .split(/\s+/)
            .filter(p => p.length > 4)
            .slice(0, 6)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1));
        palavras.push(categoria);
        renderTagCloud(palavras, tagContainer);
        showToast('Tags extraídas localmente (IA indisponível).', 'info');
    } finally {
        if (btnRevisar) { btnRevisar.disabled = false; btnRevisar.textContent = '✨ Revisar com IA'; }
    }
}

function renderTagCloud(tags, container) {
    if (!container) return;
    const cores = ['#832EFF', '#c5a3ff', '#47e299', '#ffc107', '#ff8793', '#20c997', '#4cc9f0'];
    const sizes = [18, 16, 20, 15, 17, 14, 16, 20];

    let html = '<div style="display:flex;flex-wrap:wrap;gap:8px;padding:15px 0;justify-content:center;">';
    tags.forEach((tag, i) => {
        const isCategoria = i === tags.length - 1;
        const cor         = isCategoria ? '#FFC107' : cores[i % cores.length];
        const fsize       = isCategoria ? 20 : sizes[i % sizes.length];
        const weight      = isCategoria ? 900 : 600;
        const border      = isCategoria ? '2px solid rgba(255,193,7,0.5)' : `1px solid ${cor}33`;
        html += `<span style="font-size:${fsize}px;color:${cor};font-weight:${weight};border:${border};padding:5px 12px;border-radius:20px;background:${cor}11;transition:0.2s;cursor:default;" title="${isCategoria ? 'Categoria do Projeto' : 'Keyword'}">${sanitize(tag)}${isCategoria ? ' 🏷️' : ''}</span>`;
    });
    html += '</div>';
    html += '<div style="font-size:10px;color:var(--cadarn-cinza);text-align:center;margin-top:5px;">Clique em "Salvar" para aplicar estas tags ao projeto</div>';
    container.innerHTML = html;
}

// =====================================================
// SALVAR PROJETO
// =====================================================
async function salvarProjetoSocio() {
    if (!projetoModalAberto) return;
    if (!window.userPermissoes?.editarProjetos) { showToast('Você não tem permissão para editar projetos.', 'danger'); return; }

    const botaoSalvar    = document.getElementById('btn-salvar-definitivo');
    const textoOriginal  = botaoSalvar ? botaoSalvar.innerHTML : '';

    if (botaoSalvar) {
        botaoSalvar.disabled      = true;
        botaoSalvar.innerHTML     = '⏳ Salvando...';
        botaoSalvar.style.opacity = '0.7';
    }

    const restaurarBotao = () => {
        if (botaoSalvar) {
            botaoSalvar.disabled      = false;
            botaoSalvar.innerHTML     = textoOriginal;
            botaoSalvar.style.opacity = '1';
        }
    };

    const projData = {
        nome:          document.getElementById('modal-proj-nome')?.value?.trim()    || 'Projeto Estratégico',
        ultimaEdicao:  Date.now(),
        cliente:       document.getElementById('modal-proj-cliente')?.value?.trim() || 'Cliente Não Informado',
        lider:         document.getElementById('modal-lider')?.value?.trim()        || usuarioLogado,
        descricao:     document.getElementById('modal-desc')?.value                 || '',
        tags:          (document.getElementById('modal-tags')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
        equipeAtual:   (document.getElementById('modal-equipe')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
        licoes:        document.getElementById('modal-licoes')?.value               || '',
        visivelHub:    document.getElementById('modal-proj-visivel')?.checked       || false,
        etapas:        etapasTemporarias,
        arquivado:     false,
        valorContrato: Number(document.getElementById('modal-valor-contrato')?.value) || 0,
        horasOrcadas:  Number(document.getElementById('modal-horas-orcadas')?.value)  || 0,
        horasReais:    Number(document.getElementById('modal-horas-reais')?.value)    || 0
    };

    if (isCriandoNovo) {
        projData.status_crm    = 'negociacao';
        projData.dataCriacao   = Date.now();
        projData.dataConclusao = null;
        projData.equipeAntiga  = [];
    }

    try {
        await firestore.setDoc(firestore.doc(db, 'projetos', projetoModalAberto), projData, { merge: true });
        showToast('✅ Projeto salvo e sincronizado na nuvem!', 'success');
        fecharModalProjeto();
    } catch (e) {
        console.error('Erro ao salvar projeto:', e);
        showToast(`Erro ao salvar: ${e.message}`, 'danger');
        restaurarBotao();
    }
}

// =====================================================
// WORKLOAD
// =====================================================
function renderWorkload() {
    const workload = {};
    const hoje     = new Date(new Date().setHours(0, 0, 0, 0));

    listaColaboradores.forEach(nome => { workload[nome] = { ativas: 0, atrasadas: 0, concluidas: 0, tarefasRefs: [] }; });

    for (const [pId, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.status_crm === 'concluido') continue;

        (proj.etapas || []).forEach(t => {
            if (t.responsavel && workload[t.responsavel] !== undefined) {
                if (t.status === 'concluido') {
                    workload[t.responsavel].concluidas++;
                } else {
                    workload[t.responsavel].ativas++;
                    const isAtrasada = t.prazo && new Date(t.prazo) < hoje;
                    if (isAtrasada) workload[t.responsavel].atrasadas++;

                    const corBorda = isAtrasada ? '#ff8793' : '#832EFF';
                    const corFundo = isAtrasada ? 'rgba(220,53,69,0.05)' : 'rgba(255,255,255,0.02)';

                    workload[t.responsavel].tarefasRefs.push(`
                        <div style="background: ${corFundo}; border-left: 3px solid ${corBorda}; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; transition: 0.2s;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
                            <div style="color: ${isAtrasada ? '#ff8793' : '#fff'}; font-size: 12px; font-weight: 600; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sanitize(t.titulo) || 'Tarefa sem nome'}</div>
                            <div style="color: var(--cadarn-cinza); font-size: 10px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">📁 ${sanitize(proj.nome)} (${sanitize(proj.cliente)})</div>
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
        let statusClass = 'wl-status-ideal'; let statusText = 'Equilibrado';
        if (data.ativas <= 1)                              { statusClass = 'wl-status-ocioso';     statusText = 'Ocioso (Capacidade)'; }
        if (data.ativas >= 5 || data.atrasadas >= 2)       { statusClass = 'wl-status-sobrecarga'; statusText = 'Sobrecarga / Risco'; }

        html += `
            <div style="background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 25px; transition: 0.3s; display: flex; flex-direction: column; cursor: pointer;" onmouseover="this.style.borderColor='rgba(131,46,255,0.3)'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.boxShadow='none'" onclick="abrirModalColaborador('${sanitize(nome)}')">

                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px; margin-bottom: 15px;">
                    <div>
                        <div style="font-size:16px; font-weight:800; color:white; letter-spacing:-0.5px; margin-bottom: 5px;">👤 ${sanitize(nome)}</div>
                        <div class="wl-status-badge ${statusClass}" style="margin: 0;">${statusText}</div>
                    </div>
                    ${window.userRole === 'Sócio' ? `<button onclick="event.stopPropagation(); excluirColaborador('${sanitize(nome)}')" style="background:rgba(220,53,69,0.1);border:1px solid rgba(220,53,69,0.3);color:#ff8793;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:14px;transition:0.2s;flex-shrink:0;" onmouseover="this.style.background='rgba(220,53,69,0.25)'" onmouseout="this.style.background='rgba(220,53,69,0.1)'" title="Excluir Colaborador">🗑️</button>` : ''}
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: rgba(0,0,0,0.3); border-radius: 12px; padding: 15px; text-align: center; border: 1px solid rgba(255,255,255,0.02);">
                        <div style="font-size:10px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:700; letter-spacing: 0.5px; margin-bottom: 5px;">Ativas</div>
                        <div style="font-size:28px; font-weight:900; color:white; line-height: 1;">${data.ativas}</div>
                    </div>
                    <div style="background: ${data.atrasadas > 0 ? 'rgba(220,53,69,0.05)' : 'rgba(0,0,0,0.3)'}; border-radius: 12px; padding: 15px; text-align: center; border: 1px solid ${data.atrasadas > 0 ? 'rgba(220,53,69,0.2)' : 'rgba(255,255,255,0.02)'};">
                        <div style="font-size:10px; color:${data.atrasadas > 0 ? '#ff8793' : 'var(--cadarn-cinza)'}; text-transform:uppercase; font-weight:700; letter-spacing: 0.5px; margin-bottom: 5px;">Atrasadas</div>
                        <div style="font-size:28px; font-weight:900; color:${data.atrasadas > 0 ? '#ff8793' : 'white'}; line-height: 1;">${data.atrasadas}</div>
                    </div>
                </div>

                <div style="flex-grow: 1; display: flex; flex-direction: column;">
                    <div style="font-size:11px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:800; letter-spacing: 1px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                        <span>🎯 Foco (A Fazer)</span>
                        <div style="height: 1px; background: rgba(255,255,255,0.05); flex-grow: 1;"></div>
                    </div>
                    <div style="max-height: 250px; overflow-y: auto; padding-right: 5px; flex-grow: 1;">
                        ${data.tarefasRefs.length > 0 ? data.tarefasRefs.join('') : '<div style="background: rgba(255,255,255,0.01); border: 1px dashed rgba(255,255,255,0.05); padding: 20px; border-radius: 8px; text-align:center; color: var(--cadarn-cinza); font-size: 12px; font-style: italic;">Ocioso. Nenhuma entrega pendente.</div>'}
                    </div>
                </div>
            </div>
        `;
    });

    const barraHtml = `
        <div style="margin-bottom: 20px; display: flex; gap: 15px; align-items: center;">
            <div style="position: relative; flex-grow: 1;">
                <input
                    type="text"
                    id="workload-search"
                    placeholder="🔍  Buscar colaborador..."
                    value="${window._workloadBusca || ''}"
                    oninput="window._workloadBusca = this.value; renderWorkload();"
                    style="width:100%; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.08); color:white; padding:12px 16px; border-radius:12px; font-size:14px; font-family:'Inter',sans-serif; outline:none; transition:0.2s;"
                    onfocus="this.style.borderColor='#832EFF'"
                    onblur="this.style.borderColor='rgba(255,255,255,0.08)'"
                >
                ${termoBusca ? `<button onclick="window._workloadBusca=''; renderWorkload();" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--cadarn-cinza);cursor:pointer;font-size:16px;">✕</button>` : ''}
            </div>
            ${window.userPermissoes?.gerenciarEquipe ? `<button onclick="abrirModalColaborador('')" style="background: linear-gradient(135deg, var(--cadarn-roxo), #420a9a); border: 1px solid rgba(131,46,255,0.5); color: white; padding: 12px 24px; border-radius: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; box-shadow: 0 4px 15px rgba(131,46,255,0.3); transition: 0.3s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                👤+ Novo Colaborador
            </button>` : ''}
        </div>
    `;

    const wContainer = document.getElementById('workload-container');
    wContainer.innerHTML = barraHtml + (html || `
        <div style="padding:40px;text-align:center;color:var(--cadarn-cinza);">
            Nenhum colaborador encontrado para "<strong style="color:white;">${sanitize(termoBusca)}</strong>".
        </div>
    `);

    const searchEl = document.getElementById('workload-search');
    if (searchEl && document.activeElement?.id === 'workload-search') {
        const pos = searchEl.value.length;
        searchEl.focus();
        searchEl.setSelectionRange(pos, pos);
    }
}

// =====================================================
// CRONOGRAMA GANTT
// =====================================================
function renderCronograma(containerId, filterUser = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 10);
    startDate.setHours(0, 0, 0, 0);
    const totalDays = 60;
    const colWidth  = 40;

    let headersHtml = '';
    const diasSemana = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    for (let i = 0; i < totalDays; i++) {
        let d = new Date(startDate); d.setDate(d.getDate() + i);
        let isHoje = d.getTime() === new Date(new Date().setHours(0, 0, 0, 0)).getTime();
        headersHtml += `<div class="gantt-day-col ${isHoje ? 'hoje' : ''}"><div class="gantt-day-name">${diasSemana[d.getDay()]}</div><div class="gantt-day-num">${d.getDate()}</div></div>`;
    }

    let sidebarHtml  = `<div class="gantt-sidebar-header">Projetos e Entregas</div>`;
    let timelineHtml = `<div class="gantt-header-row" style="width: ${totalDays * colWidth}px;">${headersHtml}</div><div class="gantt-body" style="width: ${totalDays * colWidth}px;">`;
    let temProjetos  = false;

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (proj.arquivado) return;
        let etapasProj = proj.etapas || [];

        if (filterUser) {
            etapasProj = etapasProj.filter(e => e.responsavel === filterUser);
            if (etapasProj.length === 0 && proj.lider !== filterUser && !(proj.equipeAtual || []).includes(filterUser)) return;
        }

        temProjetos = true;
        sidebarHtml  += `<div class="gantt-sidebar-item gantt-sidebar-proj" onclick="abrirModalProjeto('${id}')">📁 ${sanitize(proj.nome)}</div>`;
        timelineHtml += `<div class="gantt-row" style="background: rgba(255,255,255,0.02);"></div>`;

        etapasProj.forEach(t => {
            if (!t.prazo) return;

            let deadline = new Date(t.prazo);
            deadline.setMinutes(deadline.getMinutes() + deadline.getTimezoneOffset());
            deadline.setHours(0, 0, 0, 0);
            let startTask = new Date(deadline);
            startTask.setDate(startTask.getDate() - 4);

            let startDiff = Math.floor((startTask - startDate) / (1000 * 60 * 60 * 24));
            let endDiff   = Math.floor((deadline - startDate) / (1000 * 60 * 60 * 24));

            if (endDiff < 0 || startDiff >= totalDays) return;

            startDiff = Math.max(0, startDiff);
            endDiff   = Math.min(totalDays - 1, endDiff);
            let widthPx = (endDiff - startDiff + 1) * colWidth;
            let leftPx  = startDiff * colWidth;

            let colorClass = 'gb-pendente';
            if (t.status === 'concluido') colorClass = 'gb-concluido';
            else if (t.status === 'ativo') colorClass = 'gb-ativo';
            else if (deadline < new Date(new Date().setHours(0, 0, 0, 0))) colorClass = 'gb-atrasado';

            const respNome   = t.responsavel ? t.responsavel.split(' ')[0] : 'S/ Dono';
            const respInicial = respNome.charAt(0).toUpperCase();

            sidebarHtml  += `<div class="gantt-sidebar-item" style="padding-left: 30px; color: var(--cadarn-cinza);" onclick="abrirModalProjeto('${id}')">↳ ${sanitize(t.titulo)}</div>`;
            timelineHtml += `<div class="gantt-row"><div class="gantt-bar-wrapper" style="left: ${leftPx}px; width: ${widthPx}px;"><div class="gantt-bar ${colorClass}" title="${sanitize(t.titulo)} — Responsável: ${sanitize(t.responsavel)}" onclick="abrirModalProjeto('${id}')"><div class="gantt-bar-avatar">${respInicial}</div>${sanitize(t.titulo)}</div></div></div>`;
        });
    });

    if (!temProjetos) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--cadarn-cinza);">Nenhuma entrega com prazo mapeada no filtro atual.</div>`;
        return;
    }
    timelineHtml += `</div>`;
    container.innerHTML = `<div class="gantt-wrapper"><div class="gantt-sidebar">${sidebarHtml}</div><div class="gantt-timeline-container">${timelineHtml}</div></div>`;
}

// =====================================================
// AUTOCOMPLETE MULTI-VALOR
// =====================================================
function setupAutocompleteMulti(inputElement, arr) {
    if (!inputElement) return;
    let currentFocus;

    inputElement.addEventListener('input', function () {
        closeAllLists();
        const val     = this.value;
        currentFocus  = -1;

        const segments       = val.split(',');
        const currentSegment = segments[segments.length - 1].trim().toLowerCase();
        if (!currentSegment) {
            closeAllLists();
            return;
        }

        const a = document.createElement('DIV');
        a.setAttribute('id',    this.id + 'autocomplete-list');
        a.setAttribute('class', 'autocomplete-items');
        this.parentNode.appendChild(a);

        for (let i = 0; i < arr.length; i++) {
            if (arr[i].toLowerCase().includes(currentSegment)) {
                const b          = document.createElement('DIV');
                const matchIndex = arr[i].toLowerCase().indexOf(currentSegment);
                b.innerHTML      = arr[i].substring(0, matchIndex) +
                    "<strong><span style='color: #c5a3ff;'>" + arr[i].substring(matchIndex, matchIndex + currentSegment.length) + "</span></strong>" +
                    arr[i].substring(matchIndex + currentSegment.length);
                b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";
                b.addEventListener('click', function () {
                    segments[segments.length - 1] = ' ' + this.getElementsByTagName('input')[0].value;
                    inputElement.value = segments.join(',').trim() + ', ';
                    closeAllLists();
                    inputElement.focus();
                });
                a.appendChild(b);
            }
        }
    });

    inputElement.addEventListener('keydown', function (e) {
        let x = document.getElementById(this.id + 'autocomplete-list');
        if (x) x = x.getElementsByTagName('div');
        if (e.keyCode === 40) { currentFocus++; addActive(x); }
        else if (e.keyCode === 38) { currentFocus--; addActive(x); }
        else if (e.keyCode === 13) { e.preventDefault(); if (currentFocus > -1 && x) x[currentFocus].click(); }
    });

    function addActive(x) {
        if (!x) return;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0)         currentFocus = x.length - 1;
        x[currentFocus].classList.add('autocomplete-active');
    }
    function removeActive(x) { for (let i = 0; i < x.length; i++) x[i].classList.remove('autocomplete-active'); }
    function closeAllLists(elmnt) {
        const x = document.getElementsByClassName('autocomplete-items');
        for (let i = 0; i < x.length; i++) { if (elmnt != x[i] && elmnt != inputElement) x[i].parentNode.removeChild(x[i]); }
    }
    document.addEventListener('click', (e) => closeAllLists(e.target));
}

// =====================================================
// CALENDÁRIO MENSAL
// =====================================================
function renderCalendario() {
    const calendarBody = document.getElementById('calendar-body');
    if (!calendarBody) return;

    const year  = dataAtualCalendario.getFullYear();
    const month = dataAtualCalendario.getMonth();

    const mesesStr = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const elTitulo = document.getElementById('cal-month-year');
    if (elTitulo) elTitulo.innerText = `${mesesStr[month]} ${year}`;

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

    let primeiroDia        = new Date(year, month, 1).getDay();
    let indexPrimeiroDia   = primeiroDia === 0 ? 6 : primeiroDia - 1;
    let diasNoMes          = new Date(year, month + 1, 0).getDate();
    let html               = '';
    const hojeStr          = new Date().toISOString().split('T')[0];
    const dataDeHoje       = new Date(new Date().setHours(0, 0, 0, 0));
    const diasMesAnterior  = new Date(year, month, 0).getDate();

    for (let i = indexPrimeiroDia - 1; i >= 0; i--) {
        html += `<div class="calendar-day other-month"><div class="calendar-date">${diasMesAnterior - i}</div></div>`;
    }

    for (let i = 1; i <= diasNoMes; i++) {
        const dataKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const isHoje  = dataKey === hojeStr ? 'today' : '';

        let tarefasHtml = '';
        if (tarefasPorData[dataKey]) {
            tarefasPorData[dataKey].forEach(t => {
                let statusClass = t.status;
                if (statusClass !== 'concluido' && new Date(t.prazo) < dataDeHoje) statusClass = 'atrasado';
                tarefasHtml += `<div class="cal-task ${statusClass}" onclick="abrirModalProjeto('${t.projId}')"><span>${sanitize(t.titulo)}</span></div>`;
            });
        }

        const projsNoDia = Object.entries(bdProjetos).filter(([id, proj]) => {
            if (proj.arquivado) return false;
            return (proj.etapas || []).some(t => t.prazo === dataKey);
        });
        const hasProjs      = projsNoDia.length > 0;
        const projDataAttr  = hasProjs ? `data-datekey="${dataKey}"` : '';
        const clickHandler  = hasProjs ? `onclick="abrirModalDiaCalendario('${dataKey}')"` : '';

        html += `<div class="calendar-day ${isHoje} ${hasProjs ? 'has-events' : ''}" ${projDataAttr} ${clickHandler}><div class="calendar-date">${i}${hasProjs ? `<span style="float:right; font-size:9px; background:rgba(131,46,255,0.3); color:#c5a3ff; padding:1px 5px; border-radius:10px; font-weight:700;">${projsNoDia.length}</span>` : ''}</div>${tarefasHtml}</div>`;
    }

    const diasFaltando = 42 - (indexPrimeiroDia + diasNoMes);
    for (let i = 1; i <= diasFaltando; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date">${i}</div></div>`;
    }
    calendarBody.innerHTML = html;
}

function abrirModalDiaCalendario(dataKey) {
    const [ano, mes, dia] = dataKey.split('-');
    const dataFormatada   = `${dia}/${mes}/${ano}`;

    let items = [];
    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        (proj.etapas || []).filter(t => t.prazo === dataKey).forEach(t => {
            items.push({ projId: id, projNome: proj.nome, projCliente: proj.cliente, tarefa: t });
        });
    }
    if (items.length === 0) return;

    const old = document.getElementById('modal-dia-calendario');
    if (old) old.remove();

    let tarefasHtml = items.map(item => {
        const statusCor   = item.tarefa.status === 'concluido' ? '#47e299' : (item.tarefa.status === 'ativo' ? '#b68aff' : '#ffc107');
        const statusLabel = item.tarefa.status === 'concluido' ? '✅ Concluído' : (item.tarefa.status === 'ativo' ? '🔵 Ativo' : '⏳ Pendente');
        return `
        <div style="padding:12px; background:rgba(255,255,255,0.03); border-radius:10px; border-left:3px solid ${statusCor}; cursor:pointer; transition:0.2s;" onclick="abrirModalProjeto('${item.projId}'); fecharModalDiaCalendario();" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                <strong style="font-size:13px; color:#fff;">${sanitize(item.tarefa.titulo)}</strong>
                <span style="font-size:10px; color:${statusCor}; font-weight:700;">${statusLabel}</span>
            </div>
            <div style="font-size:11px; color:var(--cadarn-cinza);">📁 ${sanitize(item.projNome)} · ${sanitize(item.projCliente)}</div>
            ${item.tarefa.responsavel ? `<div style="font-size:11px; color:var(--cadarn-cinza); margin-top:3px;">👤 ${sanitize(item.tarefa.responsavel)}</div>` : ''}
        </div>`;
    }).join('');

    const modal         = document.createElement('div');
    modal.id            = 'modal-dia-calendario';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); z-index:99999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(5px);';
    modal.onclick       = (e) => { if (e.target === modal) fecharModalDiaCalendario(); };
    modal.innerHTML = `
        <div style="background:rgba(15,15,20,0.98); border:1px solid rgba(255,255,255,0.1); border-radius:20px; padding:30px; width:90%; max-width:500px; max-height:80vh; overflow-y:auto;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <div>
                    <div style="font-size:11px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:700; letter-spacing:1px;">📅 Agenda do Dia</div>
                    <h3 style="font-size:22px; font-weight:800; color:#fff; margin-top:5px;">${dataFormatada}</h3>
                </div>
                <button onclick="fecharModalDiaCalendario()" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:#fff; width:35px; height:35px; border-radius:50%; cursor:pointer; font-size:16px;">✕</button>
            </div>
            <div style="font-size:11px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:12px;">${items.length} entrega${items.length > 1 ? 's' : ''} mapeada${items.length > 1 ? 's' : ''}</div>
            <div style="display:flex; flex-direction:column; gap:10px;">${tarefasHtml}</div>
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

// =====================================================
// BANNER DE ALERTAS DO DIA
// =====================================================
function verificarAlertasDoDia() {
    const hoje       = new Date().toISOString().split('T')[0];
    let vencendoHoje = [], atrasados = [];

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        (proj.etapas || []).forEach(t => {
            if (t.status === 'concluido' || !t.prazo) return;
            if (t.prazo === hoje) vencendoHoje.push({ proj: proj.nome, etapa: t.titulo, id });
            if (t.prazo < hoje)  atrasados.push({ proj: proj.nome, etapa: t.titulo, id });
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
    } else {
        const partes = [];
        if (atrasados.length > 0)    partes.push(`<strong>⚠️ ${atrasados.length} entrega${atrasados.length > 1 ? 's' : ''} atrasada${atrasados.length > 1 ? 's' : ''}</strong>`);
        if (vencendoHoje.length > 0) partes.push(`<strong>🔥 ${vencendoHoje.length} entrega${vencendoHoje.length > 1 ? 's' : ''} vence${vencendoHoje.length > 1 ? 'm' : ''} hoje</strong>`);

        const cor   = atrasados.length > 0 ? 'rgba(220,53,69,0.15)' : 'rgba(255,193,7,0.1)';
        const borda = atrasados.length > 0 ? 'rgba(220,53,69,0.4)'  : 'rgba(255,193,7,0.4)';

        banner.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding: 12px 40px; background:${cor}; border: 1px solid ${borda}; font-size: 13px; color: white; gap: 15px; margin: 15px 40px 0 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);`;
        banner.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                ${partes.join(' &nbsp;·&nbsp; ')}
                <span style="color:var(--cadarn-cinza); font-size:12px;">— verifique o Kanban e o Cronograma</span>
            </div>
            <button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;flex-shrink:0;">✕</button>
        `;
    }

    // ── Alerta de contratos vencendo (visível apenas para RH e Sócios) ──
    if (window.userRole === 'RH' || window.userRole === 'Sócio' || window.userPermissoes?.verDossie) {
        const hojeMs     = new Date().setHours(0, 0, 0, 0);
        const em30DaysMs = hojeMs + (30 * 24 * 60 * 60 * 1000);
        const vencendo   = [];

        for (const [nome, colab] of Object.entries(bdColabs)) {
            if (colab.dataFimContrato) {
                const fimMs = new Date(colab.dataFimContrato).setHours(0, 0, 0, 0);
                if (fimMs >= hojeMs && fimMs <= em30DaysMs) {
                    const dias = Math.round((fimMs - hojeMs) / (1000 * 60 * 60 * 24));
                    vencendo.push({ nome, dias });
                }
            }
        }

        let bannerContrato = document.getElementById('alerta-contrato-banner');
        if (!bannerContrato) {
            bannerContrato = document.createElement('div');
            bannerContrato.id = 'alerta-contrato-banner';
            const ref = document.getElementById('alerta-dia-banner');
            if (ref && ref.parentNode) ref.parentNode.insertBefore(bannerContrato, ref.nextSibling);
            else { const c = document.getElementById('conteudo-restrito'); if (c) c.prepend(bannerContrato); }
        }

        if (vencendo.length === 0) {
            bannerContrato.style.display = 'none';
        } else {
            const nomes = vencendo.map(v => `<strong style="color:white;">${sanitize(v.nome)}</strong> <span style="color:rgba(255,255,255,0.5);">(${v.dias}d)</span>`).join(', ');
            bannerContrato.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding: 12px 40px; background: rgba(255,152,0,0.1); border-bottom: 1px solid rgba(255,152,0,0.4); font-size: 13px; color: white; gap: 15px;';
            bannerContrato.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                    <strong>📋 ${vencendo.length} contrato${vencendo.length > 1 ? 's' : ''} vencendo em até 30 dias:</strong>
                    <span>${nomes}</span>
                </div>
                <button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;font-size:18px;flex-shrink:0;">✕</button>
            `;
        }
    }
}

// =====================================================
// IMPORTAÇÃO DE CSV
// =====================================================
async function importarDados(event, tipo) {
    const file = event.target.files[0];
    if (!file) return;

    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js');

    const reader    = new FileReader();
    reader.onload   = async (e) => {
        const text     = e.target.result;
        const textLimpo = text.replace(/^\uFEFF/, '');
        const rows     = textLimpo.split('\n');
        let processados = 0;

        for (let i = 1; i < rows.length; i++) {
            const rowData = rows[i].split(',');
            if (!rowData[0] || rowData[0].trim() === '') continue;

            const id = 'proj_import_' + Date.now() + i;

            let etapasBrutas    = rowData[5] ? rowData[5].split(';') : [];
            let etapasProcessadas = etapasBrutas.map(etapaStr => {
                const partes = etapaStr.split('|');
                return {
                    titulo:      partes[0]?.trim() || 'Nova Entrega',
                    responsavel: partes[1]?.trim() || rowData[2]?.trim() || '',
                    prazo:       partes[2]?.trim() || '',
                    status:      'pendente',
                    kickoff:     rowData[6]?.trim() || ''
                };
            });

            if (etapasProcessadas.length === 0) {
                etapasProcessadas.push({ titulo: 'Kick-off e Alinhamento', responsavel: rowData[2], prazo: '', status: 'pendente', kickoff: rowData[6]?.trim() || '' });
            }

            const novoProjeto = {
                nome:          rowData[0]?.trim(),
                cliente:       rowData[1]?.trim(),
                lider:         rowData[2]?.trim(),
                descricao:     rowData[3]?.trim(),
                tags:          rowData[4] ? rowData[4].split(';').map(s => s.trim()) : [],
                equipeAtual:   rowData[7] ? rowData[7].split(';').map(s => s.trim()) : [],
                licoes:        rowData[8]?.trim() || 'Ainda em andamento.',
                etapas:        etapasProcessadas,
                status_crm:    tipo === 'pipe' ? 'negociacao' : 'andamento',
                visivelHub:    true,
                arquivado:     false,
                dataCriacao:   Date.now(),
                valorContrato: Number(rowData[9])  || 0,
                horasOrcadas:  Number(rowData[10]) || 0,
                horasReais:    Number(rowData[11]) || 0
            };

            try {
                await setDoc(doc(db, 'projetos', id), novoProjeto);
                processados++;
            } catch (err) {
                console.error('Erro na linha ' + i, err);
            }
        }
        showToast(`✅ ${processados} projetos importados! Dashboard atualizado.`, 'success');
        event.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
}

// =====================================================
// EXPORTAÇÃO CSV
// =====================================================
function exportarProjetosCSV() {
    const linhas = [['Nome', 'Cliente', 'Líder', 'Status CRM', 'Visível no Hub', 'Etapas Totais', 'Etapas Concluídas', 'Atrasadas', 'Valor Contrato (R$)', 'Horas Orçadas', 'Horas Reais', 'Tags']];
    const hoje   = new Date(new Date().setHours(0, 0, 0, 0));

    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado) continue;
        const etapas    = proj.etapas || [];
        const concluidas = etapas.filter(e => e.status === 'concluido').length;
        const atrasadas  = etapas.filter(e => e.status !== 'concluido' && e.prazo && new Date(e.prazo) < hoje).length;
        const statusLabel = { negociacao: 'Negociação', andamento: 'Em Andamento', iniciado: 'Iniciado', concluido: 'Concluído' }[proj.status_crm] || proj.status_crm;
        linhas.push([proj.nome || '', proj.cliente || '', proj.lider || '', statusLabel, proj.visivelHub ? 'Sim' : 'Não', etapas.length, concluidas, atrasadas, proj.valorContrato || 0, proj.horasOrcadas || 0, proj.horasReais || 0, (proj.tags || []).join('; ')]);
    }

    const csvContent = linhas.map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href  = url;
    link.download = `cadarn-projetos-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`✅ ${linhas.length - 1} projeto(s) exportados!`, 'success');
}

// =====================================================
// RINGS DE CAPACIDADE DA EQUIPE
// ✅ MELHORIA: tooltip com nome completo + carga
// =====================================================
function renderTeamAvailability() {
    let workload = {};
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado) continue;
        const todasConcluidas = proj.etapas && proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
        if (todasConcluidas) continue;

        (proj.etapas || []).forEach(t => {
            if (t.responsavel && t.status !== 'concluido') {
                const nome = t.responsavel.split('(')[0].trim();
                if (nome) {
                    if (!workload[nome]) workload[nome] = { p: 0 };
                    workload[nome].p++;
                }
            }
        });
    }

    const MAX_PROJECTS = 5;
    const members = Object.keys(workload).map(nome => ({
        nome, p: workload[nome].p,
        pct: Math.min(Math.round((workload[nome].p / MAX_PROJECTS) * 100), 100)
    }));
    members.sort((a, b) => b.pct - a.pct);

    const container = document.getElementById('teamAvailabilityContainer');
    if (!container) return;

    if (members.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:12px;">Ninguém alocado no momento.</div>';
        return;
    }

    container.innerHTML = members.map(m => {
        let ringColor = '#47e299';
        if (m.pct >= 80) ringColor = '#ff8793';
        else if (m.pct >= 50) ringColor = '#ffc107';

        const inicial = m.nome.charAt(0).toUpperCase();
        // ✅ MELHORIA: tooltip com nome completo e número de tarefas
        const tooltip = `${m.nome} — ${m.p} tarefa${m.p !== 1 ? 's' : ''} ativa${m.p !== 1 ? 's' : ''} (${m.pct}% de carga)`;

        return `
            <div title="${sanitize(tooltip)}" style="display:flex; flex-direction:column; align-items:center; cursor:pointer; gap:8px; min-width: 65px; flex-shrink: 0; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" onclick="switchTab('pessoas')">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(${ringColor} ${m.pct}%, rgba(255,255,255,0.05) 0); display: flex; align-items: center; justify-content: center; box-shadow: 0 0 15px ${ringColor}40;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: var(--bg-card, #151515); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 16px;">
                        ${inicial}
                    </div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:11px; font-weight:600; color:white; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width: 65px;">${m.nome.split(' ')[0]}</div>
                    <div style="font-size:10px; color:${ringColor}; font-weight:700;">${m.pct}%</div>
                </div>
            </div>
        `;
    }).join('');
}

// =====================================================
// SAÚDE FINANCEIRA (TOP CARDS)
// =====================================================
function renderFinancialHealth() {
    let feeTotal = 0, margens = [], alertas = 0;

    Object.values(bdProjetos).forEach(proj => {
        if (proj.arquivado || proj.status_crm === 'concluido') return;
        feeTotal += (proj.valorContrato || 0);

        if (proj.valorContrato > 0) {
            const custoHoras = (proj.horasReais || 0) * 150;
            const margem     = (proj.valorContrato - custoHoras) / proj.valorContrato;
            margens.push(margem);
        }
        if (proj.horasOrcadas > 0 && proj.horasReais >= (proj.horasOrcadas * 0.9)) alertas++;
    });

    const margemMedia = margens.length > 0 ? (margens.reduce((a, b) => a + b) / margens.length) * 100 : 0;

    const elFee     = document.getElementById('fin-fee-total');
    const elMargem  = document.getElementById('fin-margem-media');
    const elAlertas = document.getElementById('fin-alertas-escopo');
    const barraEl   = document.getElementById('fin-margem-barra');

    if (elFee)     elFee.innerText     = `R$ ${feeTotal.toLocaleString('pt-BR')}`;
    if (elAlertas) elAlertas.innerText = `${alertas} Projeto${alertas !== 1 ? 's' : ''}`;

    if (barraEl) {
        const pct = Math.min(Math.max(margemMedia, 0), 100);
        const cor = margemMedia < 20 ? '#dc3545' : margemMedia < 40 ? '#ffc107' : '#47e299';
        barraEl.style.width      = pct + '%';
        barraEl.style.background = cor;
        barraEl.style.boxShadow  = `0 0 8px ${cor}60`;
    }

    if (elMargem) {
        elMargem.innerText     = `${margemMedia.toFixed(1)}%`;
        elMargem.style.color   = margemMedia < 20 ? '#dc3545' : margemMedia < 40 ? '#ffc107' : '#47e299';
    }

    const cardAlerta = document.getElementById('fin-card-alertas');
    if (alertas >= 2 && cardAlerta) {
        cardAlerta.style.borderColor = 'rgba(220,53,69,0.4)';
        cardAlerta.style.background  = 'rgba(220,53,69,0.05)';
    } else if (cardAlerta) {
        cardAlerta.style.borderColor = '';
        cardAlerta.style.background  = '';
    }
}

// =====================================================
// MODO REUNIÃO DE SÓCIOS
// =====================================================
let reuniaoSlides        = [];
let reuniaoCurrentSlide  = 0;

function abrirModoReuniao() {
    reuniaoSlides       = [];
    reuniaoCurrentSlide = 0;
    const hoje          = new Date(new Date().setHours(0, 0, 0, 0));

    let ativos = 0, negociacao = 0, concluidos = 0;
    let todasEntregas   = [];
    let projetosAndamento = [];

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (proj.arquivado) return;

        if      (proj.status_crm === 'negociacao') negociacao++;
        else if (proj.status_crm === 'andamento')  { ativos++; projetosAndamento.push({ id, ...proj }); }
        else if (proj.status_crm === 'concluido')  concluidos++;

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

    todasEntregas.sort((a, b) => a.prazo - b.prazo);
    const top3 = todasEntregas.slice(0, 3);

    reuniaoSlides.push({ type: 'overview', ativos, negociacao, concluidos, top3 });

    projetosAndamento.sort((a, b) => a.nome.localeCompare(b.nome));
    projetosAndamento.forEach(proj => {
        let proximaEntrega = null, isAtrasado = false;

        if (proj.etapas) {
            let pendentes = proj.etapas.filter(e => e.status !== 'concluido' && e.prazo).map(e => {
                let d = new Date(e.prazo);
                d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                return { ...e, dateObj: d };
            });
            pendentes.sort((a, b) => a.dateObj - b.dateObj);
            if (pendentes.length > 0) { proximaEntrega = pendentes[0]; if (proximaEntrega.dateObj < hoje) isAtrasado = true; }
        }

        reuniaoSlides.push({ type: 'project', nome: proj.nome, cliente: proj.cliente, lider: proj.lider, equipe: proj.equipeAtual || [], proximaEntrega, isAtrasado });
    });

    if (reuniaoSlides.length === 1 && ativos === 0) {
        showToast('Não há projetos ativos para apresentar.', 'warning');
        return;
    }

    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log('Erro de fullscreen:', err));

    document.getElementById('reuniao-modal').style.display = 'flex';
    renderReuniaoSlide();
    document.addEventListener('keydown', reuniaoKeyListener);
    document.addEventListener('fullscreenchange', checkFullscreenExit);
}

function fecharModoReuniao() {
    if (document.fullscreenElement) document.exitFullscreen();
    document.getElementById('reuniao-modal').style.display = 'none';
    document.removeEventListener('keydown', reuniaoKeyListener);
    document.removeEventListener('fullscreenchange', checkFullscreenExit);
}

function checkFullscreenExit() {
    if (!document.fullscreenElement) fecharModoReuniao();
}

function reuniaoNextSlide() { if (reuniaoCurrentSlide < reuniaoSlides.length - 1) { reuniaoCurrentSlide++; renderReuniaoSlide(); } }
function reuniaoPrevSlide() { if (reuniaoCurrentSlide > 0) { reuniaoCurrentSlide--; renderReuniaoSlide(); } }
function reuniaoKeyListener(e) {
    if (e.key === 'ArrowRight') reuniaoNextSlide();
    if (e.key === 'ArrowLeft')  reuniaoPrevSlide();
    if (e.key === 'Escape')     fecharModoReuniao();
}

function renderReuniaoSlide() {
    const slide   = reuniaoSlides[reuniaoCurrentSlide];
    const content = document.getElementById('reuniao-content');
    document.getElementById('reuniao-counter').innerText = `Slide ${reuniaoCurrentSlide + 1} de ${reuniaoSlides.length}`;

    if (slide.type === 'overview') {
        let top3Html = slide.top3.map(t => `
            <div style="background: rgba(255,255,255,0.03); padding: 20px 25px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid var(--cadarn-roxo); display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 22px;"><strong>${sanitize(t.projNome)}:</strong> ${sanitize(t.etapa)}</span>
                <span style="font-size: 20px; color: #ffc107; font-family: 'Outfit', sans-serif; font-weight: 700;">${t.prazo.toLocaleDateString('pt-BR')}</span>
            </div>
        `).join('');
        if (!top3Html) top3Html = '<div style="color: var(--cadarn-cinza); font-size: 18px;">Nenhuma entrega com prazo mapeada no portfólio.</div>';

        content.innerHTML = `
            <div style="width: 100%; max-width: 1200px; padding: 40px; border-radius: 24px; animation: slideUp 0.5s ease-out;">
                <h1 style="font-size: 54px; margin-bottom: 50px; color: white; font-weight: 900; letter-spacing: -1px;">Visão Geral do Portfólio</h1>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; margin-bottom: 60px;">
                    <div style="background: rgba(182, 138, 255, 0.1); border: 1px solid rgba(182, 138, 255, 0.3); padding: 50px; border-radius: 20px; text-align: center;">
                        <div style="font-size: 18px; color: #c5a3ff; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 10px;">Em Execução</div>
                        <div style="font-size: 90px; font-weight: 900; color: white;">${slide.ativos}</div>
                    </div>
                    <div style="background: rgba(255, 193, 7, 0.1); border: 1px solid rgba(255, 193, 7, 0.3); padding: 50px; border-radius: 20px; text-align: center;">
                        <div style="font-size: 18px; color: #ffc107; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 10px;">Negociação</div>
                        <div style="font-size: 90px; font-weight: 900; color: white;">${slide.negociacao}</div>
                    </div>
                    <div style="background: rgba(71, 226, 153, 0.1); border: 1px solid rgba(71, 226, 153, 0.3); padding: 50px; border-radius: 20px; text-align: center;">
                        <div style="font-size: 18px; color: #47e299; text-transform: uppercase; font-weight: 800; letter-spacing: 2px; margin-bottom: 10px;">Concluídos</div>
                        <div style="font-size: 90px; font-weight: 900; color: white;">${slide.concluidos}</div>
                    </div>
                </div>
                <h2 style="font-size: 20px; color: var(--cadarn-cinza); margin-bottom: 25px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800;">⚡ Próximas Entregas Críticas</h2>
                ${top3Html}
            </div>
        `;
    } else if (slide.type === 'project') {
        const borderClass  = slide.isAtrasado ? 'border: 2px solid rgba(220,53,69,0.4); box-shadow: 0 0 80px rgba(220,53,69,0.1);' : 'border: 1px solid rgba(255,255,255,0.08);';
        const statusBadge  = slide.isAtrasado
            ? '<span style="background: rgba(220,53,69,0.15); color: #ff8793; padding: 10px 20px; border-radius: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; border: 1px solid rgba(220,53,69,0.5); letter-spacing: 1px;">⚠️ Atrasado</span>'
            : '<span style="background: rgba(71,226,153,0.1); color: #47e299; padding: 10px 20px; border-radius: 8px; font-size: 16px; font-weight: 800; text-transform: uppercase; border: 1px solid rgba(71,226,153,0.3); letter-spacing: 1px;">✅ Em Dia</span>';

        let entregaHtml = '<div style="font-size: 24px; color: var(--cadarn-cinza);">Nenhuma entrega com prazo pendente.</div>';
        if (slide.proximaEntrega) {
            entregaHtml = `
                <div style="font-size: 14px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 1.5px; margin-bottom: 15px;">Próxima Entrega Crítica:</div>
                <div style="font-size: 38px; color: white; font-weight: 600; display: flex; align-items: center; gap: 20px;">
                    ${sanitize(slide.proximaEntrega.titulo)}
                    <span style="font-size: 32px; font-family: 'Outfit', sans-serif; font-weight: 700; color: ${slide.isAtrasado ? '#ff8793' : '#ffc107'};">[${slide.proximaEntrega.dateObj.toLocaleDateString('pt-BR')}]</span>
                </div>
                <div style="font-size: 20px; color: var(--cadarn-cinza); margin-top: 15px;">Dono da Entrega: <strong style="color: white;">${sanitize(slide.proximaEntrega.responsavel || 'Não atribuído')}</strong></div>
            `;
        }

        const equipeList = slide.equipe.length > 0 ? slide.equipe.join(' • ') : 'Ninguém alocado';
        content.innerHTML = `
            <div style="width: 100%; max-width: 1300px; padding: 80px; background: rgba(255,255,255,0.02); border-radius: 30px; ${borderClass} animation: slideUp 0.5s ease-out;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
                    <div style="font-size: 28px; color: #c5a3ff; text-transform: uppercase; font-weight: 800; letter-spacing: 3px;">${sanitize(slide.cliente)}</div>
                    ${statusBadge}
                </div>
                <h1 style="font-size: 72px; font-weight: 900; color: white; line-height: 1.1; margin-bottom: 50px; letter-spacing: -2px;">${sanitize(slide.nome)}</h1>
                <div style="display: grid; grid-template-columns: 1fr 2.5fr; gap: 50px; margin-bottom: 60px; border-top: 1px solid rgba(255,255,255,0.08); border-bottom: 1px solid rgba(255,255,255,0.08); padding: 40px 0;">
                    <div>
                        <div style="font-size: 14px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 1px; margin-bottom: 15px;">Líder do Projeto</div>
                        <div style="font-size: 28px; color: white; font-weight: 600;">👤 ${sanitize(slide.lider)}</div>
                    </div>
                    <div>
                        <div style="font-size: 14px; color: var(--cadarn-cinza); text-transform: uppercase; font-weight: 800; letter-spacing: 1px; margin-bottom: 15px;">Equipe Ativa</div>
                        <div style="font-size: 24px; color: var(--cadarn-cinza); line-height: 1.5;">${sanitize(equipeList)}</div>
                    </div>
                </div>
                ${entregaHtml}
            </div>
        `;
    }
}

// =====================================================
// LISTA DE DOSSIÊS
// =====================================================
function renderDossieList() {
    const container = document.getElementById('dossie-colab-list');
    if (!container) return;

    const canAccess = window.userPermissoes?.verDossie || window.userRole === 'Sócio' || window.userRole === 'RH' || window.userRole === 'DEV';

    if (!canAccess) {
        container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--cadarn-cinza);">
                <div style="font-size:40px; margin-bottom:15px;">🔒</div>
                <h3 style="font-weight:700; color:#fff; margin-bottom:10px;">Acesso Restrito</h3>
                <p style="font-size:13px;">Esta área é exclusiva para Sócios e RH.</p>
            </div>`;
        return;
    }

    let html = '';
    listaColaboradores.forEach(nome => {
        const conf      = bdColabs[nome] || {};
        const iniciais  = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const cargo     = conf.cargo || 'Colaborador(a)';

        html += `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px;cursor:pointer;transition:0.25s;"
             onmouseover="this.style.borderColor='rgba(255,193,7,0.3)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.4)'"
             onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'; this.style.transform=''; this.style.boxShadow=''"
             onclick="abrirDossieColaborador('${nome}')">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                <div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#832EFF,#420a9a);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:#fff;flex-shrink:0;">${iniciais}</div>
                <div>
                    <div style="font-weight:700;font-size:14px;color:#fff;">${sanitize(nome)}</div>
                    <div style="font-size:11px;color:var(--cadarn-cinza);">${sanitize(cargo)}</div>
                </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:11px;color:#ffc107;background:rgba(255,193,7,0.1);border:1px solid rgba(255,193,7,0.2);padding:4px 10px;border-radius:20px;font-weight:700;">🔒 Ver Dossiê</span>
                ${conf.atualizadoEm ? `<span style="font-size:10px;color:rgba(255,255,255,0.2);">${tempoRelativoSocio(conf.atualizadoEm)}</span>` : ''}
            </div>
        </div>`;
    });

    container.innerHTML = html || '<p style="color:var(--cadarn-cinza);">Nenhum colaborador cadastrado.</p>';
}

// =====================================================
// DEEP DIVE FINANCEIRO (CHARTS)
// =====================================================
let chartReceitaInstance = null;
let chartMargemInstance  = null;

function renderFinanceiroPremium() {
    let projetosFinanceiros = [], totalFee = 0, totalCusto = 0;

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (proj.arquivado || proj.status_crm === 'concluido') return;

        const fee        = proj.valorContrato || 0;
        const custoHoras = (proj.horasReais || 0) * 150;
        const margemPct  = fee > 0 ? ((fee - custoHoras) / fee) * 100 : 0;

        totalFee   += fee;
        totalCusto += custoHoras;
        projetosFinanceiros.push({ nome: proj.nome, cliente: proj.cliente, fee, custo: custoHoras, margem: margemPct, status: proj.status_crm });
    });

    projetosFinanceiros.sort((a, b) => b.fee - a.fee);

    const tbody = document.getElementById('financeiro-tabela-body');
    if (tbody) {
        if (projetosFinanceiros.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--cadarn-cinza);">Nenhum dado financeiro de projetos ativos.</td></tr>';
        } else {
            tbody.innerHTML = projetosFinanceiros.map(p => {
                const margemColor = p.margem >= 40 ? '#47e299' : (p.margem >= 20 ? '#ffc107' : '#ff8793');
                const statusMap   = { negociacao: '🤝 Negociação', andamento: '🚀 Delivery', iniciado: '🎯 Iniciado', concluido: '✅ Concluído' };
                return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); transition: 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                    <td style="padding: 15px 20px; color: white; font-weight: 600;">${sanitize(p.nome)}<br><span style="font-size:10px; color:var(--cadarn-cinza); font-weight:400;">${sanitize(p.cliente)}</span></td>
                   <td style="padding: 15px 20px; color: #FFC107; font-family: 'Outfit', sans-serif; font-weight: 700;">R$ ${p.fee.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td style="padding: 15px 20px; color: #ff8793; font-family: 'Outfit', sans-serif; font-weight: 600;">R$ ${p.custo.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                    <td style="padding: 15px 20px; color: ${margemColor}; font-weight: 700;">${p.margem.toFixed(1)}%</td>
                    <td style="padding: 15px 20px; font-size: 11px; color: var(--cadarn-cinza);">${statusMap[p.status] || p.status}</td>
                </tr>`;
            }).join('');
        }
    }

    const ctxReceita = document.getElementById('chart-receita-custo');
    if (ctxReceita) {
        if (chartReceitaInstance) chartReceitaInstance.destroy();
        const top5 = projetosFinanceiros.slice(0, 5);
        chartReceitaInstance = new Chart(ctxReceita, {
            type: 'bar',
            data: {
                labels: top5.map(p => p.nome.length > 15 ? p.nome.substring(0, 13) + '…' : p.nome),
                datasets: [
                    { label: 'Fee (Receita)', data: top5.map(p => p.fee),   backgroundColor: 'rgba(255, 193, 7, 0.8)', borderRadius: 6 },
                    { label: 'Custo Base',   data: top5.map(p => p.custo), backgroundColor: 'rgba(220, 53, 69, 0.8)',  borderRadius: 6 }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { ticks: { color: '#a1a1aa', callback: v => 'R$' + v.toLocaleString('pt-BR') }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { ticks: { color: '#a1a1aa', font: { size: 10 } }, grid: { display: false } }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    }

    const ctxMargem = document.getElementById('chart-margem-geral');
    if (ctxMargem) {
        if (chartMargemInstance) chartMargemInstance.destroy();
        let saudaveis = 0, atencao = 0, criticos = 0;
        projetosFinanceiros.forEach(p => {
            if (p.fee > 0) {
                if (p.margem >= 40) saudaveis++;
                else if (p.margem >= 20) atencao++;
                else criticos++;
            }
        });
        chartMargemInstance = new Chart(ctxMargem, {
            type: 'doughnut',
            data: {
                labels: ['+40% (Saudável)', '20–40% (Atenção)', '<20% (Crítico)'],
                datasets: [{ data: [saudaveis, atencao, criticos], backgroundColor: ['#47e299', '#ffc107', '#dc3545'], borderWidth: 0, hoverOffset: 4 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa', boxWidth: 10, font: { size: 10 } } } }
            }
        });
    }

    const insightBox = document.getElementById('financeiro-insight-texto');
    if (insightBox) {
        const margemGeral = totalFee > 0 ? ((totalFee - totalCusto) / totalFee) * 100 : 0;
        let texto = '';
        if (totalFee === 0) {
            texto = 'O portfólio não possui contratos com valores preenchidos. Preencha os valores nos projetos para gerar insights.';
        } else if (margemGeral < 25) {
            texto = `⚠️ **ALERTA DE RENTABILIDADE:** A margem média do portfólio está em apenas <span style="color:#ff8793;">${margemGeral.toFixed(1)}%</span>. Os custos de horas alocadas estão consumindo agressivamente os Fees. Ação recomendada: Revisar escopos dos top projetos.`;
        } else if (margemGeral < 45) {
            texto = `⚖️ **PORTFÓLIO ESTÁVEL:** A margem média está em <span style="color:#FFC107;">${margemGeral.toFixed(1)}%</span>. Volume bom, mas há espaço para otimização de tempo em projetos de delivery longo.`;
        } else {
            texto = `🚀 **PERFORMANCE EXCELENTE:** A margem média do portfólio está em impressionantes <span style="color:#47e299;">${margemGeral.toFixed(1)}%</span>. A relação esforço/hora versus precificação está altamente lucrativa.`;
        }
        insightBox.innerHTML = texto.replace(/\*\*(.*?)\*\*/g, '<strong style="color:white;">$1</strong>');
    }
}

// =====================================================
// EDIÇÃO DE DOSSIÊ — TOGGLE
// =====================================================
window.isDossieEditing = false;

async function gerenciarFluxoDossie(nome) {
    const btn = document.getElementById('btn-master-dossie');
    
    if (!window.isDossieEditing) {
        // 1. ENTRAR NO MODO DE EDIÇÃO
        window.isDossieEditing = true;
        
        // Transforma o botão em "Salvar" (Verde)
        btn.innerHTML = '💾 Salvar Alterações';
        btn.style.background = 'linear-gradient(135deg, #198754, #157347)';
        btn.style.color = '#fff';
        btn.style.borderColor = '#198754';
        
        // Libera os campos para o usuário digitar
        document.querySelectorAll('.dossie-field').forEach(f => {
            f.removeAttribute('readonly');
            f.removeAttribute('disabled');
            f.style.background = 'rgba(0,0,0,0.5)';
            f.style.border = '1px solid var(--cadarn-roxo)';
            if (f.tagName === 'TEXTAREA') f.style.resize = 'vertical';
        });
        document.getElementById('dossie-upload-area').style.display = 'block';
        document.getElementById('dossie-modal-box').style.borderColor = 'var(--cadarn-roxo)';

    } else {
        // 2. SALVAR OS DADOS E BLOQUEAR NOVAMENTE
        btn.innerHTML = '⏳ Salvando...';
        btn.disabled = true;

        // Captura o que o usuário digitou
        const dados = {
            admissao:         document.getElementById('dossie-admissao')?.value || '',
            tipoContrato:     document.getElementById('dossie-contrato')?.value || '',
            observacoesSaude: document.getElementById('dossie-saude')?.value    || '',
            dataFimContrato:  document.getElementById('dossie-fim-contrato')?.value || '',
            dataFormatura:    document.getElementById('dossie-formatura')?.value || ''
        };

        try {
            // Salva no banco de dados
            await salvarDossie(nome, dados);
            
            // Espelha dataFimContrato para os alertas do sistema
            if (dados.dataFimContrato) {
                await firestore.setDoc(firestore.doc(db, 'colaboradores', nome), { dataFimContrato: dados.dataFimContrato }, { merge: true });
            }

            showToast('Dossiê salvo com sucesso!', 'success');
            
            // Volta tudo ao estado bloqueado original
            window.isDossieEditing = false;
            btn.disabled = false;
            
            // Transforma o botão de volta para "Editar" (Roxo)
            btn.innerHTML = '✏️ Editar Informações';
            btn.style.background = 'rgba(131,46,255,0.15)';
            btn.style.color = '#c5a3ff';
            btn.style.borderColor = 'rgba(131,46,255,0.3)';

            document.querySelectorAll('.dossie-field').forEach(f => {
                f.setAttribute('readonly', 'true');
                f.setAttribute('disabled', 'true');
                f.style.background = 'rgba(255,255,255,0.02)';
                f.style.border = '1px solid transparent';
                if (f.tagName === 'TEXTAREA') f.style.resize = 'none';
            });
            document.getElementById('dossie-upload-area').style.display = 'none';
            document.getElementById('dossie-modal-box').style.borderColor = 'rgba(255,193,7,0.2)';

        } catch (e) {
            console.error(e);
            showToast('Erro ao salvar. Tente novamente.', 'danger');
            btn.disabled = false;
            btn.innerHTML = '💾 Tentar Salvar Novamente';
        }
    }
};

// =====================================================
// GESTÃO DE ACESSOS E COLABORADORES (IAM)
// =====================================================
window.excluirColaborador = async function (nome) {
    if (window.userRole !== 'Sócio') { showToast('Apenas Sócios podem excluir colaboradores.', 'danger'); return; }
    if (!confirm(`Deseja excluir permanentemente "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
        const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js');
        await deleteDoc(doc(db, 'colaboradores', nome));
        delete bdColabs[nome];
        const idx = listaColaboradores.indexOf(nome);
        if (idx > -1) listaColaboradores.splice(idx, 1);
        iniciarUI();
        renderWorkload();
        showToast(`"${nome}" removido com sucesso.`, 'success');
    } catch (e) {
        console.error('Erro ao excluir colaborador:', e);
        showToast('Erro ao excluir. Tente novamente.', 'danger');
    }
};
window.abrirModalColaborador = function (nome = '') {
    const isEdit = nome !== '';
    if (!isEdit && !window.userPermissoes?.gerenciarEquipe) { showToast('Você não tem permissão para cadastrar colaboradores.', 'danger'); return; }
    document.getElementById('modal-colab-titulo').innerText = isEdit ? 'Acessos: ' + nome : 'Novo Colaborador';

    const inputNome = document.getElementById('modal-colab-nome');
    inputNome.value    = isEdit ? nome : '';
    inputNome.disabled = isEdit;
    inputNome.style.color = isEdit ? 'var(--cadarn-cinza)' : 'white';

    let email = '', cargo = 'Estagiário', perms = {};
    if (isEdit && bdColabs[nome]) {
        email = bdColabs[nome].email || '';
        cargo = bdColabs[nome].cargo || 'Estagiário';
        perms = bdColabs[nome].permissoes || {};
    }

    document.getElementById('modal-colab-email').value      = email;
    document.getElementById('modal-colab-cargo').value      = cargo;
    document.getElementById('perm-fin').checked  = !!perms.verFinanceiro;
    document.getElementById('perm-dos').checked  = !!perms.verDossie;
    document.getElementById('perm-edit').checked = !!perms.editarProjetos;
    document.getElementById('perm-ger').checked  = !!perms.gerenciarEquipe;

    document.getElementById('modal-colaborador').classList.add('active');
};

window.fecharModalColaborador = function (e) {
    if (!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-colaborador').classList.remove('active');
    }
};

window.salvarColaborador = async function () {
    const btnSalvar = document.getElementById('btn-salvar-iam');
    const nome      = document.getElementById('modal-colab-nome').value.trim();
    const email     = document.getElementById('modal-colab-email').value.trim();
    const cargo     = document.getElementById('modal-colab-cargo').value;

    if (!nome || !email) { showToast('Nome e E-mail são obrigatórios!', 'warning'); return; }

    const textoOriginal  = btnSalvar.innerHTML;
    btnSalvar.innerHTML  = '⏳ SALVANDO...';
    btnSalvar.disabled   = true;
    btnSalvar.style.opacity = '0.7';

    const permissoes = {
        verFinanceiro:  document.getElementById('perm-fin').checked,
        verDossie:      document.getElementById('perm-dos').checked,
        editarProjetos: document.getElementById('perm-edit').checked,
        gerenciarEquipe: document.getElementById('perm-ger').checked
    };

    const dataPayload = { nome, email, cargo, permissoes, atualizadoEm: Date.now(), atualizadoPor: usuarioLogado };

    try {
        const { doc, setDoc } = firestore;
        await setDoc(doc(db, 'colaboradores', nome), dataPayload, { merge: true });
        showToast('Acessos salvos com sucesso!', 'success');
        window.fecharModalColaborador();

        if (!listaColaboradores.includes(nome)) {
            listaColaboradores.push(nome);
            listaColaboradores.sort();
            iniciarUI();
        }
    } catch (e) {
        console.error('Erro IAM:', e);
        showToast('Falha ao salvar acessos na nuvem.', 'danger');
    } finally {
        btnSalvar.innerHTML     = textoOriginal;
        btnSalvar.disabled      = false;
        btnSalvar.style.opacity = '1';
    }
};
// =====================================================
// GESTÃO DE PERFIS (RBAC HUB)
// =====================================================
window.abrirModalPerfis = function() {
    if (!window.userPermissoes?.gerenciarPerfis) { showToast('Acesso negado ao Hub de Perfis.', 'danger'); return; }
    document.getElementById('modal-gestao-perfis').classList.add('active');
    document.getElementById('perfil-editor-container').style.display = 'none';
    document.getElementById('perfil-empty-state').style.display = 'flex';
    
    // Alimentar Dropdown de Usuários para Vinculação
    const select = document.getElementById('hub-select-usuarios');
    select.innerHTML = '<option value="">Adicionar usuário a este perfil...</option>' + 
        listaColaboradores.map(nome => `<option value="${nome}">${nome}</option>`).join('');

    renderListaPerfisSidebar();
};

window.fecharModalPerfis = function(e) {
    if (!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('sp-close')) {
        document.getElementById('modal-gestao-perfis').classList.remove('active');
    }
};

window.renderListaPerfisSidebar = function() {
    const container = document.getElementById('lista-perfis-sidebar');
    let perfis = Object.keys(bdPerfis);
    
    // Garante que os perfis base sempre existam visualmente, mesmo que vazios no BD
    ['Sócio', 'DEV', 'RH', 'Analista', 'Estagiário'].forEach(p => { if(!perfis.includes(p)) perfis.push(p); });
    perfis = [...new Set(perfis)].sort(); // Remove duplicatas

    container.innerHTML = perfis.map(nomePerfil => {
        const qtdUsers = Object.values(bdColabs).filter(c => c.cargo === nomePerfil).length;
        const idAtivo = document.getElementById('perfil-id-atual')?.value;
        const isActive = idAtivo === nomePerfil;
        const bg = isActive ? 'rgba(131,46,255,0.2)' : 'transparent';
        const border = isActive ? 'border-left: 3px solid #832EFF;' : 'border-left: 3px solid transparent;';
        
        return `
        <div onclick="selecionarPerfilEdicao('${sanitize(nomePerfil)}')" style="padding: 12px 15px; margin-bottom: 5px; cursor: pointer; border-radius: 8px; background: ${bg}; ${border} transition: 0.2s;" onmouseover="this.style.background='rgba(131,46,255,0.1)'" onmouseout="this.style.background='${bg}'">
            <div style="color: white; font-weight: 700; font-size: 13px;">${sanitize(nomePerfil)}</div>
            <div style="color: var(--cadarn-cinza); font-size: 10px; margin-top: 3px;">👥 ${qtdUsers} usuário(s)</div>
        </div>`;
    }).join('');
};

window.criarNovoPerfil = function() {
    document.getElementById('perfil-empty-state').style.display = 'none';
    document.getElementById('perfil-editor-container').style.display = 'block';
    
    document.getElementById('perfil-id-atual').value = '';
    const inputNome = document.getElementById('perfil-nome-input');
    inputNome.value = '';
    inputNome.disabled = false; // Apenas novos perfis podem ser nomeados
    inputNome.focus();

    ['fin', 'dos', 'edit', 'ger', 'admin'].forEach(id => document.getElementById(`hub-perm-${id}`).checked = false);
    
    document.getElementById('hub-select-usuarios').innerHTML = '<option value="">Salve o perfil antes de vincular...</option>';
    document.getElementById('hub-lista-usuarios-vinculados').innerHTML = '<div style="color:var(--cadarn-cinza); font-size:11px;">Salve o perfil antes de vincular usuários.</div>';
};

window.selecionarPerfilEdicao = function(nomePerfil) {
    document.getElementById('perfil-empty-state').style.display = 'none';
    document.getElementById('perfil-editor-container').style.display = 'block';
    
    document.getElementById('perfil-id-atual').value = nomePerfil;
    
    const inputNome = document.getElementById('perfil-nome-input');
    inputNome.value = nomePerfil;
    // TRAVA DE SEGURANÇA: Impede renomear perfis existentes para evitar quebra de ID no banco NoSQL
    inputNome.disabled = true;

    const perm = bdPerfis[nomePerfil]?.permissoes || {};
    document.getElementById('hub-perm-fin').checked   = !!perm.verFinanceiro;
    document.getElementById('hub-perm-dos').checked   = !!perm.verDossie;
    document.getElementById('hub-perm-edit').checked  = !!perm.editarProjetos;
    document.getElementById('hub-perm-ger').checked   = !!perm.gerenciarEquipe;
    document.getElementById('hub-perm-admin').checked = !!perm.gerenciarPerfis;

    renderUsuariosDoPerfil(nomePerfil);
    renderListaPerfisSidebar();
};

window.renderUsuariosDoPerfil = function(nomePerfil) {
    const container = document.getElementById('hub-lista-usuarios-vinculados');
    const select = document.getElementById('hub-select-usuarios');
    
    const usuariosNoPerfil = Object.entries(bdColabs).filter(([nome, dados]) => dados.cargo === nomePerfil);
    const nomesNoPerfil = usuariosNoPerfil.map(([nome]) => nome);

    // Filtra o Select para ocultar quem já pertence ao perfil
    let optionsHtml = '<option value="">Adicionar usuário a este perfil...</option>';
    listaColaboradores.forEach(nome => {
        if (!nomesNoPerfil.includes(nome)) {
            optionsHtml += `<option value="${nome}">${nome}</option>`;
        }
    });
    select.innerHTML = optionsHtml;
    
    if(usuariosNoPerfil.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:11px;">Nenhum usuário vinculado a este perfil.</div>';
        return;
    }

    container.innerHTML = usuariosNoPerfil.map(([nome, dados]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
            <div style="font-size: 12px; color: white;">👤 ${sanitize(nome)}</div>
            <button onclick="removerUsuarioDoPerfil('${sanitize(nome)}')" style="background: rgba(220,53,69,0.1); border: none; color: #ff8793; width: 22px; height: 22px; border-radius: 4px; cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='rgba(220,53,69,0.3)'" onmouseout="this.style.background='rgba(220,53,69,0.1)'">✕</button>
        </div>
    `).join('');
};
window.salvarPerfilHub = async function() {
    const idAtual = document.getElementById('perfil-id-atual').value;
    const nomeNovo = document.getElementById('perfil-nome-input').value.trim();
    
    if (!nomeNovo) { showToast('Nome do perfil é obrigatório', 'warning'); return; }
    
    const perfilRef = idAtual || nomeNovo; // Se é novo, usa o nome digitado como ID

    const permissoes = {
        verFinanceiro:   document.getElementById('hub-perm-fin').checked,
        verDossie:       document.getElementById('hub-perm-dos').checked,
        editarProjetos:  document.getElementById('hub-perm-edit').checked,
        gerenciarEquipe: document.getElementById('hub-perm-ger').checked,
        gerenciarPerfis: document.getElementById('hub-perm-admin').checked
    };

    const btn = document.getElementById('btn-salvar-perfil');
    btn.innerHTML = '⏳ Salvando...'; btn.disabled = true;

    try {
        await firestore.setDoc(firestore.doc(db, 'perfis', perfilRef), { nome: nomeNovo, permissoes }, { merge: true });
        
        document.getElementById('perfil-id-atual').value = perfilRef;
        showToast('Perfil atualizado. Efeito propagado a todos os usuários.', 'success');
        renderListaPerfisSidebar();
    } catch(e) {
        console.error(e);
        showToast('Erro ao salvar Perfil.', 'danger');
    } finally {
        btn.innerHTML = '💾 Salvar Alterações Globais'; btn.disabled = false;
    }
};
window.vincularUsuarioAoPerfilAtual = async function() {
    const nomePerfil = document.getElementById('perfil-id-atual').value;
    const select = document.getElementById('hub-select-usuarios');
    const nomeUsuario = select.value;

    if (!nomePerfil) { showToast('Salve o perfil antes de vincular usuários.', 'warning'); return; }
    if (!nomeUsuario) return;

    try {
        await firestore.setDoc(firestore.doc(db, 'colaboradores', nomeUsuario), { cargo: nomePerfil }, { merge: true });
        
        // Atualiza cache local instantaneamente para a UI não falhar/piscar
        if (!bdColabs[nomeUsuario]) bdColabs[nomeUsuario] = {};
        bdColabs[nomeUsuario].cargo = nomePerfil;

        showToast(`Usuário vinculado a ${nomePerfil}`, 'success');
        renderUsuariosDoPerfil(nomePerfil);
        renderListaPerfisSidebar();
    } catch(e) { showToast('Erro ao vincular usuário.', 'danger'); }
};

window.vincularUsuarioAoPerfilAtual = async function() {
    const nomePerfil = document.getElementById('perfil-id-atual').value;
    const select = document.getElementById('hub-select-usuarios');
    const nomeUsuario = select.value;

    if (!nomePerfil) { showToast('Salve o perfil antes de vincular usuários.', 'warning'); return; }
    if (!nomeUsuario) return;

    try {
        // INCLUÍDO: Campos de auditoria para passar nas regras de segurança do Firestore
        const payload = { 
            cargo: nomePerfil,
            atualizadoEm: Date.now(),
            atualizadoPor: usuarioLogado
        };
        await firestore.setDoc(firestore.doc(db, 'colaboradores', nomeUsuario), payload, { merge: true });
        
        // Atualiza cache local
        if (!bdColabs[nomeUsuario]) bdColabs[nomeUsuario] = {};
        bdColabs[nomeUsuario].cargo = nomePerfil;

        showToast(`Usuário vinculado a ${nomePerfil}`, 'success');
        renderUsuariosDoPerfil(nomePerfil);
        renderListaPerfisSidebar();
    } catch(e) { 
        console.error(e);
        showToast('Erro de permissão ao vincular usuário no banco.', 'danger'); 
    }
};

window.removerUsuarioDoPerfil = async function(nomeUsuario) {
    const nomePerfil = document.getElementById('perfil-id-atual').value;
    
    // TRAVA DE SEGURANÇA: Impede o administrador de remover a si mesmo e travar o sistema
    if (nomeUsuario === usuarioLogado || nomeUsuario === usuarioLogado.split(' ')[0]) {
        showToast('Segurança: Você não pode remover seus próprios acessos.', 'danger');
        return;
    }

    try {
        // INCLUÍDO: Campos de auditoria para passar nas regras de segurança do Firestore
        const payload = { 
            cargo: 'Estagiário', // Remove do perfil atual e joga para o base
            atualizadoEm: Date.now(),
            atualizadoPor: usuarioLogado
        };
        await firestore.setDoc(firestore.doc(db, 'colaboradores', nomeUsuario), payload, { merge: true });
        
        // Atualiza cache local
        if (bdColabs[nomeUsuario]) bdColabs[nomeUsuario].cargo = 'Estagiário';
        
        renderUsuariosDoPerfil(nomePerfil);
        renderListaPerfisSidebar();
    } catch(e) { 
        console.error(e);
        showToast('Erro de permissão ao remover usuário.', 'danger'); 
    }
};
// =====================================================
// ✅ EXPOSIÇÃO GLOBAL CONSOLIDADA (sem duplicatas)
// =====================================================
window.switchTab             = switchTab;
window.aplicarFiltros        = aplicarFiltros;
window.abrirModalProjeto     = abrirModalProjeto;
window.fecharModalProjeto    = fecharModalProjeto;
window.novoProjetoSocio      = novoProjetoSocio;
window.salvarProjetoSocio    = salvarProjetoSocio;
window.adicionarNovaTarefaModal = adicionarNovaTarefaModal;
window.atualizarEtapaMemoria = atualizarEtapaMemoria;
window.removerEtapaMemoria   = removerEtapaMemoria;
window.mudarMes              = mudarMes;
window.irParaHoje            = irParaHoje;
window.renderCalendario      = renderCalendario;
window.renderCronograma      = renderCronograma;
window.validarFormularioProjeto  = validarFormularioProjeto;
window.revisarProjetoComIA       = revisarProjetoComIA;
window.atualizarContadoresKanban = atualizarContadoresKanban;
window.renderDossieList          = renderDossieList;
window.gerenciarFluxoDossie      = gerenciarFluxoDossie;
window.abrirModoReuniao          = abrirModoReuniao;
window.fecharModoReuniao         = fecharModoReuniao;
window.reuniaoNextSlide          = reuniaoNextSlide;
window.reuniaoPrevSlide          = reuniaoPrevSlide;
window.renderFinanceiroPremium   = renderFinanceiroPremium;
window.exportarProjetosCSV       = exportarProjetosCSV;
window.importarDados             = importarDados;
window.abrirDossieColaborador    = abrirDossieColaborador;
window.processarArquivoDossie    = processarArquivoDossie;
window.abrirModalDiaCalendario   = abrirModalDiaCalendario;
window.fecharModalDiaCalendario  = fecharModalDiaCalendario;
window.verificarAlertasDoDia     = verificarAlertasDoDia;
window.abrirModalPerfis = abrirModalPerfis;
window.fecharModalPerfis = fecharModalPerfis;
window.criarNovoPerfil = criarNovoPerfil;
window.selecionarPerfilEdicao = selecionarPerfilEdicao;
window.salvarPerfilHub = salvarPerfilHub;
window.vincularUsuarioAoPerfilAtual = vincularUsuarioAoPerfilAtual;
window.removerUsuarioDoPerfil = removerUsuarioDoPerfil;

// =====================================================
// INIT
// =====================================================
initSegurancaSocios();
