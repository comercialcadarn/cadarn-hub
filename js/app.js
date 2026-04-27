/* ========================================================= */
/* NÚCLEO DE AUTENTICAÇÃO E SINCRONIZAÇÃO FIREBASE (V2)      */
/* ========================================================= */

/* ========================================================= */
/* MATRIZ DE PERMISSÕES RBAC (ROLE-BASED ACCESS CONTROL)     */
/* ========================================================= */
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
const emailsAnalistas = [
    'ana.bittencourt@cadarnconsultoria.com.br',
    'louise.varela@cadarnconsultoria.com.br',
    'maria.macedo@cadarnconsultoria.com.br',
    'rafaela.avila@cadarnconsultoria.com.br',
    'stefano.miceli@cadarnconsultoria.com.br',
    'susana.vicentin@cadarnconsultoria.com.br'
];

function getUserRole(email) {
    if (!email) return 'Visitante';
    const e = email.toLowerCase().trim();
    if (emailsSocios.includes(e)) return 'Sócio';
    if (emailsDEV.includes(e)) return 'DEV';
    if (emailsRH.includes(e)) return 'RH';
    if (emailsAnalistas.includes(e)) return 'Analista';
    // Se não é nenhum dos cargos acima, mas tem e-mail da empresa, é Estagiário
    if (e.endsWith('@cadarnconsultoria.com.br')) return 'Estagiário';
    return 'Visitante';
}

function aplicarPermissoesRBAC() {
    const role = window.userRole || 'Estagiário';
    
    // Botão Área do Sócio: visível apenas para Sócios, DEV e RH
    const btnSocio = document.querySelector('button[onclick="acessarAreaSocio()"]');
    if (btnSocio) {
        btnSocio.style.display = (role === 'Sócio' || role === 'DEV' || role === 'RH') ? '' : 'none';
    }
    
    window._rbacFiltragemAtiva = (role === 'Estagiário');
}

function podeEditarProjeto() {
    const role = window.userRole || 'Estagiário';
    // Sócios, DEV, RH e Analistas podem editar. Estagiário APENAS visualiza.
    return role === 'Sócio' || role === 'DEV' || role === 'RH' || role === 'Analista';
}

function podeDeletarProjeto() {
    const role = window.userRole || 'Estagiário';
    // Apenas Sócio e DEV podem arquivar/excluir
    return role === 'Sócio' || role === 'DEV';
}

function podeVerDadosFinanceiros() {
    const role = window.userRole || 'Estagiário';
    return role === 'Sócio' || role === 'DEV';
}

function podeVerDossie(resourceOwnerId) {
    const role = window.userRole || 'Estagiário';
    const emailAtual = localStorage.getItem('cadarn_user_email') || '';
    if (role === 'Sócio' || role === 'RH' || role === 'DEV') return true;
    if (resourceOwnerId && emailAtual.includes(resourceOwnerId)) return true;
    return false;
}

window.getUserRole = getUserRole;
window.aplicarPermissoesRBAC = aplicarPermissoesRBAC;
window.podeEditarProjeto = podeEditarProjeto;
window.podeDeletarProjeto = podeDeletarProjeto;
window.podeVerDadosFinanceiros = podeVerDadosFinanceiros;
window.podeVerDossie = podeVerDossie;

let db, auth; 
let firestore = {}; 
let firebaseAuth = {};

async function initFirebase() {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
    const { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
    const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
    
    firestore = { collection, onSnapshot, doc, setDoc, deleteDoc };
    firebaseAuth = { GoogleAuthProvider, signInWithPopup, signOut };

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
    auth = getAuth(app);

    return new Promise((resolve) => {
        onAuthStateChanged(auth, (user) => {
            resolve(); // <- barra de progresso conclui aqui
            if (user) {
                if (user.email.endsWith('@cadarnconsultoria.com.br')) {
                    usuarioLogado = user.displayName;
                    localStorage.setItem('cadarn_user', usuarioLogado);
                    localStorage.setItem('cadarn_user_email', user.email); 
                    window.userRole = getUserRole(user.email);
                    document.getElementById('login-modal').classList.remove('active');
                    aplicarNome(usuarioLogado);
                    aplicarPermissoesRBAC();
                    iniciarListeners(); 
                } else {
                    showToast("Acesso restrito ao domínio @cadarnconsultoria.com.br", "danger");
                    logout();
                }
            } else {
                usuarioLogado = '';
                localStorage.removeItem('cadarn_user_email'); 
                abrirModalLoginReal();
            }
        });
    });
}

function abrirModalLoginReal() {
    const modal = document.getElementById('login-modal');
    modal.classList.add('active');
    modal.querySelector('.modal-content').innerHTML = `
       <div style="text-align:center; margin-bottom: 30px;">
            <div style="font-size: 11px; font-family: 'Outfit', sans-serif; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: var(--cadarn-roxo-claro); margin-bottom: 12px;">Área Restrita</div>
            <h3 style="font-family: 'Outfit', sans-serif; font-weight: 900; font-size: 32px; letter-spacing: -1px; color: white; margin-bottom: 8px;">Bem-vindo de volta</h3>
            <p style="color: var(--cadarn-cinza); font-size: 13px; line-height: 1.6;">Use seu e-mail <strong style="color: white;">@cadarnconsultoria.com.br</strong><br>para acessar o Hub.</p>
        </div>
        <button onclick="loginComGoogle()" style="width:100%; padding:16px; border:none; background: #ffffff; color:#111; border-radius:12px; cursor:pointer; font-family: 'Inter', sans-serif; font-weight:700; font-size: 14px; letter-spacing: 0.3px; display:flex; align-items:center; justify-content:center; gap:12px; box-shadow: 0 4px 20px rgba(0,0,0,0.2); transition: all 0.2s;">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20"> Entrar com Google
        </button>
    `;
}

async function loginComGoogle() {
    const provider = new firebaseAuth.GoogleAuthProvider();
    try {
        await firebaseAuth.signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Erro no login:", error);
        showToast("Falha na autenticação.", "danger");
    }
}

async function logout() {
    try {
        await firebaseAuth.signOut(auth);
        localStorage.removeItem('cadarn_user');
        location.reload(); 
    } catch (error) { console.error("Erro ao sair:", error); }
}

function acessarAreaSocio() {
    const emailAtual = localStorage.getItem('cadarn_user_email');
    if (!emailAtual) {
        showToast("Sessão expirada. Faça login novamente.", "warning");
        logout(); return;
    }
    const role = getUserRole(emailAtual);
    
    // Libera a passagem apenas para o Alto Escalão
    if (role === 'Sócio' || role === 'DEV' || role === 'RH') {
        window.location.href = 'socios.html';
    } else {
        showToast("Acesso negado. Sua credencial não permite entrar nesta área.", "danger");
    }
}

function iniciarListeners() {
    const { collection, onSnapshot } = firestore;
    
    onSnapshot(collection(db, "projetos"), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const id = change.doc.id;
            if (change.type === "added" || change.type === "modified") {
                bdProjetos[id] = change.doc.data();
            }
            if (change.type === "removed") {
                delete bdProjetos[id];
            }
        });
       localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
        renderMainProjects();
        atualizarDashboard();
        renderRiskReport();
        renderHubMetas();

        if (!window._briefingMostrado && usuarioLogado) {
            window._briefingMostrado = true;
            if (navigator.onLine) document.getElementById('offline-banner').style.display = 'none';
            checkMorningBriefing();
        }
    });

    onSnapshot(collection(db, "colaboradores"), (snapshot) => {
        let houveMudanca = false;
        snapshot.docChanges().forEach((change) => {
            const nome = change.doc.id;
            if (change.type === "added" || change.type === "modified") {
                configColaboradores[nome] = change.doc.data();
                houveMudanca = true;
            }
        });
        if (houveMudanca) {
            localStorage.setItem('cadarn_colabs', JSON.stringify(configColaboradores));
            atualizarColaboradorDoMes();
        }
    });
    
}

async function syncProjetoNuvem(idProjeto, isDelete = false) {
    if (!navigator.onLine || !db) return;
    const { doc, setDoc, deleteDoc } = firestore;
    try {
        if (isDelete) { await deleteDoc(doc(db, "projetos", idProjeto)); } 
        else { await setDoc(doc(db, "projetos", idProjeto), bdProjetos[idProjeto], { merge: true }); }
    } catch (error) { console.error("Erro ao salvar projeto no Firebase:", error); }
}

async function syncDeleteLoteNuvem(idsParaExcluir) {
    if (!navigator.onLine || !db) return;
    const { doc, deleteDoc } = firestore;

    const resultados = await Promise.allSettled(
        idsParaExcluir.map(id => deleteDoc(doc(db, "projetos", id)))
    );

    const falhas = resultados.filter(r => r.status === 'rejected');
    if (falhas.length > 0) {
        console.error(`${falhas.length} exclusões falharam na nuvem.`);
        showToast(`Atenção: ${falhas.length} projeto(s) não foram excluídos da nuvem.`, 'warning');
    }
}

async function syncColabsNuvem(nomesAfetados) {
    if (!navigator.onLine || !db) return;
    const { doc, setDoc } = firestore;

    await Promise.allSettled(
        nomesAfetados
            .filter(nome => configColaboradores[nome])
            .map(nome => setDoc(doc(db, "colaboradores", nome), configColaboradores[nome], { merge: true }))
    );
}

/* ========================================== */
/* LÓGICA PRINCIPAL DO APP                    */
/* ========================================== */

let usuarioLogado = localStorage.getItem('cadarn_user') || '';
let configColaboradores = JSON.parse(localStorage.getItem('cadarn_colabs')) || {};

// Variáveis globais essenciais (Se faltar uma, o site inteiro trava)
let bdProjetos = (() => {
    try {
        const cache = localStorage.getItem('cadarn_projetos_db');
        return cache ? JSON.parse(cache) : {};
    } catch {
        return {};
    }
})();
let projetoAbertoAtual = null;
let isEditingProjeto = false;
let modoVisualizacao = 'list'; 
let filtroAtual = 'Todos';
let filtroMembro = null; 
let isSelectModeLixeira = false;
let selectedLixeiraItems = new Set();
let presentationSlides = [];
let currentSlideIndex = 0;
let isSelectModeHub = false;
let selectedHubItems = new Set();

function autoDetectGender(name) {
    const first = name.toLowerCase().split(' ')[0];
    if (first.endsWith('a') && !['luca', 'andrea', 'micha'].includes(first)) return 'F';
    return 'M';
}

function getAvatarHtml(nome, size = 40) {
    const conf = configColaboradores[nome] || { foto: '', genero: autoDetectGender(nome), celular: '', email: '' };
    if (conf.foto) return `<div style="width:${size}px; height:${size}px; background-image:url('${conf.foto}'); background-size:cover; background-position:center; border-radius:50%; border: 2px solid rgba(255,255,255,0.1); box-shadow: 0 4px 10px rgba(0,0,0,0.3);"></div>`;
    
    const isF = conf.genero === 'F';
    const grad = isF ? 'linear-gradient(135deg, #ff6b9e, #ff8a65)' : 'linear-gradient(135deg, #2e8bc0, #832EFF)';
    const iconPath = isF 
        ? `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle><path d="M8 10c0 3.5 2 5 4 5s4-1.5 4-5" stroke-dasharray="2 2" stroke-opacity="0.6"></path>` 
        : `<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>`; 
        
    return `
        <div style="width:${size}px; height:${size}px; background:${grad}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; border: 2px solid rgba(255,255,255,0.15); box-shadow: inset 0 -2px 5px rgba(0,0,0,0.2), 0 4px 10px rgba(0,0,0,0.3);">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: ${size*0.5}px; height: ${size*0.5}px;">
                ${iconPath}
            </svg>
        </div>
    `;
}

let perfilAtualNome = '';

function abrirMeuPerfil() {
    if(usuarioLogado) { abrirPerfil(usuarioLogado); } else { abrirModalLoginReal(); }
}

function abrirPerfil(nome) {
    perfilAtualNome = nome;
    const conf = configColaboradores[nome] || { foto: '', genero: autoDetectGender(nome), celular: '', email: '', nascimento: '', elogiosRecebidos: [], elogiosEnviados: [] };
    
    document.getElementById('profile-name').innerText = sanitize(nome);
    document.getElementById('profile-avatar-render').innerHTML = getAvatarHtml(nome, 80);
    
    document.getElementById('profile-phone').value = conf.celular || '';
    document.getElementById('profile-email').value = conf.email || '';
    document.getElementById('profile-birthday').value = conf.nascimento || '';
    
    // Calcula e mostra dias até o aniversário
    const birthdayEl = document.getElementById('profile-birthday-countdown');
    if (birthdayEl && conf.nascimento) {
        const hoje = new Date();
        const nasc = new Date(conf.nascimento);
        const proxAniv = new Date(hoje.getFullYear(), nasc.getMonth(), nasc.getDate());
        if (proxAniv < hoje) proxAniv.setFullYear(hoje.getFullYear() + 1);
        const diasAte = Math.ceil((proxAniv - hoje) / (1000 * 60 * 60 * 24));
        
        if (diasAte === 0) {
            birthdayEl.innerHTML = '🎂 <strong style="color:#ffc107;">Hoje é seu aniversário! 🎉</strong>';
        } else if (diasAte <= 7) {
            birthdayEl.innerHTML = `🎂 <strong style="color:#ffc107;">Aniversário em ${diasAte} dia${diasAte > 1 ? 's' : ''}!</strong>`;
        } else {
            birthdayEl.innerHTML = `🎂 Aniversário em <strong>${diasAte} dias</strong>`;
        }
        birthdayEl.style.display = 'block';
    } else if (birthdayEl) {
        birthdayEl.style.display = 'none';
    }

    const elogiosSection = document.getElementById('profile-elogios-section');
    const privateStars = document.getElementById('profile-private-stars');
    if(nome === usuarioLogado) {
        elogiosSection.style.display = 'block';
        let rec = (conf.elogiosRecebidos || []).map(e => `<div style="padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px; color:var(--cadarn-branco); line-height:1.4;"><strong>De ${sanitize(e.de)}:</strong><br>${sanitize(e.texto)}</div>`).join('');
        let env = (conf.elogiosEnviados || []).map(e => `<div style="padding:8px; border-bottom:1px solid rgba(255,255,255,0.05); font-size:12px; color:var(--cadarn-branco); line-height:1.4;"><strong>Para ${sanitize(e.para)}:</strong><br>${sanitize(e.texto)}</div>`).join('');
        
        document.getElementById('elogios-recebidos-list').innerHTML = rec || '<div style="font-size:11px; color:var(--cadarn-cinza);">Nenhum recebido.</div>';
        document.getElementById('elogios-enviados-list').innerHTML = env || '<div style="font-size:11px; color:var(--cadarn-cinza);">Nenhum enviado.</div>';
        privateStars.innerText = `${conf.elogiosRecebidos ? conf.elogiosRecebidos.length : 0} ⭐ (Apenas você vê)`;
    } else {
        elogiosSection.style.display = 'none';
        privateStars.innerText = '';
    }

    let ativos = []; let concluidos = [];
    let pCount = 0; const MAX_PROJECTS = 5;

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        
        const emEquipe = (proj.equipeAtual || []).some(m => m.split('(')[0].trim() === nome);
        const exEquipe = (proj.equipeAntiga || []).some(m => m.split('(')[0].trim() === nome);
        
        if (emEquipe || exEquipe) {
            const todasConcluidas = proj.etapas && proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
            const htmlItem = `<div class="prof-list-item" onclick="abrirProjeto('${id}'); document.getElementById('profile-modal').classList.remove('active');">
                                <div><strong>${sanitize(proj.nome)}</strong><br><span style="font-size:11px; color:var(--cadarn-cinza);">${sanitize(proj.cliente)}</span></div>
                                <div style="font-size:10px; opacity:0.7; padding-top:2px;">${exEquipe && !todasConcluidas ? '(Ex-Membro)' : ''}</div>
                              </div>`;
            if (todasConcluidas) { concluidos.push(htmlItem); } else if (emEquipe) { ativos.push(htmlItem); pCount++; }
        }
    }

    const pct = Math.min(Math.round((pCount / MAX_PROJECTS) * 100), 100);
    let colorAlloc = '#47e299'; if(pct>=80) colorAlloc='#ff8793'; else if(pct>=50) colorAlloc='#ffc107';
    document.getElementById('profile-alloc').innerHTML = `<span style="color:${colorAlloc}">${pct}% Alocado</span> (${pCount} projetos ativos)`;
    
    document.getElementById('profile-active-list').innerHTML = ativos.length ? ativos.join('') : '<div style="font-size:12px; color:var(--cadarn-cinza);">Nenhum projeto em execução.</div>';
    document.getElementById('profile-past-list').innerHTML = concluidos.length ? concluidos.join('') : '<div style="font-size:12px; color:var(--cadarn-cinza);">Nenhum projeto concluído.</div>';

    document.getElementById('profile-modal').classList.add('active');
}

function fecharPerfil(e) {
    if(e.target === document.getElementById('profile-modal')) { document.getElementById('profile-modal').classList.remove('active'); }
}

function salvarPerfilDado(prop, val) {
    if(!perfilAtualNome) return;
    if(!configColaboradores[perfilAtualNome]) configColaboradores[perfilAtualNome] = { genero: autoDetectGender(perfilAtualNome) };
    
    configColaboradores[perfilAtualNome][prop] = val;
    localStorage.setItem('cadarn_colabs', JSON.stringify(configColaboradores));
    
    if(navigator.onLine) { syncColabsNuvem([perfilAtualNome]).then(() => { showToast('Informação sincronizada na nuvem.', 'success'); }); } 
    else { showToast('Salvo localmente (Offline).', 'warning'); }
}

function handleDropFoto(e) { e.preventDefault(); e.currentTarget.classList.remove('dragover'); if (e.dataTransfer.files && e.dataTransfer.files[0]) { processarFotoPerfil(e.dataTransfer.files[0]); } }
function handleFileFoto(e) { if (e.target.files && e.target.files[0]) { processarFotoPerfil(e.target.files[0]); } }

function processarFotoPerfil(file) {
    if(!file.type.startsWith('image/')) { showToast('Por favor, selecione uma imagem.', 'warning'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const size = 150; canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            const min = Math.min(img.width, img.height);
            const sx = (img.width - min) / 2; const sy = (img.height - min) / 2;
            ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7); 
            salvarPerfilDado('foto', dataUrl);
            document.getElementById('profile-avatar-render').innerHTML = getAvatarHtml(perfilAtualNome, 80);
            if(modoVisualizacao === 'equipe') renderMainProjects();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function abrirModalElogio() {
    if(!usuarioLogado) { abrirModalLoginReal(); showToast('Identifique-se primeiro para mandar um elogio.', 'warning'); return; }
    const sel = document.getElementById('elogio-para');
    let opts = '<option value="">Escolha um colega...</option>';
    let todosMembros = new Set(Object.keys(configColaboradores));
    Object.values(bdProjetos).forEach(p => {
        (p.equipeAtual || []).forEach(m => todosMembros.add(m.split('(')[0].trim()));
        (p.equipeAntiga || []).forEach(m => todosMembros.add(m.split('(')[0].trim()));
    });
    Array.from(todosMembros).sort().forEach(nome => { if(nome && nome !== usuarioLogado) { opts += `<option value="${sanitize(nome)}">${sanitize(nome)}</option>`; } });
    sel.innerHTML = opts; document.getElementById('elogio-texto').value = ''; document.getElementById('elogio-modal').classList.add('active');
}

function fecharModalElogio(e) { if(!e || e.target === document.getElementById('elogio-modal') || e.target.classList.contains('sp-close')) { document.getElementById('elogio-modal').classList.remove('active'); } }

function enviarElogio() {
    const de = usuarioLogado; const para = document.getElementById('elogio-para').value; const texto = document.getElementById('elogio-texto').value.trim();
    if(!para) { showToast("Selecione para quem vai o elogio.", "warning"); return; }
    if(!texto) { showToast("Escreva a mensagem do elogio.", "warning"); return; }

    if(!configColaboradores[para]) configColaboradores[para] = {};
    if(!configColaboradores[para].elogiosRecebidos) configColaboradores[para].elogiosRecebidos = [];
    configColaboradores[para].elogiosRecebidos.push({ de, texto, data: new Date().toISOString() });

    if(!configColaboradores[de]) configColaboradores[de] = {};
    if(!configColaboradores[de].elogiosEnviados) configColaboradores[de].elogiosEnviados = [];
    configColaboradores[de].elogiosEnviados.push({ para, texto, data: new Date().toISOString() });

    localStorage.setItem('cadarn_colabs', JSON.stringify(configColaboradores));
    if(navigator.onLine) { syncColabsNuvem([de, para]); }

    showToast(`⭐ Elogio enviado para ${sanitize(para)}!`, 'success');
    fecharModalElogio(); atualizarColaboradorDoMes();
}

function atualizarColaboradorDoMes() {
    let topColab = null; let maxEstrelas = 0;
    for(let [nome, data] of Object.entries(configColaboradores)) {
        let estrelas = data.elogiosRecebidos ? data.elogiosRecebidos.length : 0;
        if(estrelas > maxEstrelas) { maxEstrelas = estrelas; topColab = nome; }
    }
    const container = document.getElementById('colaborador-mes-container');
    if(topColab && maxEstrelas > 0) {
        container.innerHTML = `
            <div style="cursor:pointer; position:relative; flex-shrink:0;" onclick="abrirPerfil('${sanitize(topColab)}')">
                ${getAvatarHtml(topColab, 60)}
                <div style="position:absolute; bottom:-2px; right:-2px; background:#ffc107; color:#000; border-radius:50%; width:20px; height:20px; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; border:2px solid #151515;">1º</div>
            </div>
            <div style="flex-grow: 1; text-align: left;">
                <div style="font-size:10px; color:var(--cadarn-roxo-claro); text-transform:uppercase; font-weight:800; margin-bottom:4px; letter-spacing:1px; font-family: 'Outfit', sans-serif;">🌟 Destaque do Mês</div>
                <div style="font-size:20px; font-weight:800; color:white; font-family: 'Outfit', sans-serif; letter-spacing:-0.5px; line-height: 1;">${sanitize(topColab).split(' ')[0]}</div>
                <div style="font-size:12px; color:#ffc107; font-weight:700; margin-top:4px;">${maxEstrelas} Reconhecimento(s)</div>
            </div>
        `;
    } else { container.innerHTML = `<div style="font-size:10px; color:var(--cadarn-cinza); text-transform:uppercase; text-align:center;">Nenhum destaque ainda</div>`; }
}

function showToast(message, type = 'info', onUndo = null) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    let undoClicado = false;

    if (onUndo) {
        const btn = document.createElement('button');
        btn.className = 'toast-undo';
        btn.textContent = 'Desfazer';
        btn.addEventListener('click', () => {
            undoClicado = true;
            onUndo();
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        });
        toast.appendChild(btn);
    }

    container.appendChild(toast);

    setTimeout(() => {
        if (!undoClicado && document.body.contains(toast)) {
            toast.style.opacity = '0';
            setTimeout(() => { if (document.body.contains(toast)) toast.remove(); }, 300);
        }
    }, 6000);
}

function toggleTheme() {
    const body = document.body; const isLight = body.classList.toggle('light-mode'); const btn = document.getElementById('theme-toggle');
    if (isLight) { btn.innerHTML = '🌙'; btn.title = 'Modo Escuro'; localStorage.setItem('cadarn_theme', 'light'); updateIframesTheme('light'); } 
    else { btn.innerHTML = '☀️'; btn.title = 'Modo Claro'; localStorage.setItem('cadarn_theme', 'dark'); updateIframesTheme('dark'); }
    atualizarDashboard(); 
}

function updateIframesTheme(theme) {
    const iframesToUpdate = ['tv-widget-1', 'tv-widget-2', 'tv-widget-3', 'tv-widget-4', 'tv-widget-5'];
    iframesToUpdate.forEach(id => {
        const ifr = document.getElementById(id);
        if (ifr) { ifr.src = ifr.src.replace(theme === 'light' ? 'colorTheme=dark' : 'colorTheme=light', theme === 'light' ? 'colorTheme=light' : 'colorTheme=dark'); }
    });
}

function loadTheme() {
    const savedTheme = localStorage.getItem('cadarn_theme'); const btn = document.getElementById('theme-toggle');
    if (savedTheme === 'light') { document.body.classList.add('light-mode'); btn.innerHTML = '🌙'; btn.title = 'Modo Escuro'; updateIframesTheme('light'); }
}

function sanitize(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', "/": '&#x2F;' };
    return String(str).replace(/[&<>"'/]/ig, (match) => map[match]);
}

function diasEntre(dataInicial, dataFinal) {
    if(!dataInicial) return 0;
    const fim = dataFinal ? new Date(dataFinal) : new Date();
    const diffTempo = Math.abs(fim - new Date(dataInicial));
    return Math.ceil(diffTempo / (1000 * 60 * 60 * 24)); 
}

const insights = [
    { text: "A inovação distingue um líder de um seguidor.", author: "Steve Jobs" },
    { text: "O maior risco é não correr nenhum risco.", author: "Mark Zuckerberg" },
    { text: "Sua marca pessoal é o que dizem sobre você quando você não está na sala.", author: "Jeff Bezos" },
    { text: "A excelência não é um ato, mas um hábito.", author: "Aristóteles" },
    { text: "Clientes não compram produtos. Compram versões melhores de si mesmos.", author: "Peter Drucker" },
    { text: "Não gerencie tempo. Gerencie energia.", author: "Tony Schwartz" },
    { text: "Uma estratégia sem execução é uma alucinação.", author: "Thomas Edison" },
    { text: "A cultura come a estratégia no café da manhã.", author: "Peter Drucker" },
    { text: "O segredo do sucesso de longo prazo é fazer perguntas estúpidas.", author: "Elon Musk" },
    { text: "Velocidade é uma vantagem competitiva. Rapidez de decisão é estratégia.", author: "Reid Hoffman" },
    { text: "Se você não está envergonhado da primeira versão do seu produto, lançou tarde demais.", author: "Reid Hoffman" },
    { text: "Empresas que prosperam não vendem produtos. Criam categorias.", author: "Al Ries" },
    { text: "Dados são o novo petróleo. Mas petróleo bruto tem pouco valor — é o refino que importa.", author: "Clive Humby" },
    { text: "Líderes não criam seguidores. Criam mais líderes.", author: "Tom Peters" },
    { text: "Um bom plano executado agora é melhor que um plano perfeito executado amanhã.", author: "George Patton" },
    { text: "Errar rápido, aprender rápido, melhorar rápido.", author: "Tom Peters" },
    { text: "A visão sem ação é um sonho. Ação sem visão é um pesadelo.", author: "Provérbio Japonês" },
    { text: "Contrate caráter. Treine habilidade.", author: "Peter Schutz" },
    { text: "O maior perigo em tempos de turbulência não é a turbulência — é agir com a lógica de ontem.", author: "Peter Drucker" },
    { text: "Simplicidade é a sofisticação máxima.", author: "Leonardo da Vinci" },
    { text: "Resultados são obtidos aproveitando oportunidades, não resolvendo problemas.", author: "Peter Drucker" },
    { text: "O que é medido, é gerenciado.", author: "Peter Drucker" },
    { text: "Uma marca é a promessa de uma experiência.", author: "Shelly Lazarus" },
    { text: "Receita resolve todos os problemas conhecidos do negócio.", author: "Mark Cuban" },
    { text: "Crescimento nunca ocorre por acidente. É o resultado de forças trabalhando juntas.", author: "James Cash Penney" },
    { text: "A melhor publicidade é um cliente satisfeito.", author: "Bill Gates" },
    { text: "Sonhe grande. Comece pequeno. Aja agora.", author: "Robin Sharma" },
    { text: "Toda empresa é uma empresa de software — ou será.", author: "Satya Nadella" }
];

function renderDailyQuote() {
    const today = new Date();
    const index = (today.getFullYear() + today.getMonth() + today.getDate()) % insights.length;
    const quote = insights[index];
    document.getElementById('quote-text').innerText = `"${quote.text}"`; document.getElementById('quote-author').innerText = `- ${quote.author}`;
}

function checkMorningBriefing() {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastBriefing = localStorage.getItem('cadarn_last_briefing_date');
    
    if (lastBriefing !== todayStr) {
        let totaisAtivos = 0; let atrasosGlobais = 0; const hojeCompare = new Date(new Date().setHours(0,0,0,0));

        for (const proj of Object.values(bdProjetos)) {
            if (proj.arquivado || proj.visivelHub === false) continue;
            const todasConcluidas = proj.etapas && proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
            if (!todasConcluidas) {
                totaisAtivos++;
                if(proj.etapas) {
                    proj.etapas.forEach(e => {
                        if(e.prazo && new Date(e.prazo) < hojeCompare && e.status !== 'concluido') atrasosGlobais++;
                    });
                }
            }
        }

        document.getElementById('briefing-ativos').innerText = totaisAtivos; document.getElementById('briefing-atrasos').innerText = atrasosGlobais;
        const alertBox = document.getElementById('briefing-alert-box');
        if (atrasosGlobais > 0) { alertBox.classList.add('briefing-alert'); document.getElementById('briefing-atrasos').style.color = '#ff8793'; } 
        else { alertBox.classList.remove('briefing-alert'); document.getElementById('briefing-atrasos').style.color = '#47e299'; }
        
        document.getElementById('briefing-modal').classList.add('active');
    }
}

function fecharBriefing() {
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('cadarn_last_briefing_date', todayStr);
    document.getElementById('briefing-modal').classList.remove('active');
}

function setVisualizacao(modo) {
    modoVisualizacao = modo;
    
    // 1. Atualiza os botões visuais
    document.getElementById('btn-view-list').classList.toggle('active', modo === 'list');
    document.getElementById('btn-view-kanban').classList.toggle('active', modo === 'kanban');
    document.getElementById('btn-view-roadmap').classList.toggle('active', modo === 'roadmap');
    document.getElementById('btn-view-equipe').classList.toggle('active', modo === 'equipe');
    document.getElementById('btn-view-lixeira').classList.toggle('active', modo === 'lixeira');
    
    // Removemos totalmente a alteração do 'heroGrid' daqui!
    // Ele vai respeitar o CSS e ficar ao lado dos outros blocos.

    // 2. Lógica original de lixeira e tags
    isSelectModeLixeira = false; 
    selectedLixeiraItems.clear();
    document.getElementById('tags-filter-container').style.display = (modo === 'equipe' || modo === 'lixeira') ? 'none' : 'flex';
    
    // 3. Renderiza o conteúdo central
    renderMainProjects();
}

function setFiltro(tag) { filtroAtual = tag; filtroMembro = null; renderMainProjects(); }
function filtrarPorStatus(status) {
    // Adiciona filtro visual de status temporário
    const mapa = { 'ativo': 'Em Execução', 'concluido': 'Concluídos', 'pendente': 'Aguardando' };
    showToast(`Filtrando: ${mapa[status] || status}`, 'info');
    
    // Aplica filtragem direta no container
    document.querySelectorAll('.project-row').forEach(row => {
        const dot = row.querySelector(`.dot-${status}`);
        row.style.display = dot ? '' : 'none';
    });

    // Botão para limpar
    const container = document.getElementById('tags-filter-container');
    const limpar = document.createElement('button');
    limpar.className = 'tag-filter-btn active';
    limpar.textContent = `✕ Limpar filtro de status`;
    limpar.onclick = () => {
        document.querySelectorAll('.project-row').forEach(r => r.style.display = '');
        limpar.remove();
    };
    // Remove botão anterior se existir
    const anterior = container.querySelector('[data-status-filter]');
    if (anterior) anterior.remove();
    limpar.setAttribute('data-status-filter', 'true');
    container.appendChild(limpar);
}
window.filtrarPorStatus = filtrarPorStatus;
function limparFiltroMembro() { filtroMembro = null; renderMainProjects(); }

function toggleSelectModeLixeira() {
    isSelectModeLixeira = !isSelectModeLixeira;
    selectedLixeiraItems.clear();
    renderMainProjects();
}

function toggleLixeiraItem(id) {
    if (selectedLixeiraItems.has(id)) selectedLixeiraItems.delete(id);
    else selectedLixeiraItems.add(id);
    const btn = document.getElementById('btn-delete-selected');
    if (btn) { btn.innerText = `🗑️ Apagar Selecionados (${selectedLixeiraItems.size})`; btn.disabled = selectedLixeiraItems.size === 0; btn.style.opacity = selectedLixeiraItems.size === 0 ? '0.5' : '1'; }
}

function deleteSelectedLixeira() {
    if (selectedLixeiraItems.size === 0) return;
    const count = selectedLixeiraItems.size; const backups = {};
    const idsArray = Array.from(selectedLixeiraItems);
    
    idsArray.forEach(id => { backups[id] = JSON.parse(JSON.stringify(bdProjetos[id])); delete bdProjetos[id]; });
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));

    showToast(`${count} projeto(s) excluído(s) permanentemente.`, 'danger', () => {
        Object.assign(bdProjetos, backups); 
        localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos)); 
        renderMainProjects();
    });

    if(navigator.onLine) { syncDeleteLoteNuvem(idsArray); }
    isSelectModeLixeira = false; selectedLixeiraItems.clear(); renderMainProjects();
}

// O MOTOR GANTT DO HUB PRINCIPAL
function renderCronogramaFiltrado(containerId, filterUser) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const startDate = new Date(); startDate.setDate(startDate.getDate() - 5); startDate.setHours(0,0,0,0);
    const totalDays = 45; const colWidth = 40; 
    let headersHtml = '';
    const diasSemana = ["D", "S", "T", "Q", "Q", "S", "S"];
    
    for(let i=0; i<totalDays; i++) {
        let d = new Date(startDate); d.setDate(d.getDate() + i);
        let isHoje = d.getTime() === new Date(new Date().setHours(0,0,0,0)).getTime();
        headersHtml += `<div class="gantt-day-col ${isHoje ? 'hoje' : ''}"><div class="gantt-day-name">${diasSemana[d.getDay()]}</div><div class="gantt-day-num">${d.getDate()}</div></div>`;
    }

    let sidebarHtml = `<div class="gantt-sidebar-header">Minhas Entregas (${sanitize(filterUser.split(' ')[0])})</div>`;
    let timelineHtml = `<div class="gantt-header-row" style="width: ${totalDays * colWidth}px;">${headersHtml}</div><div class="gantt-body" style="width: ${totalDays * colWidth}px;">`;
    let temProjetos = false;

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if(proj.arquivado || proj.visivelHub === false) return;
        
        let etapasProj = (proj.etapas || []).filter(e => e.responsavel === filterUser);
        if(etapasProj.length === 0) return;

        temProjetos = true;
        sidebarHtml += `<div class="gantt-sidebar-item gantt-sidebar-proj" onclick="abrirProjeto('${id}')">📁 ${sanitize(proj.nome)}</div>`;
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

            const respInicial = t.responsavel.charAt(0).toUpperCase();

            sidebarHtml += `<div class="gantt-sidebar-item" style="padding-left: 30px; color: var(--cadarn-cinza);" onclick="abrirProjeto('${id}')">↳ ${sanitize(t.titulo)}</div>`;
            timelineHtml += `<div class="gantt-row"><div class="gantt-bar-wrapper" style="left: ${leftPx}px; width: ${widthPx}px;"><div class="gantt-bar ${colorClass}" title="${sanitize(t.titulo)}" onclick="abrirProjeto('${id}')"><div class="gantt-bar-avatar">${respInicial}</div>${sanitize(t.titulo)}</div></div></div>`;
        });
    });

    if(!temProjetos) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--cadarn-cinza);">Nenhuma entrega com prazo atribuída a você no momento.</div>`;
        return;
    }

    timelineHtml += `</div>`;
    container.innerHTML = `<div class="gantt-wrapper"><div class="gantt-sidebar">${sidebarHtml}</div><div class="gantt-timeline-container">${timelineHtml}</div></div>`;
}

function renderMainProjects() {
    const container = document.getElementById('main-projects-container');
    const filterContainer = document.getElementById('tags-filter-container');
    
    if (Object.keys(bdProjetos).length === 0) { container.innerHTML = '<p style="color: var(--cadarn-cinza); font-size: 13px; text-align: center; padding: 20px;">Nenhum projeto cadastrado.</p>'; atualizarDashboard(); return; }
    
    let todasTags = new Set();
    Object.values(bdProjetos).forEach(p => { if(!p.arquivado && p.visivelHub) (p.tags || []).forEach(t => todasTags.add(t)); });
    
    let filterHtml = `<button class="tag-filter-btn ${filtroAtual === 'Todos' && !filtroMembro ? 'active' : ''}" onclick="setFiltro('Todos')">Todos</button>`;
    if (filtroMembro) { filterHtml += `<button class="tag-filter-btn active" onclick="limparFiltroMembro()">👤 ${sanitize(filtroMembro)} ✕</button>`; }
    Array.from(todasTags).sort().forEach(tag => { filterHtml += `<button class="tag-filter-btn ${filtroAtual === tag && !filtroMembro ? 'active' : ''}" onclick="setFiltro('${sanitize(tag)}')">${sanitize(tag)}</button>`; });
    // Conta projetos visíveis com o filtro atual
    let projetosVisiveis = 0;
    let projetosTotal = 0;
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        projetosTotal++;
        const passaTag = filtroAtual === 'Todos' || (proj.tags || []).includes(filtroAtual);
        const passaMembro = !filtroMembro || (proj.equipeAtual || []).some(m => m.split('(')[0].trim() === filtroMembro);
        if (passaTag && passaMembro) projetosVisiveis++;
    }

    const temFiltro = filtroAtual !== 'Todos' || filtroMembro;
    if (temFiltro && modoVisualizacao === 'list') {
        filterHtml += `<span style="font-size:11px; color:var(--cadarn-cinza); margin-left:auto; align-self:center; padding: 4px 10px; background: rgba(255,255,255,0.03); border-radius:20px; border: 1px solid var(--border-color);">
            ${projetosVisiveis} de ${projetosTotal} projetos
        </span>`;
    }

    // Injeta os botões de seleção em massa ao lado dos filtros
    const canBatchEdit = podeDeletarProjeto(); // Sócio ou DEV
    if (canBatchEdit && modoVisualizacao !== 'roadmap' && modoVisualizacao !== 'equipe' && modoVisualizacao !== 'lixeira') {
        const totalVisiveis = Object.keys(bdProjetos).filter(id => !bdProjetos[id].arquivado && bdProjetos[id].visivelHub).length;
        const textoSelecionar = selectedHubItems.size === totalVisiveis ? 'Desmarcar Tudo' : '☑️ Selecionar Tudo';
        
        filterHtml += `
            <div style="margin-left: auto; display: flex; gap: 8px; align-items: center;">
                <button class="tag-filter-btn" style="background: rgba(131,46,255,0.15); color: #c5a3ff; border-color: var(--cadarn-roxo);" onclick="toggleSelectAllHub()">
                    ${textoSelecionar}
                </button>
                ${selectedHubItems.size > 0 ? `
                    <button class="sp-btn-edit" style="background: rgba(220, 53, 69, 0.2); border-color: #dc3545; color: #ff8793; padding: 6px 15px;" onclick="arquivarSelecionadosHub()">
                        📥 Enviar para Lixeira (${selectedHubItems.size})
                    </button>
                ` : ''}
            </div>
        `;
    }
    
    filterContainer.innerHTML = filterHtml;
    
    let kanbanAguardando = ''; let kanbanAtivos = ''; let kanbanConcluidos = ''; let listaNormal = '';
    const hojeCompare = new Date(new Date().setHours(0,0,0,0));

    if (modoVisualizacao === 'roadmap') {
        renderCronogramaFiltrado('main-projects-container', usuarioLogado);
        atualizarDashboard(); 
        return; 
    }
    
    if (modoVisualizacao === 'lixeira') {
        let lixeiraHtml = `
            <div class="lixeira-controls">
                <button class="sp-btn-edit" style="background: transparent; border-color: var(--cadarn-roxo); color: var(--cadarn-roxo);" onclick="toggleSelectModeLixeira()">${isSelectModeLixeira ? 'Cancelar Seleção' : '☑️ Selecionar Vários'}</button>
                ${isSelectModeLixeira ? `<button id="btn-delete-selected" class="sp-btn-edit" style="background: rgba(220, 53, 69, 0.2); border-color: #dc3545; color: #ff8793; opacity: 0.5;" disabled onclick="deleteSelectedLixeira()">🗑️ Apagar Selecionados (0)</button>` : ''}
            </div>
        `;
        let temItemLixeira = false;
        for (const [id, proj] of Object.entries(bdProjetos)) {
            if (!proj.arquivado) continue;
            temItemLixeira = true;
            let checkHtml = isSelectModeLixeira ? `<input type="checkbox" class="checkbox-lixeira" onchange="toggleLixeiraItem('${id}')">` : '';
            let actionHtml = isSelectModeLixeira ? '' : `<button class="sp-btn-edit" style="background: rgba(71, 226, 153, 0.2); border-color: #47e299; color: #47e299;" onclick="restaurarProjetoDireto('${id}')">♻️ Restaurar</button>`;
            lixeiraHtml += `<div class="project-row" style="cursor: default;"><div style="display: flex; align-items: center; gap: 15px;">${checkHtml}<div><div style="font-weight: 500; font-size: 15px; margin-bottom: 5px; color: var(--cadarn-cinza); text-decoration: line-through;">${sanitize(proj.nome)}</div><div style="font-size: 12px; color: var(--cadarn-cinza);">Cliente: ${sanitize(proj.cliente)}</div></div></div><div>${actionHtml}</div></div>`;
        }
        container.innerHTML = temItemLixeira ? lixeiraHtml : '<p style="color:var(--cadarn-cinza); font-size: 13px; padding: 15px;">A lixeira está vazia.</p>';
        return; 
    }

    if (modoVisualizacao === 'equipe') {
        let workload = {};
        for (const proj of Object.values(bdProjetos)) {
            if (proj.arquivado || proj.visivelHub === false) continue;
            const todasConcluidas = proj.etapas && proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
            if (todasConcluidas) continue; 
            (proj.etapas || []).forEach(t => {
                if(t.responsavel && t.status !== 'concluido') {
                    let nome = t.responsavel.split('(')[0].trim();
                    if(nome) {
                        if(!workload[nome]) workload[nome] = { p: 0, atrasados: 0 };
                        workload[nome].p++;
                        if(t.prazo && new Date(t.prazo) < hojeCompare) { workload[nome].atrasados++; }
                    }
                }
            });
        }
        let eqHtml = '<div class="team-matrix-grid">';
        if(Object.keys(workload).length === 0) eqHtml += '<p style="color:var(--cadarn-cinza); font-size: 13px;">Ninguém alocado no momento.</p>';
        for (const [nome, data] of Object.entries(workload)) {
            let alertHtml = data.atrasados > 0 ? `<div style="margin-top:10px; color:#ff8793; font-size:11px; font-weight:600;">⚠️ ${data.atrasados} entregas atrasadas</div>` : '';
            eqHtml += `<div class="team-member-card" onclick="abrirPerfil('${sanitize(nome)}')">
                <div class="tm-header">${getAvatarHtml(nome, 46)}<div><div class="tm-info">${sanitize(nome)}</div><div class="tm-sub">Consultor(a)</div></div></div>
                <div class="tm-body"><div><strong>${data.p}</strong> Tarefas Ativas</div>${alertHtml}</div>
            </div>`;
        }
        eqHtml += '</div>'; container.innerHTML = eqHtml; return; 
    }

    let temProjetosParaMostrar = false;

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        
        if (filtroAtual !== 'Todos' && !(proj.tags || []).includes(filtroAtual)) continue;
        if (filtroMembro && !(proj.equipeAtual || []).some(m => m.split('(')[0].trim() === filtroMembro)) continue;
        
        temProjetosParaMostrar = true;
        let statusGeral = 'pendente'; let labelStatus = 'Aguardando'; let slaBadge = '';
        if (!proj.etapas) proj.etapas = [];
        const todasConcluidas = proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
        const algumaAtiva = proj.etapas.some(e => e.status === 'ativo');
        
        if (todasConcluidas) { statusGeral = 'concluido'; labelStatus = 'Concluído'; } 
        else {
            if (algumaAtiva) { statusGeral = 'ativo'; labelStatus = 'Em Execução'; }
            let temAtraso = false; let venceHoje = false;
            proj.etapas.forEach(e => {
                if (e.prazo && e.status !== 'concluido') {
                    const dPrazo = new Date(e.prazo); dPrazo.setMinutes(dPrazo.getMinutes() + dPrazo.getTimezoneOffset());
                    if (dPrazo < hojeCompare) temAtraso = true; else if (dPrazo.getTime() === hojeCompare.getTime()) venceHoje = true;
                }
            });
            if (temAtraso) slaBadge = '<span class="badge-danger">Atrasado</span>';
            else if (venceHoje) slaBadge = '<span class="badge-warning">Vence Hoje</span>';
        }
        
        const tagsHtml = (proj.tags || []).map(t => `<span class="tag-pill">${sanitize(t)}</span>`).join('');
        
        const checkboxHtml = canBatchEdit ? `
            <div style="margin-right: 15px;" onclick="event.stopPropagation()">
                <input type="checkbox" style="width:18px; height:18px; accent-color: var(--cadarn-roxo); cursor: pointer;" 
                       ${selectedHubItems.has(id) ? 'checked' : ''} 
                       onchange="toggleHubItem('${id}')">
            </div>
        ` : '';

        if (modoVisualizacao === 'list') {
            listaNormal += `<div class="project-row" onclick="abrirProjeto('${sanitize(id)}')">
                <div style="display:flex; align-items:center; width:100%;">
                    ${checkboxHtml}
                    <div style="flex-grow:1;">
                        <div style="font-weight: 500; font-size: 15px; margin-bottom: 5px; display:flex; align-items:center;">${sanitize(proj.nome)} ${slaBadge}</div>
                        <div style="display:flex; flex-wrap:wrap; margin-bottom:5px;">${tagsHtml}</div>
                        <div style="font-size: 12px; color: var(--cadarn-cinza);">Cliente: ${sanitize(proj.cliente)} • Líder: ${sanitize(proj.lider)}</div>
                    </div>
                    <div style="font-size: 13px; color: ${statusGeral === 'concluido' ? '#47e299' : (statusGeral === 'ativo' ? '#b68aff' : '#666')}; display: flex; align-items: center; font-weight: 500; cursor:pointer;" 
                         onclick="event.stopPropagation(); filtrarPorStatus('${statusGeral}')" 
                         title="Filtrar por: ${labelStatus}">
                        <span class="status-dot dot-${statusGeral}"></span> ${labelStatus}
                    </div>
                </div>
            </div>`;
        } else {
            const cardHtml = `
            <div class="kanban-card" data-id="${sanitize(id)}" onclick="abrirProjeto('${sanitize(id)}')">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="display:flex; align-items:flex-start;">
                        ${checkboxHtml}
                        <div class="kanban-card-title">${sanitize(proj.nome)}</div>
                    </div>
                    ${slaBadge}
                </div>
                <div class="kanban-card-meta">${sanitize(proj.cliente)}</div>
                <div style="margin-top: 10px;">${tagsHtml}</div>
                <div style="margin-top: 10px; border-top: 1px solid rgba(131, 46, 255, 0.1); padding-top: 10px; font-size: 11px; color: var(--cadarn-cinza);">Líder: ${sanitize(proj.lider)}</div>
            </div>`;
            if(statusGeral === 'pendente') kanbanAguardando += cardHtml; 
            else if(statusGeral === 'ativo') kanbanAtivos += cardHtml; 
            else kanbanConcluidos += cardHtml;
        }
    }

    if (modoVisualizacao === 'list') { 
        container.innerHTML = listaNormal || '<p style="color:var(--cadarn-cinza); font-size: 13px; padding: 15px;">Nenhum projeto encontrado.</p>'; 
    } else if (modoVisualizacao === 'kanban') { 
        container.innerHTML = `
            <div class="kanban-board">
                <div class="kanban-col">
                    <div class="kanban-col-header">Aguardando <span class="status-dot dot-pendente" style="margin:0;"></span></div>
                    <div class="hub-kanban-dropzone" id="hub-col-pendente" data-status="pendente">${kanbanAguardando || '<div class="kanban-no-drag" style="color:var(--cadarn-cinza); font-size:12px;">Vazio</div>'}</div>
                </div>
                <div class="kanban-col" style="background: rgba(182, 138, 255, 0.05); border-color: rgba(182, 138, 255, 0.2);">
                    <div class="kanban-col-header" style="color: #b68aff;">Em Execução <span class="status-dot dot-ativo" style="margin:0;"></span></div>
                    <div class="hub-kanban-dropzone" id="hub-col-ativo" data-status="ativo">${kanbanAtivos || '<div class="kanban-no-drag" style="color:var(--cadarn-cinza); font-size:12px;">Vazio</div>'}</div>
                </div>
                <div class="kanban-col" style="background: rgba(71, 226, 153, 0.05); border-color: rgba(71, 226, 153, 0.2);">
                    <div class="kanban-col-header" style="color: #47e299;">Concluídos <span class="status-dot dot-concluido" style="margin:0;"></span></div>
                    <div class="hub-kanban-dropzone" id="hub-col-concluido" data-status="concluido">${kanbanConcluidos || '<div class="kanban-no-drag" style="color:var(--cadarn-cinza); font-size:12px;">Vazio</div>'}</div>
                </div>
            </div>`;
        inicializarSortableHub();
    }
    
    atualizarDashboard(); 
}

function arquivarProjeto() {
    const proj = bdProjetos[projetoAbertoAtual];
    proj.arquivado = true; 
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
    fecharProjeto(); renderMainProjects();

    showToast('Projeto movido para a lixeira.', 'warning', () => {
        proj.arquivado = false;
        localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
        renderMainProjects();
        if(navigator.onLine) { syncProjetoNuvem(projetoAbertoAtual); }
    });
    if(navigator.onLine) { syncProjetoNuvem(projetoAbertoAtual); }
}

function restaurarProjeto() {
    const proj = bdProjetos[projetoAbertoAtual];
    proj.arquivado = false; 
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
    fecharProjeto(); renderMainProjects();
    showToast('Projeto restaurado com sucesso.', 'success');
    if(navigator.onLine) { syncProjetoNuvem(projetoAbertoAtual); }
}

function restaurarProjetoDireto(id) {
    const proj = bdProjetos[id];
    proj.arquivado = false; 
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
    renderMainProjects();
    showToast('Projeto restaurado.', 'success');
    if(navigator.onLine) { syncProjetoNuvem(id); }
}

function excluirPermanente() {
    const id = projetoAbertoAtual;
    const backup = JSON.parse(JSON.stringify(bdProjetos[id]));
    delete bdProjetos[id];
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));

    fecharProjeto();
    renderMainProjects();

    let desfezAcao = false;

    // Aguarda 6 segundos antes de deletar do Firebase,
    // dando tempo para o usuário clicar em "Desfazer"
    const timerFirebase = setTimeout(() => {
        if (!desfezAcao && navigator.onLine) {
            syncProjetoNuvem(id, true);
        }
    }, 6200);

    showToast('Projeto excluído definitivamente.', 'danger', () => {
        desfezAcao = true;
        clearTimeout(timerFirebase);
        bdProjetos[id] = backup;
        localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
        if (navigator.onLine) syncProjetoNuvem(id);
        renderMainProjects();
    });
}

function capturarEstadoAtualDoPainel() {
    if(!projetoAbertoAtual) return null;
    const draft = {
        cliente: document.getElementById('edit-cliente').value,
        nome: document.getElementById('edit-titulo').value,
        lider: document.getElementById('edit-lider').value,
        desc: document.getElementById('edit-desc').value,
        licoes: document.getElementById('edit-licoes').value,
        tags: document.getElementById('edit-tags').value,
        equipe: document.getElementById('edit-equipe').value,
        equipeAntiga: document.getElementById('edit-equipe-antiga').value,
        etapas: []
    };
    const stepTitles = document.querySelectorAll('[id^="titulo-etapa-"]');
    const stepStatuses = document.querySelectorAll('[id^="status-etapa-"]');
    const stepPrazos = document.querySelectorAll('[id^="prazo-etapa-"]');
    for(let i=0; i<stepTitles.length; i++) {
        draft.etapas.push({
            titulo: stepTitles[i].value,
            status: stepStatuses[i].value,
            prazo: stepPrazos[i] ? stepPrazos[i].value : ''
        });
    }
    return draft;
}

function saveDraft() {
    if(isEditingProjeto && projetoAbertoAtual) {
        const draft = capturarEstadoAtualDoPainel();
        localStorage.setItem('cadarn_draft_' + projetoAbertoAtual, JSON.stringify(draft));
    }
}

function loadDraft() {
    if(!projetoAbertoAtual) return;
    const draftStr = localStorage.getItem('cadarn_draft_' + projetoAbertoAtual);
    if(draftStr) {
        const draft = JSON.parse(draftStr);
        document.getElementById('edit-cliente').value = draft.cliente || '';
        document.getElementById('edit-titulo').value = draft.nome || '';
        document.getElementById('edit-lider').value = draft.lider || '';
        document.getElementById('edit-desc').value = draft.desc || '';
        document.getElementById('edit-licoes').value = draft.licoes || '';
        document.getElementById('edit-tags').value = draft.tags || '';
        document.getElementById('edit-equipe').value = draft.equipe || '';
        document.getElementById('edit-equipe-antiga').value = draft.equipeAntiga || '';
        if (draft.etapas) renderEtapas(draft.etapas, true);
        showToast('Rascunho automático recuperado.', 'info');
    }
}

document.getElementById('side-panel').addEventListener('input', () => { saveDraft(); });

function adicionarEtapa() { 
    if(!projetoAbertoAtual) return;
    let estado = capturarEstadoAtualDoPainel();
    estado.etapas.push({ titulo: 'Nova Etapa', status: 'pendente', prazo: '' });
    renderEtapas(estado.etapas, true);
    saveDraft();
}

function removerEtapa(idx) { 
    if(!projetoAbertoAtual) return;
    let estado = capturarEstadoAtualDoPainel();
    estado.etapas.splice(idx, 1);
    renderEtapas(estado.etapas, true);
    saveDraft();
}

function abrirProjeto(id) {
    projetoAbertoAtual = id; const proj = bdProjetos[id];
    isEditingProjeto = false;

    document.getElementById('sp-cliente').textContent = proj.cliente; document.getElementById('sp-titulo').textContent = proj.nome; document.getElementById('sp-desc').textContent = proj.descricao;
    document.getElementById('sp-licoes').textContent = proj.licoes ? proj.licoes : 'Nenhuma lição registrada ainda.';
    
    document.getElementById('sp-lider-view').textContent = proj.lider || 'A definir';
    document.getElementById('edit-lider').value = proj.lider || '';

    document.getElementById('edit-cliente').value = proj.cliente; document.getElementById('edit-titulo').value = proj.nome; document.getElementById('edit-desc').value = proj.descricao;
    document.getElementById('edit-licoes').value = proj.licoes || '';
    document.getElementById('edit-tags').value = (proj.tags || []).join(', ');
    document.getElementById('edit-equipe').value = (proj.equipeAtual || []).join(', '); document.getElementById('edit-equipe-antiga').value = (proj.equipeAntiga || []).join(', ');

    document.getElementById('sp-tags-container').innerHTML = (proj.tags || []).map(t => `<span class="tag-pill">${sanitize(t)}</span>`).join('');
    document.getElementById('sp-equipe').innerHTML = (proj.equipeAtual || []).map(m => `<li class="team-item team-active">${sanitize(m)}</li>`).join('');
    document.getElementById('sp-equipe-antiga').innerHTML = (proj.equipeAntiga || []).map(m => `<li class="team-item team-inactive">${sanitize(m)}</li>`).join('');
    
    const leadDisplay = document.getElementById('sp-leadtime');
    if (proj.dataConclusao) { leadDisplay.innerHTML = `🏁 Concluído em ${diasEntre(proj.dataCriacao, proj.dataConclusao)} dias.`; leadDisplay.style.color = "#47e299"; } 
    else { leadDisplay.innerHTML = `⏱️ Há ${diasEntre(proj.dataCriacao, null)} dias.`; leadDisplay.style.color = "#b68aff"; }

    renderEtapas(proj.etapas, false);
    
    document.getElementById('sp-view-header').style.display = 'block'; 
    document.getElementById('sp-edit-header').style.display = 'none'; 
    document.getElementById('sp-desc').style.display = 'block'; 
    document.getElementById('edit-desc').style.display = 'none'; 
    document.getElementById('sp-tags-container').style.display = 'block'; 
    document.getElementById('edit-tags').style.display = 'none'; 
    document.getElementById('sp-equipe-container').style.display = 'block'; 
    document.getElementById('edit-equipe').style.display = 'none'; 
    document.getElementById('sp-equipe-antiga-container').style.display = 'block'; 
    document.getElementById('edit-equipe-antiga').style.display = 'none'; 
    document.getElementById('titulo-eq-antiga').style.display = 'block';
    document.getElementById('sp-licoes').style.display = 'block'; 
    document.getElementById('edit-licoes').style.display = 'none';
    document.getElementById('sp-lider-view').style.display = 'block';
    document.getElementById('edit-lider').style.display = 'none';
    
    const podeEditar = podeEditarProjeto();
    const podeDeletar = podeDeletarProjeto();

    if(proj.arquivado) {
        document.getElementById('btn-edit').style.display = 'none'; 
        document.getElementById('btn-delete').style.display = 'none'; 
        document.getElementById('btn-restore').style.display = podeDeletar ? 'block' : 'none'; 
        document.getElementById('btn-perm-delete').style.display = podeDeletar ? 'block' : 'none'; 
    } else {
        document.getElementById('btn-edit').style.display = podeEditar ? 'block' : 'none'; 
        document.getElementById('btn-delete').style.display = podeDeletar ? 'block' : 'none'; 
        document.getElementById('btn-restore').style.display = 'none'; 
        document.getElementById('btn-perm-delete').style.display = 'none'; 
    }

    document.getElementById('btn-save').style.display = 'none'; 
    document.getElementById('btn-add-etapa').style.display = 'none';
    document.getElementById('panel-overlay').classList.add('active'); document.getElementById('side-panel').classList.add('active');
}

function renderEtapas(etapas, editMode) {
    let html = ''; 
    const hojeCompare = new Date(new Date().setHours(0,0,0,0));

    (etapas || []).forEach((etapa, idx) => {
        let icone = etapa.status === 'concluido' ? '✓' : (idx + 1);
        let badge = ''; let valData = '';

        if (editMode) {
            let selectStatus = `<select class="edit-select" id="status-etapa-${idx}"><option value="pendente" ${etapa.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="ativo" ${etapa.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="concluido" ${etapa.status === 'concluido' ? 'selected' : ''}>Concluído</option></select>`;
            let inputData = `<input type="date" id="prazo-etapa-${idx}" class="edit-input" style="width: auto; padding: 4px; margin: 0 10px 0 0;" value="${etapa.prazo || ''}" title="Prazo">`;
            html += `<div class="step ${etapa.status}"><div class="step-icon">${icone}</div><div class="step-text" style="display:flex; align-items:center; width:100%; flex-wrap:wrap; gap:5px;">${inputData}<input type="text" class="edit-input" style="margin:0; padding:4px; flex-grow:1; min-width: 150px;" id="titulo-etapa-${idx}" value="${sanitize(etapa.titulo)}">${selectStatus}<button class="btn-danger" onclick="removerEtapa(${idx})">✕</button></div></div>`;
        } else {
            if (etapa.prazo && etapa.status !== 'concluido') {
                const dPrazo = new Date(etapa.prazo);
                dPrazo.setMinutes(dPrazo.getMinutes() + dPrazo.getTimezoneOffset());
                
                if (dPrazo < hojeCompare) badge = '<span class="badge-danger">Atrasado</span>';
                else if (dPrazo.getTime() === hojeCompare.getTime()) badge = '<span class="badge-warning">Vence Hoje</span>';
                valData = `<span style="font-size: 10px; color: var(--cadarn-cinza); margin-right: 8px;">[${dPrazo.toLocaleDateString('pt-BR')}]</span>`;
            }
            
            let kickoffHtml = etapa.kickoff ? `<div style="margin-top: 8px; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; font-size: 11px; color: #e2d3ff; border: 1px solid rgba(255,255,255,0.05); white-space: pre-wrap;">🔗 <strong>KICK-OFF / INSTRUÇÕES:</strong><br>${sanitize(etapa.kickoff)}</div>` : '';

            html += `
            <div class="step ${etapa.status}" style="flex-direction: column; align-items: stretch; padding: 12px;">
                <div style="display:flex; align-items:center; width:100%;">
                    <div class="step-icon">${icone}</div>
                    <div class="step-text" style="display:flex; align-items:center; width:100%; justify-content:space-between;">
                        <div>${valData}${sanitize(etapa.titulo)}${badge}</div>
                        <div style="font-size: 10px; color: var(--cadarn-cinza); font-weight: bold; text-transform:uppercase;">${sanitize(etapa.responsavel || 'Sem Dono')}</div>
                    </div>
                </div>
                ${kickoffHtml}
            </div>`;
        }
    });
    document.getElementById('sp-etapas').innerHTML = html || '<p style="color:var(--cadarn-cinza); font-size: 12px;">Nenhuma entrega mapeada ainda.</p>';
}

function iniciarEdicao() {
    isEditingProjeto = true;
    const proj = bdProjetos[projetoAbertoAtual];
    
    document.getElementById('sp-view-header').style.display = 'none'; 
    document.getElementById('sp-edit-header').style.display = 'block'; 
    document.getElementById('sp-desc').style.display = 'none'; 
    document.getElementById('edit-desc').style.display = 'block'; 
    document.getElementById('sp-tags-container').style.display = 'none'; 
    document.getElementById('edit-tags').style.display = 'block'; 
    document.getElementById('sp-equipe-container').style.display = 'none'; 
    document.getElementById('edit-equipe').style.display = 'block'; 
    document.getElementById('sp-equipe-antiga-container').style.display = 'none'; 
    document.getElementById('edit-equipe-antiga').style.display = 'block'; 
    document.getElementById('titulo-eq-antiga').style.display = 'none';
    document.getElementById('sp-licoes').style.display = 'none'; 
    document.getElementById('edit-licoes').style.display = 'block';
    document.getElementById('sp-lider-view').style.display = 'none';
    document.getElementById('edit-lider').style.display = 'block';

    document.getElementById('btn-edit').style.display = 'none'; 
    document.getElementById('btn-save').style.display = 'block'; 
    document.getElementById('btn-delete').style.display = 'block'; 
    document.getElementById('btn-add-etapa').style.display = 'block';
    
    renderEtapas(proj.etapas, true);
    loadDraft(); 
}

async function salvarEdicao() {
    const estado = capturarEstadoAtualDoPainel();
    if(!estado) return;

    const proj = bdProjetos[projetoAbertoAtual]; 

    proj.cliente = estado.cliente;
    proj.nome = estado.nome; 
    proj.lider = estado.lider.trim() || 'A definir';
    proj.descricao = estado.desc;
    proj.licoes = estado.licoes;
    proj.tags = estado.tags.split(',').map(s => s.trim()).filter(s => s);
    proj.equipeAtual = estado.equipe.split(',').map(s => s.trim()).filter(s => s); 
    proj.equipeAntiga = estado.equipeAntiga.split(',').map(s => s.trim()).filter(s => s); 
    proj.etapas = estado.etapas;

    const todasConcluidas = proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
    const eraConcluidoAntes = !!proj.dataConclusao;
    if (todasConcluidas && !proj.dataConclusao) {
        proj.dataConclusao = Date.now();
        // Dispara confete ao concluir pela primeira vez!
        if (!eraConcluidoAntes) dispararConfete();
    } else if (!todasConcluidas && proj.dataConclusao) { proj.dataConclusao = null; }
    
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
    localStorage.removeItem('cadarn_draft_' + projetoAbertoAtual); 
    
    showToast('Alterações salvas com sucesso.', 'success');

    if(navigator.onLine) { syncProjetoNuvem(projetoAbertoAtual); }
    
    isEditingProjeto = false;
    renderMainProjects(); 
    abrirProjeto(projetoAbertoAtual); 
}

function fecharProjeto() { 
    document.getElementById('panel-overlay').classList.remove('active'); 
    document.getElementById('side-panel').classList.remove('active'); 
    if(isEditingProjeto && projetoAbertoAtual) {
        saveDraft();
    }
    isEditingProjeto = false;
}

/* --- LÓGICA DO MODO APRESENTAÇÃO --- */
function startPresentation() {
    presentationSlides = Object.values(bdProjetos).filter(p => !p.arquivado && p.visivelHub && (filtroAtual === 'Todos' || (p.tags || []).includes(filtroAtual)));
    if(presentationSlides.length === 0) { showToast('Não há projetos ativos no filtro atual para apresentar.', 'warning'); return; }
    currentSlideIndex = 0; document.getElementById('presentation-modal').classList.add('active'); renderSlide();
}

function closePresentation() { document.getElementById('presentation-modal').classList.remove('active'); }
function nextSlide() { if (currentSlideIndex < presentationSlides.length - 1) { currentSlideIndex++; renderSlide(); } }
function prevSlide() { if (currentSlideIndex > 0) { currentSlideIndex--; renderSlide(); } }

function renderSlide() {
    const proj = presentationSlides[currentSlideIndex];
    const hojeCompare = new Date(new Date().setHours(0,0,0,0));
    
    let statusGeral = 'pendente'; let labelStatus = 'Aguardando'; let colorStatus = '#666';
    if (!proj.etapas) proj.etapas = [];
    const todasConcluidas = proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
    const algumaAtiva = proj.etapas.some(e => e.status === 'ativo');
    
    if (todasConcluidas) { statusGeral = 'concluido'; labelStatus = 'Concluído'; colorStatus = '#47e299'; } 
    else if (algumaAtiva) { statusGeral = 'ativo'; labelStatus = 'Em Execução'; colorStatus = '#b68aff'; }

    let leadTimeText = '';
    if (proj.dataConclusao) { leadTimeText = `🏁 ${diasEntre(proj.dataCriacao, proj.dataConclusao)} dias (Finalizado)`; } 
    else { leadTimeText = `⏱️ ${diasEntre(proj.dataCriacao, null)} dias ativos`; }

    document.getElementById('pres-client').innerText = proj.cliente;
    document.getElementById('pres-title').innerText = proj.nome;
    document.getElementById('pres-lider').innerHTML = `👤 Líder: <strong>${proj.lider}</strong>`;
    document.getElementById('pres-status').innerHTML = `🎯 Status: <strong style="color:${colorStatus}">${labelStatus}</strong>`;
    document.getElementById('pres-leadtime').innerText = leadTimeText;
    
    document.getElementById('pres-desc').innerText = proj.descricao || 'Nenhuma descrição fornecida.';
    document.getElementById('pres-licoes').innerText = proj.licoes || 'Nenhuma lição registrada.';

    let etapasHtml = '';
    proj.etapas.forEach((etapa, idx) => {
        let icone = etapa.status === 'concluido' ? '✓' : (idx + 1);
        let badge = ''; let valData = '';
        if (etapa.prazo && etapa.status !== 'concluido') {
            const dPrazo = new Date(etapa.prazo); dPrazo.setMinutes(dPrazo.getMinutes() + dPrazo.getTimezoneOffset());
            if (dPrazo < hojeCompare) badge = '<span class="badge-danger">Atrasado</span>';
            else if (dPrazo.getTime() === hojeCompare.getTime()) badge = '<span class="badge-warning">Vence Hoje</span>';
            valData = `<span style="font-size: 11px; color: var(--cadarn-cinza); margin-right: 8px;">[${dPrazo.toLocaleDateString('pt-BR')}]</span>`;
        }
        etapasHtml += `<div class="step ${etapa.status}"><div class="step-icon">${icone}</div><div class="step-text" style="display:flex; align-items:center; width:100%; font-size:16px; justify-content:space-between;"><div>${valData}${sanitize(etapa.titulo)}${badge}</div><div style="font-size: 11px; color: var(--cadarn-cinza); font-weight: bold; text-transform:uppercase;">${sanitize(etapa.responsavel || 'Sem Dono')}</div></div></div>`;
    });
    document.getElementById('pres-etapas').innerHTML = etapasHtml || '<p style="color:var(--cadarn-cinza);">Sem etapas cadastradas.</p>';

    document.getElementById('pres-counter').innerText = `${currentSlideIndex + 1} / ${presentationSlides.length}`;
    document.getElementById('pres-btn-prev').disabled = currentSlideIndex === 0;
    document.getElementById('pres-btn-next').disabled = currentSlideIndex === presentationSlides.length - 1;
}

/* --- Lógica das Notas --- */
function toggleNotes() { document.getElementById('scratchpad').classList.toggle('active'); }

document.addEventListener('click', function(event) {
    const scratchpadPanel = document.getElementById('scratchpad');
    const isClickInNotesBtn = event.target.closest('[onclick="toggleNotes()"]');
    if (scratchpadPanel && scratchpadPanel.classList.contains('active')) {
        if (!scratchpadPanel.contains(event.target) && !isClickInNotesBtn) { scratchpadPanel.classList.remove('active'); }
    }
});

/* --- REQUISIÇÃO DE NOTÍCIAS --- */
async function fetchNews() {
    const container = document.getElementById('noticias-container');
    const CACHE_KEY = 'cadarn_news_cache';
    const CACHE_TIME = 10 * 60 * 1000;

    // Tenta usar o cache primeiro
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsedCache = JSON.parse(cached);
            if (Date.now() - parsedCache.timestamp < CACHE_TIME && parsedCache.data.length > 0) {
                renderNews(parsedCache.data, container);
                renderBriefingNews(parsedCache.data);
                return;
            }
        }
    } catch { localStorage.removeItem(CACHE_KEY); }

    const feeds = [
        { name: 'Exame', url: 'https://exame.com/feed/' },
        { name: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/economia/feed/' },
        { name: 'BBC News', url: 'https://feeds.bbci.co.uk/portuguese/rss.xml' },
        { name: 'Estadão', url: 'https://www.estadao.com.br/rss/economia.xml' }
    ];

    // Busca TODOS os feeds ao mesmo tempo (paralelo = muito mais rápido)
    const resultados = await Promise.allSettled(
        feeds.map(async (f) => {
            const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}&nocache=${Date.now()}`;
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            return (d.items || []).map(i => {
                let pd = i.pubDate;
                if (pd && pd.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) pd = pd.replace(' ', 'T') + 'Z';
                return { title: i.title, link: i.link, pubDate: pd, portal: f.name };
            });
        })
    );

    const allItems = resultados
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

    if (allItems.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--cadarn-cinza); font-size:13px; margin-top:30px;">Sem notícias disponíveis no momento.</p>`;
        return;
    }

    allItems.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const finalNews = allItems.filter((v, i, a) => a.findIndex(t => t.title === v.title) === i).slice(0, 12);

    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: finalNews }));
    renderNews(finalNews, container);
    renderBriefingNews(finalNews);
}

function renderBriefingNews(newsArray) {
    const container = document.getElementById('briefing-news-list');
    if(!container) return;
    const topNews = newsArray.slice(0, 3); 
    if(topNews.length === 0) {
        container.innerHTML = '<span style="font-size:12px; color:var(--cadarn-cinza);">Nenhuma notícia recente.</span>';
        return;
    }
    container.innerHTML = topNews.map(item => `<div class="briefing-news-item"><a href="${sanitize(item.link)}" target="_blank">• ${sanitize(item.title)}</a></div>`).join('');
}

async function forceFetchNews() {
    const btn = document.getElementById('btn-refresh-news');
    const container = document.getElementById('noticias-container');
    
    if(btn) btn.classList.add('loading');
    localStorage.removeItem('cadarn_news_cache');
    
    if(container) {
        container.innerHTML = `
            <div class="skeleton-line" style="height: 15px; margin-bottom: 8px; width: 80%;"></div>
            <div class="skeleton-line" style="height: 10px; margin-bottom: 20px; width: 30%;"></div>
            <div class="skeleton-line" style="height: 15px; margin-bottom: 8px; width: 90%;"></div>
            <div class="skeleton-line" style="height: 10px; margin-bottom: 20px; width: 40%;"></div>
        `;
    }
    
    await fetchNews();
    if(btn) btn.classList.remove('loading');
}

function tempoRelativo(dataStr) {
    const agora = new Date();
    const data = new Date(dataStr);
    if (isNaN(data)) return 'Hoje';
    const diff = Math.floor((agora - data) / 1000);
    if (diff < 60)   return 'agora mesmo';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
    if (diff < 172800) return 'ontem';
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function renderNews(newsArray, containerNode) {
    containerNode.innerHTML = newsArray.map(item => {
        const tempo = tempoRelativo(item.pubDate);
        return `
            <a href="${sanitize(item.link)}" target="_blank" class="news-card" 
               data-visited="false"
               onclick="this.dataset.visited='true'; this.style.opacity='0.55'">
                <h4>${sanitize(item.title)}</h4>
                <div class="news-meta">
                    <span class="portal-flag">${sanitize(item.portal)}</span>
                    <span class="time-flag">${tempo}</span>
                </div>
            </a>`;
    }).join('');
}

fetchNews(); setInterval(fetchNews, 600000); 

/* ========================================================= */
/* EFEITO SPOTLIGHT NOS CARDS (SEGUE O MOUSE)                */
/* ========================================================= */
document.addEventListener('mousemove', (e) => {
    document.querySelectorAll('.card').forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', x + '%');
        card.style.setProperty('--mouse-y', y + '%');
    });
});
function toggleFullScreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); }
const scratchTextArea = document.getElementById('scratch-text');
function loadScratchpad() { const saved = localStorage.getItem('cadarn_notes'); if(saved) scratchTextArea.value = saved; }
scratchTextArea.addEventListener('input', () => {
    localStorage.setItem('cadarn_notes', scratchTextArea.value);

    // Mostra feedback de salvamento com hora
    const indicador = document.getElementById('notes-save-indicator');
    if (indicador) {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        indicador.textContent = `Salvo às ${hora} ✓`;
        indicador.style.color = '#47e299';
        clearTimeout(window._notesSaveTimer);
        window._notesSaveTimer = setTimeout(() => {
            indicador.textContent = 'Auto-save ativo';
            indicador.style.color = 'var(--cadarn-cinza)';
        }, 3000);
    }
});

const cmdModal = document.getElementById('cmd-modal');
const cmdInput = document.getElementById('cmd-input');
const cmdResults = document.getElementById('cmd-results');
function abrirCmd() { cmdModal.classList.add('active'); cmdInput.focus(); cmdInput.value = ''; renderCmdResults(''); }
function fecharCmd(e) { if(e.target === cmdModal) cmdModal.classList.remove('active'); }

document.addEventListener('keydown', (e) => { 
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); abrirCmd(); } 
    if (e.key === 'Escape') {
        cmdModal.classList.remove('active'); 
        const pModal = document.getElementById('presentation-modal');
        if(pModal && pModal.classList.contains('active')) closePresentation();
    }
    const presModal = document.getElementById('presentation-modal');
    if (presModal && presModal.classList.contains('active')) {
        if (e.key === 'ArrowRight') nextSlide();
        if (e.key === 'ArrowLeft') prevSlide();
    }
});

cmdInput.addEventListener('input', (e) => { renderCmdResults(e.target.value.toLowerCase()); });

function renderCmdResults(query) {
    let results = [];

    if (typeof window.LINKS_DIRETORIO !== 'undefined') {
        LINKS_DIRETORIO.forEach(link => {
            if (link.nome.toLowerCase().includes(query))
                results.push({ tipo: 'Link', nome: link.nome, action: `window.open('${link.link}', '_blank')` });
        });
    }

    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if (!proj.arquivado && proj.visivelHub) {
            const searchStr = `${proj.nome} ${proj.cliente} ${proj.descricao || ''} ${proj.licoes || ''}`.toLowerCase();
            if (searchStr.includes(query)) {
                results.push({ tipo: 'Projeto', nome: `${proj.nome} (${proj.cliente})`, action: `fecharAposBusca(); abrirProjeto('${id}')` });
            }
        }
    });

    // Contador ao vivo
    const contador = document.getElementById('cmd-contador');
    if (contador) {
        contador.textContent = query
            ? `${results.length} resultado${results.length !== 1 ? 's' : ''}`
            : `${Object.values(bdProjetos).filter(p => !p.arquivado && p.visivelHub).length} projetos ativos`;
    }

    if (results.length === 0) {
        cmdResults.innerHTML = `
            <div style="padding: 30px; text-align: center; color: var(--cadarn-cinza);">
                <div style="font-size: 32px; margin-bottom: 10px;">🔍</div>
                <div style="font-size: 13px;">Nada encontrado para "<strong style="color:white;">${query}</strong>"</div>
            </div>`;
        return;
    }
    cmdResults.innerHTML = results.map(r => `
        <div class="cmd-item" onclick="${r.action}">
            <span>${r.nome}</span>
            <span class="cmd-item-type">${r.tipo}</span>
        </div>`).join('');
}

function fecharAposBusca() { cmdModal.classList.remove('active'); }

/* ========================================================= */
/* FUNÇÕES DE RADAR E DISPONIBILIDADE (CORRIGIDAS)           */
/* ========================================================= */

function renderSLARadar() {
    let upcoming = [];
    const now = new Date();
    const limite48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    
    Object.entries(bdProjetos).forEach(([id, proj]) => {
        if(proj.arquivado || proj.visivelHub === false) return;
        (proj.etapas || []).forEach(e => {
            if(e.status !== 'concluido' && e.prazo && e.responsavel === usuarioLogado) { 
                const dPrazo = new Date(e.prazo);
                dPrazo.setMinutes(dPrazo.getMinutes() + dPrazo.getTimezoneOffset());
                
                if (dPrazo <= limite48h && dPrazo >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)) { 
                    upcoming.push({ projName: proj.nome, etapa: e.titulo, prazo: dPrazo, id: id });
                }
            }
        });
    });
    
    upcoming.sort((a,b) => a.prazo - b.prazo);
    const top3 = upcoming.slice(0, 3);
    
    const container = document.getElementById('sla-radar-list');
    if(!container) return; // Segurança caso o elemento não exista na tela

    if(top3.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:12px;">Nenhuma entrega crítica ou vencendo nas próximas 48h para você.</div>';
        return;
    }
    
    container.innerHTML = top3.map(item => {
        const isOverdue = item.prazo < new Date(now.setHours(0,0,0,0));
        const color = isOverdue ? '#ff8793' : '#ffc107';
        return `<div class="sla-item" onclick="abrirProjeto('${item.id}')">
            <span class="sla-time" style="color:${color}; width:65px;">${item.prazo.toLocaleDateString('pt-BR')}</span>
            <span class="sla-text"><strong>${sanitize(item.projName)}:</strong> ${sanitize(item.etapa)}</span>
        </div>`;
    }).join('');
}

// INÍCIO DA FUNÇÃO DE DISPONIBILIDADE
function renderTeamAvailability() {
    const workload = {};
    const hojeCompare = new Date(new Date().setHours(0,0,0,0));

    // 1. Processamento dos dados de carga de trabalho
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado) continue;
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

    // 2. Lógica de renderização
    const MAX_PROJECTS = 5; 
    const members = Object.keys(workload).map(nome => {
        return { nome, p: workload[nome].p, pct: Math.min(Math.round((workload[nome].p / MAX_PROJECTS) * 100), 100) };
    });
    
    members.sort((a, b) => b.pct - a.pct);
    const topMembers = members.slice(0, 15);

    const container = document.getElementById('teamAvailabilityContainer');
    
    if (!container) return; 

    if (topMembers.length === 0) {
        container.innerHTML = '<div style="color:var(--cadarn-cinza); font-size:12px;">Equipe sem alocações ativas no momento.</div>';
        return;
    }

    container.style.display = 'flex';
    container.style.gap = '18px'; 
    container.style.overflowX = 'auto'; 
    container.style.paddingBottom = '15px'; 

    container.innerHTML = topMembers.map(m => {
        let ringColor = m.pct >= 80 ? '#ff8793' : (m.pct >= 50 ? '#ffc107' : '#47e299');
        return `
            <div style="display:flex; flex-direction:column; align-items:center; min-width: 65px; flex-shrink: 0;">
                <div style="width: 50px; height: 50px; border-radius: 50%; background: conic-gradient(${ringColor} ${m.pct}%, rgba(255,255,255,0.05) 0); display: flex; align-items: center; justify-content: center;">
                    <div style="width: 44px; height: 44px; border-radius: 50%; background: #151515; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">
                        ${m.nome.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div style="text-align:center; margin-top: 8px;">
                    <div style="font-size:11px; color:white; font-weight:600;">${m.nome.split(' ')[0]}</div>
                    <div style="font-size:10px; color:${ringColor}; font-weight:700;">${m.pct}%</div>
                </div>
            </div>
        `;
    }).join('');
}

let kpiChartInstance = null;
function atualizarDashboard() {
    let totais = 0, ativos = 0, concluidos = 0, pendentes = 0;
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        totais++; if (!proj.etapas) proj.etapas = [];
        const todasConcluidas = proj.etapas.length > 0 && proj.etapas.every(e => e.status === 'concluido');
        const algumaAtiva = proj.etapas.some(e => e.status === 'ativo');
        if (todasConcluidas) concluidos++; else if (algumaAtiva) ativos++; else pendentes++;
    }
    document.getElementById('kpi-total').innerText = totais; document.getElementById('kpi-ativos').innerText = ativos; document.getElementById('kpi-concluidos').innerText = concluidos;
    
    // Título dinâmico da aba com alertas
    const hojeCompare2 = new Date(new Date().setHours(0,0,0,0));
    let totalAtrasados = 0;
    for (const proj of Object.values(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        (proj.etapas || []).forEach(e => {
            if (e.prazo && e.status !== 'concluido' && new Date(e.prazo) < hojeCompare2) totalAtrasados++;
        });
    }
    document.title = totalAtrasados > 0
        ? `(${totalAtrasados} ⚠️) CADARN | Hub Estratégico`
        : 'CADARN | Hub Estratégico';
    const ctx = document.getElementById('kpiChart').getContext('2d');
    const fontColor = document.body.classList.contains('light-mode') ? '#64748b' : '#a1a1aa';

    if (kpiChartInstance) { 
        kpiChartInstance.data.datasets[0].data = [ativos, concluidos, pendentes]; 
        kpiChartInstance.options.plugins.legend.labels.color = fontColor;
        kpiChartInstance.update(); 
    } else { 
        kpiChartInstance = new Chart(ctx, { 
            type: 'doughnut', 
            data: { labels: ['Em Execução', 'Concluídos', 'Aguardando'], datasets: [{ data: [ativos, concluidos, pendentes], backgroundColor: ['#b68aff', '#47e299', '#666666'], borderWidth: 0 }] }, 
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15, color: fontColor } } } } 
        }); 
    }

    renderSLARadar();
}

function setupAutocomplete(inputElement) {
    if(!inputElement) return;
    inputElement.addEventListener("input", function(e) {
        let a, b, val = this.value;
        closeAllLists();
        if (!val) { return false;}
        
        let segments = val.split(',');
        let currentSegment = segments[segments.length - 1].trim().toLowerCase();
        if(!currentSegment) return false;

        let uniqueMembers = new Set();
        Object.values(bdProjetos).forEach(p => {
            (p.equipeAtual || []).forEach(m => uniqueMembers.add(m.trim()));
            (p.equipeAntiga || []).forEach(m => uniqueMembers.add(m.trim()));
        });

        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);

        Array.from(uniqueMembers).forEach(member => {
            if (member.toLowerCase().includes(currentSegment)) {
                b = document.createElement("DIV");
                b.innerHTML = member; 
                b.innerHTML += "<input type='hidden' value='" + member + "'>";
                b.addEventListener("click", function(e) {
                    segments[segments.length - 1] = " " + this.getElementsByTagName("input")[0].value;
                    inputElement.value = segments.join(',').trim();
                    closeAllLists();
                });
                a.appendChild(b);
            }
        });
    });

    function closeAllLists(elmnt) {
        var x = document.getElementsByClassName("autocomplete-items");
        for (var i = 0; i < x.length; i++) {
            if (elmnt != x[i] && elmnt != inputElement) {
                x[i].parentNode.removeChild(x[i]);
            }
        }
    }
    document.addEventListener("click", function (e) { closeAllLists(e.target); });
}

function toggleEditProfile(forceReadonly = false) {
    const fields = document.querySelectorAll('.profile-field');
    const saveBtn = document.getElementById('btn-save-profile');
    const editBtn = document.getElementById('btn-edit-profile');
    
    if (!fields || fields.length === 0) return; 
    
    let isEditing = !fields[0].hasAttribute('readonly');
    
    if (isEditing || forceReadonly) {
        fields.forEach(f => f.setAttribute('readonly', 'true'));
        saveBtn.style.display = 'none';
        editBtn.innerText = '✏️ Editar';
        editBtn.style.color = 'var(--cadarn-roxo)';
        editBtn.style.borderColor = 'var(--cadarn-roxo)';
    } else {
        fields.forEach(f => f.removeAttribute('readonly'));
        saveBtn.style.display = 'block';
        editBtn.innerText = '✕ Cancelar';
        editBtn.style.color = '#dc3545';
        editBtn.style.borderColor = '#dc3545';
    }
}

function salvarDadosPerfilManual() {
    if(!perfilAtualNome) return;
    
    const celular = document.getElementById('profile-phone').value;
    const email = document.getElementById('profile-email').value;
    const nascimento = document.getElementById('profile-birthday').value;

    if(!configColaboradores[perfilAtualNome]) configColaboradores[perfilAtualNome] = { genero: autoDetectGender(perfilAtualNome) };
    configColaboradores[perfilAtualNome].celular = celular;
    configColaboradores[perfilAtualNome].email = email;
    configColaboradores[perfilAtualNome].nascimento = nascimento;

    localStorage.setItem('cadarn_colabs', JSON.stringify(configColaboradores));
    
    if(navigator.onLine) {
        syncColabsNuvem([perfilAtualNome]);
    }
    
    showToast('Dados de contato e aniversário salvos!', 'success');
    toggleEditProfile(true); 
}

/* --- SETUP INICIAL E EVENTOS GERAIS --- */

function updateClock() { const now = new Date(); document.getElementById('live-time').innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); document.getElementById('live-date').innerText = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).toUpperCase(); }
setInterval(updateClock, 1000); updateClock();

function getGreeting() { const hour = new Date().getHours(); if (hour >= 5 && hour < 12) return 'BOM DIA,'; if (hour >= 12 && hour < 18) return 'BOA TARDE,'; return 'BOA NOITE,'; }

function aplicarNome(nome) { 
    if(!nome) return;
    const firstName = nome.split(' ')[0]; 
    document.getElementById('display-greeting').innerText = getGreeting(); 
    document.getElementById('display-name').innerText = firstName; 
    document.getElementById('briefing-name').innerText = firstName; 
    document.getElementById('display-avatar').innerText = firstName.charAt(0).toUpperCase(); 
}
/* ========================================================= */
/* BARRA DE PROGRESSO DE CARREGAMENTO                        */
/* ========================================================= */
function criarProgressBar() {
    const bar = document.createElement('div');
    bar.id = 'progress-bar';
    document.body.prepend(bar);
    return bar;
}

function avancarProgressBar(bar, pct) {
    if (bar) bar.style.width = pct + '%';
}

function concluirProgressBar(bar) {
    if (!bar) return;
    bar.classList.add('done');
    setTimeout(() => bar.remove(), 900);
}
/* ========================================================= */
/* CONFETE DE CONCLUSÃO DE PROJETO                           */
/* ========================================================= */
function dispararConfete() {
    const cores = ['#832EFF', '#c5a3ff', '#47e299', '#ffc107', '#ff8793', '#ffffff'];
    const total = 80;
    
    for (let i = 0; i < total; i++) {
        setTimeout(() => {
            const confete = document.createElement('div');
            const cor = cores[Math.floor(Math.random() * cores.length)];
            const tamanho = Math.random() * 8 + 4;
            const startX = Math.random() * window.innerWidth;
            
            confete.style.cssText = `
                position: fixed;
                left: ${startX}px;
                top: -10px;
                width: ${tamanho}px;
                height: ${tamanho}px;
                background: ${cor};
                border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
                z-index: 999999;
                pointer-events: none;
                animation: confeteCair ${1.5 + Math.random() * 2}s ease-in forwards;
                transform: rotate(${Math.random() * 360}deg);
            `;
            document.body.appendChild(confete);
            setTimeout(() => confete.remove(), 4000);
        }, i * 30);
    }
}
/* ========================================================= */
/* RELATÓRIO DE RISCOS COM IA                                 */
/* ========================================================= */
function renderRiskReport() {
    const container = document.getElementById('risk-report-container');
    if (!container) return;

    const hoje = new Date(new Date().setHours(0, 0, 0, 0));
    const limit48h = new Date(hoje.getTime() + 48 * 60 * 60 * 1000);
    
    let alertas = [];
    let concluidos = [];

    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        
        const etapas = proj.etapas || [];
        const atrasadas = etapas.filter(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) < hoje);
        const proximas = etapas.filter(t => t.status !== 'concluido' && t.prazo && new Date(t.prazo) <= limit48h && new Date(t.prazo) >= hoje);
        const todasConcluidas = etapas.length > 0 && etapas.every(e => e.status === 'concluido');
        
        // Regra 1: 3+ tarefas atrasadas
        if (atrasadas.length >= 3) {
            alertas.push({ id, nome: proj.nome, cliente: proj.cliente, motivo: `${atrasadas.length} tarefas atrasadas`, tipo: 'critico' });
        }
        // Regra 2: deadline em 48h sem progresso
        else if (proximas.length > 0 && !etapas.some(t => t.status === 'ativo' || t.status === 'concluido')) {
            alertas.push({ id, nome: proj.nome, cliente: proj.cliente, motivo: `Deadline em 48h sem progresso`, tipo: 'atencao' });
        }
        // Projeto concluído recentemente
        else if (todasConcluidas) {
            concluidos.push({ id, nome: proj.nome, cliente: proj.cliente });
        }
    }

    if (alertas.length === 0 && concluidos.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    let html = '';
    
    alertas.forEach(a => {
        const cor = a.tipo === 'critico' ? '#dc3545' : '#ffc107';
        const bg = a.tipo === 'critico' ? 'rgba(220,53,69,0.08)' : 'rgba(255,193,7,0.08)';
        const borda = a.tipo === 'critico' ? 'rgba(220,53,69,0.3)' : 'rgba(255,193,7,0.3)';
        html += `
        <div class="risk-card" style="background:${bg}; border: 1px solid ${borda}; border-left: 4px solid ${cor}; border-radius: 12px; padding: 15px 18px; cursor: pointer; transition: 0.2s;" onclick="abrirProjeto('${a.id}')">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <span style="font-size:16px;">⚠️</span>
                <strong style="color:${cor}; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">${a.tipo === 'critico' ? 'Risco Crítico' : 'Atenção'}</strong>
            </div>
            <div style="font-weight:600; font-size:13px; color:#fff; margin-bottom:3px;">${sanitize(a.nome)}</div>
            <div style="font-size:11px; color:var(--cadarn-cinza);">${sanitize(a.cliente)} · ${sanitize(a.motivo)}</div>
        </div>`;
    });

    concluidos.slice(0,3).forEach(p => {
        html += `
        <div class="risk-card" style="background:rgba(71,226,153,0.06); border: 1px solid rgba(71,226,153,0.2); border-left: 4px solid #47e299; border-radius: 12px; padding: 15px 18px; cursor: pointer;" onclick="abrirProjeto('${p.id}')">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:5px;">
                <span style="font-size:16px;">✅</span>
                <strong style="color:#47e299; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">Concluído</strong>
            </div>
            <div style="font-weight:600; font-size:13px; color:#fff; margin-bottom:3px;">${sanitize(p.nome)}</div>
            <div style="font-size:11px; color:var(--cadarn-cinza);">${sanitize(p.cliente)}</div>
        </div>`;
    });

    container.innerHTML = html;
}
window.renderRiskReport = renderRiskReport;


/* ========================================================= */
/* HUB DE METAS — TAREFAS PENDENTES DO USUÁRIO               */
/* ========================================================= */
function renderHubMetas() {
    const container = document.getElementById('hub-metas-container');
    if (!container) return;
    
    const nomeUsuario = usuarioLogado;
    let tarefasPendentes = [];
    
    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado || proj.visivelHub === false) continue;
        (proj.etapas || []).forEach((t, idx) => {
            if (t.status === 'pendente' && t.responsavel && t.responsavel.split('(')[0].trim() === nomeUsuario) {
                tarefasPendentes.push({ ...t, projId: id, projNome: proj.nome, projCliente: proj.cliente });
            }
        });
    }
    
    // Ordena por prazo
    tarefasPendentes.sort((a, b) => {
        if (!a.prazo) return 1; if (!b.prazo) return -1;
        return new Date(a.prazo) - new Date(b.prazo);
    });
    
    if (tarefasPendentes.length === 0) {
        container.innerHTML = '<p style="color:var(--cadarn-cinza); font-size:13px; text-align:center; padding:15px;">✅ Nenhuma tarefa pendente para você no momento.</p>';
        return;
    }
    
    const hoje = new Date(new Date().setHours(0,0,0,0));
    let html = '';
    tarefasPendentes.slice(0, 8).forEach(t => {
        let prazoHtml = '';
        let prazoClass = '';
        if (t.prazo) {
            const dp = new Date(t.prazo); dp.setMinutes(dp.getMinutes() + dp.getTimezoneOffset());
            const atrasada = dp < hoje;
            const venceHoje = dp.getTime() === hoje.getTime();
            prazoClass = atrasada ? 'color:#ff8793;' : (venceHoje ? 'color:#ffc107;' : 'color:var(--cadarn-cinza);');
            prazoHtml = `<span style="font-size:11px; ${prazoClass} font-weight:600;">${atrasada ? '⚠️ ' : '📅 '}${dp.toLocaleDateString('pt-BR')}</span>`;
        }
let prazoCor = atrasada ? '#dc3545' : (venceHoje ? '#ffc107' : 'var(--border-color)');
        
        html += `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-left:3px solid ${prazoCor}; border-radius:8px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='rgba(131,46,255,0.08)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'" onclick="abrirProjeto('${t.projId}')">
            <div style="min-width:0; flex:1; padding-right:10px;">
                <div style="font-size:13px; font-weight:600; color:#fff; margin-bottom:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${sanitize(t.titulo)}</div>
                <div style="font-size:11px; color:var(--cadarn-cinza); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">📁 ${sanitize(t.projNome)}</div>
            </div>
            <div style="flex-shrink:0;">${prazoHtml}</div>
        </div>`;
    });
    
    if (tarefasPendentes.length > 8) {
        html += `<div style="text-align:center; padding-top:10px;"><span style="font-size:11px; color:var(--cadarn-cinza);">+${tarefasPendentes.length - 8} tarefas adicionais</span></div>`;
    }
    
    container.innerHTML = html;
}
window.renderHubMetas = renderHubMetas;


/* ========================================================= */
/* PROFILE POPOVER — QUICK VIEW NO AVATAR                    */
/* ========================================================= */
function mostrarProfilePopover(nomeColaborador, anchorElement) {
    fecharProfilePopover();
    
    const conf = configColaboradores[nomeColaborador] || {};
    const hoje = new Date();
    let anivHtml = '';
    if (conf.nascimento) {
        const nasc = new Date(conf.nascimento);
        anivHtml = `<div style="font-size:11px; color:var(--cadarn-cinza); margin-top:4px;">🎂 ${String(nasc.getDate()).padStart(2,'0')}/${String(nasc.getMonth()+1).padStart(2,'0')}</div>`;
    }
    
    // Projetos atuais do colaborador
    let projAtivos = [];
    for (const [id, proj] of Object.entries(bdProjetos)) {
        if (proj.arquivado) continue;
        const inTeam = (proj.equipeAtual || []).some(m => m.split('(')[0].trim() === nomeColaborador);
        const isLider = proj.lider === nomeColaborador;
        if (inTeam || isLider) projAtivos.push(proj.nome);
    }
    
    const projHtml = projAtivos.length > 0 
        ? projAtivos.slice(0,3).map(p => `<div style="font-size:11px; color:#c5a3ff; padding:3px 0; border-bottom:1px solid rgba(255,255,255,0.04);">${sanitize(p)}</div>`).join('')
        : '<div style="font-size:11px; color:var(--cadarn-cinza);">Sem projetos ativos</div>';
    
    const popover = document.createElement('div');
    popover.id = 'profile-popover';
    popover.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
            ${getAvatarHtml(nomeColaborador, 38)}
            <div>
                <div style="font-weight:700; font-size:14px; color:#fff;">${sanitize(nomeColaborador)}</div>
                ${anivHtml}
            </div>
        </div>
        <div style="font-size:10px; color:var(--cadarn-cinza); text-transform:uppercase; font-weight:700; letter-spacing:0.5px; margin-bottom:6px;">Projetos Atuais</div>
        ${projHtml}
        <button onclick="abrirPerfil('${sanitize(nomeColaborador)}'); fecharProfilePopover();" style="width:100%; margin-top:10px; padding:7px; background:rgba(131,46,255,0.15); border:1px solid rgba(131,46,255,0.3); color:#c5a3ff; border-radius:6px; cursor:pointer; font-size:11px; font-weight:600;">Ver Perfil Completo</button>
    `;
    popover.style.cssText = `
        position: fixed; z-index: 99999; 
        background: rgba(15,15,20,0.97); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 14px; padding: 16px; width: 220px;
        box-shadow: 0 20px 50px rgba(0,0,0,0.6);
        backdrop-filter: blur(20px);
        animation: fadeInUp 0.2s ease;
    `;
    document.body.appendChild(popover);
    
    const rect = anchorElement.getBoundingClientRect();
    let top = rect.bottom + 8;
    let left = rect.left - 80;
    if (left + 220 > window.innerWidth) left = window.innerWidth - 230;
    if (top + 200 > window.innerHeight) top = rect.top - 210;
    popover.style.top = top + 'px';
    popover.style.left = left + 'px';
    
    setTimeout(() => document.addEventListener('click', fecharProfilePopover, { once: true }), 100);
}

function fecharProfilePopover() {
    const p = document.getElementById('profile-popover');
    if (p) p.remove();
}

window.mostrarProfilePopover = mostrarProfilePopover;
window.fecharProfilePopover = fecharProfilePopover;


window.onload = () => {
    const progressBar = criarProgressBar();
    avancarProgressBar(progressBar, 20);

    loadTheme();
    loadScratchpad();
    renderDailyQuote();

    avancarProgressBar(progressBar, 50);

    const editEquipeEl = document.getElementById("edit-equipe");
    if (editEquipeEl) setupAutocomplete(editEquipeEl);

    if (Object.keys(bdProjetos).length > 0) {
        renderMainProjects();
        atualizarDashboard();
        avancarProgressBar(progressBar, 80);
    }

    initFirebase().then(() => {
        avancarProgressBar(progressBar, 100);
        setTimeout(() => concluirProgressBar(progressBar), 400);
    }).catch(() => concluirProgressBar(progressBar));
};

/* ========================================================= */
/* MOTOR DE DRAG AND DROP (HUB) E SELEÇÃO EM LOTE            */
/* ========================================================= */
let _sortableHubInstances = [];

function inicializarSortableHub() {
    _sortableHubInstances.forEach(s => { try { s.destroy(); } catch(e) {} });
    _sortableHubInstances = [];

    const role = window.userRole || 'Estagiário';
    const isEstagiario = role === 'Estagiário';

    document.querySelectorAll('.hub-kanban-dropzone').forEach(col => {
        const inst = new Sortable(col, {
            group: 'hub_kanban',
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.kanban-no-drag',
            disabled: isEstagiario,
            preventOnFilter: false,
            delay: 50, 
            delayOnTouchOnly: true,
            onEnd: async function (evt) {
                const id = evt.item.getAttribute('data-id');
                const novoStatus = evt.to.getAttribute('data-status');
                const proj = bdProjetos[id];

                if (proj && novoStatus) {
                    if (novoStatus === 'concluido') {
                        proj.etapas.forEach(e => e.status = 'concluido');
                        if (!proj.dataConclusao) proj.dataConclusao = Date.now();
                    } else if (novoStatus === 'ativo') {
                        if (!proj.etapas.some(e => e.status === 'ativo')) {
                            const pendente = proj.etapas.find(e => e.status === 'pendente');
                            if (pendente) pendente.status = 'ativo';
                        }
                        proj.dataConclusao = null;
                    } else { 
                        proj.etapas.forEach(e => { if (e.status === 'ativo') e.status = 'pendente'; });
                        proj.dataConclusao = null;
                    }
                    
                    showToast(`Status atualizado para ${novoStatus}`, 'success');
                    
                    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
                    
                    if (navigator.onLine && firestore.doc) {
                        try {
                            const { doc, setDoc } = firestore;
                            await setDoc(doc(db, "projetos", id), proj, { merge: true });
                        } catch(e) { console.error("Erro ao salvar:", e); }
                    }
                    
                    setTimeout(renderMainProjects, 100);
                }
            }
        });
        _sortableHubInstances.push(inst);
    });
}

function toggleHubItem(id) {
    if (selectedHubItems.has(id)) selectedHubItems.delete(id);
    else selectedHubItems.add(id);
    renderMainProjects();
}

function toggleSelectAllHub() {
    const todosVisiveisIds = Object.keys(bdProjetos).filter(id => {
        const p = bdProjetos[id];
        return !p.arquivado && p.visivelHub && (filtroAtual === 'Todos' || (p.tags || []).includes(filtroAtual));
    });

    if (selectedHubItems.size === todosVisiveisIds.length) {
        selectedHubItems.clear(); 
    } else {
        todosVisiveisIds.forEach(id => selectedHubItems.add(id)); 
    }
    renderMainProjects();
}

async function arquivarSelecionadosHub() {
    if (selectedHubItems.size === 0) return;
    const ids = Array.from(selectedHubItems);
    
    ids.forEach(id => { bdProjetos[id].arquivado = true; });
    localStorage.setItem('cadarn_projetos_db', JSON.stringify(bdProjetos));
    
    showToast(`${ids.length} projetos movidos para a lixeira.`, 'warning');
    
    if (navigator.onLine && firestore.doc) {
        try {
            await Promise.all(ids.map(id => firestore.setDoc(firestore.doc(db, "projetos", id), { arquivado: true }, { merge: true })));
        } catch(e) { console.error("Erro ao arquivar na nuvem", e); }
    }
    
    selectedHubItems.clear();
    renderMainProjects();
}

// =========================================================
// EXPORTANDO FUNÇÕES PARA O HTML ENXERGAR
// =========================================================
window.loginComGoogle = loginComGoogle;
window.logout = logout;
window.acessarAreaSocio = acessarAreaSocio;
window.abrirModalElogio = abrirModalElogio;
window.fecharModalElogio = fecharModalElogio;
window.enviarElogio = enviarElogio;
window.toggleNotes = toggleNotes;
window.fecharCmd = fecharCmd;
window.fecharPerfil = fecharPerfil;
window.toggleEditProfile = toggleEditProfile;
window.salvarDadosPerfilManual = salvarDadosPerfilManual;
window.abrirMeuPerfil = abrirMeuPerfil;
window.abrirCmd = abrirCmd;
window.toggleTheme = toggleTheme;
window.toggleFullScreen = toggleFullScreen;
window.setVisualizacao = setVisualizacao;
window.startPresentation = startPresentation;
window.forceFetchNews = forceFetchNews;
window.fecharBriefing = fecharBriefing;
window.closePresentation = closePresentation;
window.nextSlide = nextSlide;
window.prevSlide = prevSlide;
window.fecharProjeto = fecharProjeto;
window.iniciarEdicao = iniciarEdicao;
window.arquivarProjeto = arquivarProjeto;
window.restaurarProjeto = restaurarProjeto;
window.excluirPermanente = excluirPermanente;
window.salvarEdicao = salvarEdicao;
window.adicionarEtapa = adicionarEtapa;
window.removerEtapa = removerEtapa;
window.abrirProjeto = abrirProjeto;
window.setFiltro = setFiltro;
window.limparFiltroMembro = limparFiltroMembro;
window.toggleSelectModeLixeira = toggleSelectModeLixeira;
window.toggleLixeiraItem = toggleLixeiraItem;
window.deleteSelectedLixeira = deleteSelectedLixeira;
window.restaurarProjetoDireto = restaurarProjetoDireto;
window.handleDropFoto = handleDropFoto;
window.handleFileFoto = handleFileFoto;
window.renderRiskReport = renderRiskReport;
window.renderHubMetas = renderHubMetas;
window.mostrarProfilePopover = mostrarProfilePopover;
window.fecharProfilePopover = fecharProfilePopover;
window.getUserRole = getUserRole;
window.aplicarPermissoesRBAC = aplicarPermissoesRBAC;
window.podeEditarProjeto = podeEditarProjeto;
window.podeDeletarProjeto = podeDeletarProjeto;
window.podeVerDossie = podeVerDossie;
window.filtrarProjetosDestePerfil = () => {
    filtroMembro = perfilAtualNome;
    renderMainProjects();
    document.getElementById('profile-modal').classList.remove('active');
};
window.toggleHubItem = toggleHubItem;
window.toggleSelectAllHub = toggleSelectAllHub;
window.arquivarSelecionadosHub = arquivarSelecionadosHub;
