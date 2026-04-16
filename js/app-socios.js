// js/app-socios.js

const emailsSocios = [
    'debora.yuan@cadarnconsultoria.com.br',
    'felipe.penido@cadarnconsultoria.com.br',
    'leonardo.assis@cadarnconsultoria.com.br',
    'juliana.deoracki@cadarnconsultoria.com.br',
    'victor.mendes@cadarnconsultoria.com.br'
];

async function initSegurancaSocios() {
    try {
        console.log("1. Inicializando segurança da página de Sócios...");
        
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
        const { getAuth, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");

        const firebaseConfig = {
            apiKey: "AIzaSyAnClCbOU3JRBehpGvrKj8RrcS86lyl3gg",
            authDomain: "cadarn-hub.firebaseapp.com",
            projectId: "cadarn-hub",
            storageBucket: "cadarn-hub.firebasestorage.app",
            messagingSenderId: "1078276499614",
            appId: "1:1078276499614:web:135e544d9c26e3bd2f338f"
        };

        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);

        console.log("2. Verificando identidade do usuário...");

        // GATEKEEPER: Verifica a porta
        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Força o e-mail para minúsculo para evitar bugs do Google
                const emailFormatado = user.email.toLowerCase().trim();
                console.log("3. Usuário detectado:", emailFormatado);

                if (emailsSocios.includes(emailFormatado)) {
                    console.log("4. ACESSO PERMITIDO! Carregando Kanban...");
                    document.getElementById('conteudo-restrito').style.display = 'block';
                    inicializarKanbanUI();
                } else {
                    console.error("4. INTRUSO! E-mail não autorizado.");
                    alert("Acesso restrito aos Sócios. Você será redirecionado.");
                    window.location.href = 'index.html';
                }
            } else {
                console.error("3. Ninguém logado. Redirecionando para o Início...");
                window.location.href = 'index.html';
            }
        });

    } catch (error) {
        console.error("ERRO GRAVE na inicialização:", error);
    }
}

function inicializarKanbanUI() {
    const colunas = [
        document.getElementById('col-negociacao'),
        document.getElementById('col-ativos'),
        document.getElementById('col-concluidos')
    ];

    colunas.forEach(coluna => {
        // Trava contra Crash: Só aplica o Drag-and-Drop se a coluna existir no HTML
        if (coluna) {
            new Sortable(coluna, {
                group: 'kanban_socios', 
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: function (evt) {
                    const itemEl = evt.item; 
                    const toList = evt.to;
                    
                    const projetoId = itemEl.getAttribute('data-id');
                    const novoStatus = toList.getAttribute('data-status');

                    console.log(`✅ Movimento de Sócio - Projeto: ${projetoId} -> Status: ${novoStatus}`);
                },
            });
        } else {
            console.warn("Aviso: Uma das colunas do Kanban não foi encontrada no HTML da página.");
        }
    });
}

// Roda tudo
initSegurancaSocios();
