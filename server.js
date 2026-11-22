require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const session = require("express-session");
const connectMongo = require("connect-mongo");
const exigirLogin = require("./middlewares/exigirLogin");

// Se der erro em "MongoStore.create", a versão instalada exporta de outro jeito: me avise.
const MongoStore = connectMongo.default ?? connectMongo;

// Sem estes valores o login não funciona com segurança: melhor parar já.
if (!process.env.SESSION_SECRET || !process.env.MONGO_URI) {
  console.error("Faltam SESSION_SECRET e/ou MONGO_URI nas variáveis de ambiente.");
  process.exit(1);
}

const app = express();

// O Render define RENDER=true sozinho; NODE_ENV=production também vale.
const emProducao = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER);

// Endereços de onde o front pode chamar a API (sem barra no final)
const origensPermitidas = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://almird863.github.io",
];

// IMPORTANTE: no Render, o HTTPS termina no proxy deles e chega até o Node como HTTP comum.
// Sem esta linha, o Express acha que a conexão é insegura e NÃO envia o cookie "secure":
// o login é aceito, mas a sessão nunca chega ao navegador.
app.set("trust proxy", 1);

// credentials: true permite que o navegador envie o cookie de sessão
app.use(cors({ origin: origensPermitidas, credentials: true }));
app.use(express.json());

// Proteção contra CSRF. Com sameSite "none", o cookie também viaja a partir de outros sites,
// então só aceitamos pedidos que alteram dados se vierem do nosso front.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const origem = req.get("Origin");
  if (origensPermitidas.includes(origem)) return next();

  // Postman e curl não enviam Origin: liberados só fora de produção
  if (!origem && !emProducao) return next();

  res.status(403).json({ mensagem: "Requisição não autorizada." });
});

// Sessão: guarda quem está logado. Fica salva no MongoDB e expira após 30 min sem uso.
const TEMPO_SESSAO_MS = 30 * 60 * 1000;

app.use(
  session({
    name: "prontuario.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // só cria sessão depois do login
    rolling: true, // cada requisição renova o prazo
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, ttl: TEMPO_SESSAO_MS / 1000 }),
    cookie: {
      httpOnly: true, // o JavaScript da página não consegue ler o cookie
      // Em produção, o front (github.io) e a API (onrender.com) são sites diferentes:
      // o cookie precisa de sameSite "none" e secure (HTTPS). No seu computador, "lax" basta.
      sameSite: emProducao ? "none" : "lax",
      secure: emProducao,
      maxAge: TEMPO_SESSAO_MS, // igual ao ttl acima: cookie e sessão no banco expiram juntos
    },
  })
);

app.get("/api/saude", (req, res) => {
  const conectado = mongoose.connection.readyState === 1;
  res.json({ status: "ok", banco: conectado ? "conectado" : "desconectado" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/pacientes/:id/prontuario", exigirLogin, require("./routes/prontuario")); // prontuário de um paciente
app.use("/api/pacientes/:id/evolucoes", exigirLogin, require("./routes/evolucoes")); // sessões de um paciente
app.use("/api/pacientes", exigirLogin, require("./routes/pacientes")); // só para quem está logado

async function iniciar() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB conectado.");

    // O Render define a porta na variável PORT
    const porta = process.env.PORT || 3000;
    app.listen(porta, () => {
      console.log(`Servidor rodando na porta ${porta}`);
    });
  } catch (erro) {
    console.error("Não foi possível conectar ao MongoDB:", erro.message);
  }
}

iniciar();