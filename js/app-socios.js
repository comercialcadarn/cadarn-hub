// Lista de acessos VIP (A mesma lista, replicada aqui para a trava forte da página)
const emailsSocios = [
    'debora.yuan@cadarnconsultoria.com.br',
    'felipe.penido@cadarnconsultoria.com.br',
    'leonardo.assis@cadarnconsultoria.com.br',
    'juliana.deoracki@cadarnconsultoria.com.br',
    'victor.mendes@cadarnconsultoria.com.br'
];

async function initSegurancaSocios() {
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

    // GATEKEEPER: Bloqueia a porta se entrar com URL direta
    onAuthStateChanged(auth, (user) => {
        if (!user || !emailsSocios.includes(user.email)) {
            // Intruso! Redireciona imediatamente
            window.location.href = 'index.html';
        } else {
            // Acesso liberado: Mostra o conteúdo
            document.getElementById('conteudo-restrito').style.display = 'block';
            inicializarKanbanUI();
        }
    });
}

function inicializarKanbanUI() {
    const colunas = [
        document.getElementById('col-negociacao'),
        document.getElementById('col-ativos'),
        document.getElementById('col-concluidos')
    ];

    colunas.forEach(coluna => {
        new Sortable(coluna, {
            group: 'kanban_socios', // Todos fazem parte do mesmo grupo (permite arrastar entre eles)
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                const itemEl = evt.item; 
                const toList = evt.to;
                
                const projetoId = itemEl.getAttribute('data-id');
                const novoStatus = toList.getAttribute('data-status');

                console.log(`Projeto ID: ${projetoId} arrastado para: ${novoStatus}`);
                // TODO: Na próxima fase, aqui enviaremos o update para o Firestore
            },
        });
    });
}

// Inicia a checagem assim que a tela abre
initSegurancaSocios();
