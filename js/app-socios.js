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
    // Monitora a coleção de projetos no Firebase
    firestore.onSnapshot(firestore.collection(db, "projetos"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === "removed") delete bdProjetos[id];
            else bdProjetos[id] = change.doc.data();
        });

        // Atualiza todos os componentes visuais do sócio em tempo real
        renderKanban(); 
        renderWorkload();
        renderCronograma('gantt-master-container', filtroResponsavel);
        renderCalendario();
        renderCalendario(); 
        renderTeamAvailability();
        renderFinancialHealth();
    });
    inicializarDragAndDrop();
}

function switchTab(tab) {
    const views = ['projetos', 'pessoas', 'cronograma', 'calendario'];
    
    // 1. Esconde todas as telas
    views.forEach(v => {
        const el = document.getElementById(`view-${v}`);
        if(el) {
            el.style.opacity = '0';
            el.style.display = 'none';
        }
        const btn = document.getElementById(`tab-btn-${v}`);
        if(btn) btn.classList.remove('active');
    });

    // 2. Mostra a tela selecionada
    const targetView = document.getElementById(`view-${tab}`);
    const targetBtn = document.getElementById(`tab-btn-${tab}`);
    
    if(targetView) {
        // CORREÇÃO: Respeitar a grade (Grid) do Pipeline
        if (tab === 'projetos') {
            targetView.style.display = 'grid';
        } else {
            targetView.style.display = 'block';
        }
        
        if(targetBtn) targetBtn.classList.add('active');
        
        setTimeout(() => {
            targetView.style.opacity = '1';
            if(tab === 'cronograma') renderCronograma('gantt-master-container', filtroResponsavel);
            if(tab === 'calendario') renderCalendario();
        }, 50);
    }
}

function aplicarFiltros() {
    filtroResponsavel = document.getElementById('filtro-responsavel').value;
    renderKanban(); 
    renderWorkload(); 
    renderCronograma('gantt-master-container', filtroResponsavel);
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
// KANBAN RENDER
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

        // Cria o selo dourado se o projeto tiver valor de contrato
        const contractBadge = proj.valorContrato > 0 ? `<div class="badge-contract" style="background: linear-gradient(135deg, #FFC107, #FF9800); color: #000; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 900; display: inline-block;">R$ ${proj.valorContrato.toLocaleString('pt-BR')}</div>` : '';

        const card = `
            <div class="kanban-card" style="${borderStyle} padding: 18px;" data-id="${id}" onclick="abrirModalProjeto('${id}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px;">
                    <div class="kanban-card-title">${sanitize(proj.nome || 'Sem Nome')}</div>
                    ${atrasoBadge}
                </div>
                <div style="font-size: 12px; color: var(--cadarn-cinza); margin-bottom: 10px; font-weight: 500;">${sanitize(proj.cliente || 'Sem Cliente')}</div>
                <div style="display:flex; gap: 5px; flex-wrap: wrap; margin-bottom: 15px; align-items: center;">
                    ${tagsHtml}
                    ${contractBadge}
                </div>
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
// CONTROLE DO MODAL DE PROJETOS
// ==========================================
function novoProjetoSocio() {
    isCriandoNovo = true;
    projetoModalAberto = 'proj_' + Date.now();
    etapasTemporarias = [{ titulo: 'Planejamento Inicial', responsavel: '', prazo: '', status: 'pendente', kickoff: '' }];
    
    const camposParaLimpar = ['modal-proj-nome', 'modal-proj-cliente', 'modal-desc', 'modal-tags', 'modal-equipe', 'modal-licoes', 'modal-valor-contrato', 'modal-horas-orcadas', 'modal-horas-reais'];
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
    setVal('modal-valor-contrato', proj.valorContrato || '');
    setVal('modal-horas-orcadas', proj.horasOrcadas || '');
    setVal('modal-horas-reais', proj.horasReais || '');

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

    // Estilo mestre padronizado para os inputs do modal
    const inputStyle = "width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); color: #fff; padding: 10px 12px; border-radius: 8px; font-size: 12px; outline: none; transition: 0.3s; font-family: 'Inter', sans-serif;";
    
    etapasTemporarias.forEach((t, idx) => {
        let optionsResps = optionsColabs.replace(`value="${t.responsavel || ''}"`, `value="${t.responsavel || ''}" selected`);
        
        html += `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; margin-bottom: 15px; overflow: hidden; transition: 0.3s;" onmouseover="this.style.borderColor='rgba(131, 46, 255, 0.4)'; this.style.boxShadow='0 5px 15px rgba(0,0,0,0.3)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.boxShadow='none'">
                
                <div style="display: grid; grid-template-columns: 2fr 1.5fr 1fr 1fr auto; gap: 10px; padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.02); align-items: center;">
                    <input type="text" style="${inputStyle}" value="${t.titulo || ''}" placeholder="Qual a entrega?" onchange="atualizarEtapaMemoria(${idx}, 'titulo', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'responsavel', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${optionsResps}</select>
                    
                    <input type="date" style="${inputStyle}" value="${t.prazo || ''}" onchange="atualizarEtapaMemoria(${idx}, 'prazo', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                    
                    <select style="${inputStyle}" onchange="atualizarEtapaMemoria(${idx}, 'status', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">
                        <option value="pendente" ${t.status === 'pendente'?'selected':''}>Pendente</option>
                        <option value="ativo" ${t.status === 'ativo'?'selected':''}>Fazendo</option>
                        <option value="concluido" ${t.status === 'concluido'?'selected':''}>Concluída</option>
                    </select>
                    
                    <button style="background: rgba(220,53,69,0.1); color: #ff8793; border: 1px solid rgba(220,53,69,0.2); padding: 10px; border-radius: 8px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center;" onmouseover="this.style.background='rgba(220,53,69,0.2)'" onmouseout="this.style.background='rgba(220,53,69,0.1)'" onclick="removerEtapaMemoria(${idx})" title="Excluir Etapa">✕</button>
                </div>

                <div style="padding: 12px 15px; background: rgba(0,0,0,0.3);">
                    <textarea style="${inputStyle} min-height: 45px; resize: vertical;" placeholder="🔗 Kick-off: Cole links de pastas, documentos ou instruções..." onchange="atualizarEtapaMemoria(${idx}, 'kickoff', this.value)" onfocus="this.style.borderColor='#832EFF'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'">${t.kickoff || ''}</textarea>
                </div>
            </div>
        `;
    });

    if(etapasTemporarias.length === 0) html = '<div style="color:var(--cadarn-cinza); font-size:13px; padding:20px; text-align:center; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.1);">Nenhuma tarefa estruturada neste projeto.</div>';
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
        arquivado: false,
        valorContrato: Number(document.getElementById('modal-valor-contrato')?.value) || 0,
        horasOrcadas: Number(document.getElementById('modal-horas-orcadas')?.value) || 0,
        horasReais: Number(document.getElementById('modal-horas-reais')?.value) || 0
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
        console.error("Erro ao salvar projeto:", e);
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
                if (t.status === 'concluido') { workload[t.responsavel].concluidas++; } 
                else {
                    workload[t.responsavel].ativas++;
                    let isAtrasada = t.prazo && new Date(t.prazo) < hoje;
                    if(isAtrasada) workload[t.responsavel].atrasadas++;
                    
                    let corBorda = isAtrasada ? '#ff8793' : '#832EFF';
                    let corFundo = isAtrasada ? 'rgba(220,53,69,0.05)' : 'rgba(255,255,255,0.02)';
                    
                    // Estrutura do Mini-card da tarefa
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

    let html = '';
    Object.keys(workload).sort().forEach(nome => {
        if (filtroResponsavel && nome !== filtroResponsavel) return;

        const data = workload[nome];
        let statusClass = 'wl-status-ideal'; let statusText = 'Equilibrado';
        if (data.ativas <= 1) { statusClass = 'wl-status-ocioso'; statusText = 'Ocioso (Capacidade)'; }
        if (data.ativas >= 5 || data.atrasadas >= 2) { statusClass = 'wl-status-sobrecarga'; statusText = 'Sobrecarga / Risco'; }

        html += `
            <div style="background: rgba(255,255,255,0.015); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 25px; transition: 0.3s; display: flex; flex-direction: column;" onmouseover="this.style.borderColor='rgba(131,46,255,0.3)'; this.style.boxShadow='0 10px 30px rgba(0,0,0,0.5)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.05)'; this.style.boxShadow='none'">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 15px; margin-bottom: 15px;">
                    <div>
                        <div style="font-size:16px; font-weight:800; color:white; letter-spacing:-0.5px; margin-bottom: 5px;">👤 ${sanitize(nome)}</div>
                        <div class="wl-status-badge ${statusClass}" style="margin: 0;">${statusText}</div>
                    </div>
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
    document.getElementById('workload-container').innerHTML = html;
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
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--cadarn-cinza);">Nenhuma entrega com prazo mapeada no filtro atual.</div>`;
        return;
    }
    timelineHtml += `</div>`;
    container.innerHTML = `<div class="gantt-wrapper"><div class="gantt-sidebar">${sidebarHtml}</div><div class="gantt-timeline-container">${timelineHtml}</div></div>`;
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

    // Usando a variável global original
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
                    <div class="cal-task ${statusClass}" onclick="abrirModalProjeto('${t.projId}')">
                        <span>${sanitize(t.titulo)}</span>
                    </div>
                `;
            });
        }
        html += `<div class="calendar-day ${isHoje}"><div class="calendar-date">${i}</div>${tarefasHtml}</div>`;
    }

    const diasFaltando = 42 - (indexPrimeiroDia + diasNoMes);
    for (let i = 1; i <= diasFaltando; i++) {
        html += `<div class="calendar-day other-month"><div class="calendar-date">${i}</div></div>`;
    }
    calendarBody.innerHTML = html;
}

// Funções definitivas de navegação do calendário
function mudarMes(delta) {
    dataAtualCalendario.setMonth(dataAtualCalendario.getMonth() + delta);
    renderCalendario();
}

function irParaHoje() {
    dataAtualCalendario = new Date();
    renderCalendario();
}

initSegurancaSocios();

// =========================================================
// EXPOSIÇÃO GLOBAL
// =========================================================
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
window.renderCalendario = renderCalendario;
window.renderCronograma = renderCronograma;
// =========================================================
// MOTOR DE IMPORTAÇÃO DE PLANILHAS (CSV)
// =========================================================
async function importarDados(event, tipo) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split('\n');
        
        let processados = 0;
        
        for (let i = 1; i < rows.length; i++) {
            const rowData = rows[i].split(',');
            if(!rowData[0] || rowData[0].trim() === "") continue;
            
            const id = 'proj_import_' + Date.now() + i;
            
            // Fatiador Inteligente de Tarefas
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

            // Se a planilha não tiver tarefas, injeta uma padrão
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
                licoes: rowData[8]?.trim() || "Ainda em andamento.", // Nova coluna Mapeada!
                etapas: etapasProcessadas,
                status_crm: tipo === 'pipe' ? 'negociacao' : 'andamento',
                visivelHub: true, // Já vem visível para você ver os Gantts da equipe
                arquivado: false,
                dataCriacao: Date.now()
            };

            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                await setDoc(doc(db, "projetos", id), novoProjeto);
                processados++;
            } catch (err) {
                console.error("Erro na linha " + i, err);
            }
        }
        showToast(`✅ ${processados} projetos importados! O Dashboard foi atualizado.`, 'success');
        event.target.value = ''; // Limpa o input
    };
    // Força a leitura em UTF-8 para manter os acentos brasileiros intactos
    reader.readAsText(file, 'UTF-8');
}
window.importarDados = importarDados;

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
    
    const MAX_PROJECTS = 5; // Limite que define os 100% (ajuste como quiser)
    const members = Object.keys(workload).map(nome => {
        return { nome, p: workload[nome].p, pct: Math.min(Math.round((workload[nome].p / MAX_PROJECTS) * 100), 100) };
    });
    
    members.sort((a, b) => b.pct - a.pct);

    const container = document.getElementById('teamAvailabilityContainer');
    if (!container) return; // Se a div não existir, ele não faz nada

    if (members.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:12px;">Ninguém alocado no momento.</div>';
        return;
    }
    
    container.innerHTML = members.map(m => {
        let ringColor = '#47e299'; // Verde
        if (m.pct >= 80) ringColor = '#ff8793'; // Vermelho
        else if (m.pct >= 50) ringColor = '#ffc107'; // Amarelo

        // Pegamos a primeira letra do nome
        const inicial = m.nome.charAt(0).toUpperCase();

        return `
            <div style="display:flex; flex-direction:column; align-items:center; cursor:pointer; gap:8px; min-width: 65px; flex-shrink: 0; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
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
// ==========================================
// PAINEL DE SAÚDE FINANCEIRA DO PORTFÓLIO
// ==========================================
function renderFinancialHealth() {
    let feeTotal = 0;
    let margens = [];
    let alertas = 0;

    Object.values(bdProjetos).forEach(proj => {
        if (proj.arquivado || proj.status_crm === 'concluido') return; // Ignora lixeira e projetos concluídos para o fee ativo

        // Soma o valor do contrato
        feeTotal += (proj.valorContrato || 0);

        // Calcula a margem: (Valor Contrato - (Horas Reais * R$150)) / Valor Contrato
        if (proj.valorContrato > 0) {
            const custoHoras = (proj.horasReais || 0) * 150; 
            const margem = (proj.valorContrato - custoHoras) / proj.valorContrato;
            margens.push(margem);
        }

        // Conta quantos projetos já comeram mais de 90% das horas orçadas
        if (proj.horasOrcadas > 0 && proj.horasReais >= (proj.horasOrcadas * 0.9)) {
            alertas++;
        }
    });

    // Calcula a média das margens
    const margemMedia = margens.length > 0 ? (margens.reduce((a, b) => a + b) / margens.length) * 100 : 0;

    const elFee = document.getElementById('fin-fee-total');
    const elMargem = document.getElementById('fin-margem-media');
    const elAlertas = document.getElementById('fin-alertas-escopo');

    if (elFee) elFee.innerText = `R$ ${feeTotal.toLocaleString('pt-BR')}`;
    if (elAlertas) elAlertas.innerText = `${alertas} Projetos`;
    
    if (elMargem) {
        elMargem.innerText = `${margemMedia.toFixed(1)}%`;
        // Margem menor que 20% fica vermelha, caso contrário, verde
        elMargem.style.color = margemMedia < 20 ? '#dc3545' : '#47e299';
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

        // Coleta as entregas para o "Top 3 Crítico" do Slide 0
        if (proj.status_crm === 'andamento' && proj.etapas) {
            proj.etapas.forEach(e => {
                if (e.status !== 'concluido' && e.prazo) {
                    let d = new Date(e.prazo);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); // Ajuste de fuso
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
    // Ordena os projetos alfabeticamente para a apresentação
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
        showToast("Não há projetos ativos para apresentar.", "warning");
        return;
    }

    // 4. Trigger do Fullscreen e Renderização
    const elem = document.documentElement;
    if (elem.requestFullscreen) elem.requestFullscreen().catch(err => console.log("Erro de fullscreen:", err));

    document.getElementById('reuniao-modal').style.display = 'flex';
    renderReuniaoSlide();

    // Liga os controles de teclado
    document.addEventListener('keydown', reuniaoKeyListener);
    document.addEventListener('fullscreenchange', checkFullscreenExit);
}

function fecharModoReuniao() {
    if (document.fullscreenElement) { document.exitFullscreen(); }
    document.getElementById('reuniao-modal').style.display = 'none';
    document.removeEventListener('keydown', reuniaoKeyListener);
    document.removeEventListener('fullscreenchange', checkFullscreenExit);
}

function checkFullscreenExit() {
    // Se o usuário apertou ESC nativamente e saiu do fullscreen, fecha o modal junto
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
    if (e.key === 'ArrowRight') reuniaoNextSlide();
    if (e.key === 'ArrowLeft') reuniaoPrevSlide();
    if (e.key === 'Escape') fecharModoReuniao();
}

function renderReuniaoSlide() {
    const slide = reuniaoSlides[reuniaoCurrentSlide];
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
        const borderClass = slide.isAtrasado ? 'border: 2px solid rgba(220,53,69,0.4); box-shadow: 0 0 80px rgba(220,53,69,0.1);' : 'border: 1px solid rgba(255,255,255,0.08);';
        const statusBadge = slide.isAtrasado 
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

// ==========================================
// ASSISTENTE DE IA (GEMINI 2.0 FLASH REST API)
// ==========================================
const GEMINI_API_KEY = "AIzaSyBmj5I9bfNGZJ8vV57kdXV2IJ2oLu8FzDU"; 

function toggleGeminiChat() {
    const panel = document.getElementById('gemini-chat-panel');
    panel.style.display = panel.style.display === 'none' || panel.style.display === '' ? 'flex' : 'none';
}

async function sendGeminiMessage() {
    const inputEl = document.getElementById('gemini-chat-input');
    const historyEl = document.getElementById('gemini-chat-history');
    const message = inputEl.value.trim();
    if (!message) return;

    // 1. Renderiza a pergunta do sócio
    historyEl.innerHTML += `<div style="background: rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 16px 16px 4px 16px; color: #e0e0e0; align-self: flex-end; max-width: 85%; border: 1px solid rgba(255,255,255,0.05);">${sanitize(message)}</div>`;
    inputEl.value = '';
    
    // 2. Animação de carregamento
    const loadingId = 'loading-' + Date.now();
    historyEl.innerHTML += `<div id="${loadingId}" style="color: var(--cadarn-cinza); font-size: 11px; align-self: flex-start; margin-left: 5px;">✨ Analisando portfólio...</div>`;
    historyEl.scrollTop = historyEl.scrollHeight;

    // 3. O Segredo: Compilar bdProjetos em texto leve (sem sobrecarregar o limite de tokens)
    const contextoProjetos = Object.values(bdProjetos)
        .filter(p => !p.arquivado) // Ignora lixeira
        .map(p => `[Projeto: ${p.nome} | Cliente: ${p.cliente} | Líder: ${p.lider} | Status: ${p.status_crm} | Contrato: R$${p.valorContrato || 0} | Hrs Reais/Orcadas: ${p.horasReais || 0}/${p.horasOrcadas || 0} | Tags: ${(p.tags||[]).join(', ')}]`)
        .join('\n');

    // 4. Engenharia de Prompt (Grounding)
    const systemPrompt = `Você é a IA executiva da Cadarn Consultoria. Responda a pergunta do sócio APENAS utilizando o banco de dados de projetos atual abaixo. Seja analítico, profissional e muito direto (evite textos longos). Use formatação amigável (negrito para nomes e dinheiro). Se a informação não estiver no contexto, diga que não encontrou.\n\nBANCO DE DADOS ATUAL:\n${contextoProjetos}`;

    try {
        // 5. Chamada nativa ao Gemini 2.0 Flash
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: message }] }],
                generationConfig: { temperature: 0.2 } // Baixa temperatura para manter precisão cirúrgica
            })
        });

        const data = await response.json();
        
        if(data.error) throw new Error(data.error.message);
        
        // Trata a resposta (Garante que quebras de linha Markdown funcionem no HTML)
        let aiResponse = data.candidates[0].content.parts[0].text;
        aiResponse = aiResponse.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong style="color: white;">$1</strong>');

        document.getElementById(loadingId).remove();
        historyEl.innerHTML += `<div style="background: rgba(131, 46, 255, 0.1); border: 1px solid rgba(131, 46, 255, 0.3); padding: 12px 16px; border-radius: 16px 16px 16px 4px; color: #f4f4f5; align-self: flex-start; max-width: 85%;">${aiResponse}</div>`;
        historyEl.scrollTop = historyEl.scrollHeight;

    } catch (error) {
        console.error("Erro no Gemini:", error);
        document.getElementById(loadingId).remove();
        historyEl.innerHTML += `<div style="background: rgba(220,53,69,0.1); border: 1px solid rgba(220,53,69,0.3); color: #ff8793; padding: 12px; border-radius: 8px; font-size: 12px; align-self: flex-start;">Erro de conexão com o cérebro da IA. Verifique a chave de API no console.</div>`;
    }
}
// Expõe as funções globalmente para o HTML enxergar
window.abrirModoReuniao = abrirModoReuniao;
window.fecharModoReuniao = fecharModoReuniao;
window.reuniaoNextSlide = reuniaoNextSlide;
window.reuniaoPrevSlide = reuniaoPrevSlide;
window.toggleGeminiChat = toggleGeminiChat;
window.sendGeminiMessage = sendGeminiMessage;
