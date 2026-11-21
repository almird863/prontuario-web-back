require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const session = require("express-session");
const connectMongo = require("connect-mongo");
const exigirLogin = require("./middlewares/exigirLogin");

// Se der erro em "MongoStore.create", a versão instalada exporta de outro jeito: me avise.
const MongoStore = connectMongo.default ?? connectMongo;

// Sem este valor no .env o login não funciona com segurança: melhor parar já.
if (!process.env.SESSION_SECRET) {
  console.error("Falta SESSION_SECRET no arquivo .env");
  process.exit(1);
}

const app = express();

// credentials: true permite que o navegador envie o cookie de sessão
app.use(
  cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500", "https://almird863.github.io",],
    credentials: true,
  })
);
app.use(express.json());

// Sessão: guarda quem está logado. Fica salva no MongoDB e expira após 30 min sem uso.
app.use(
  session({
    name: "prontuario.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // só cria sessão depois do login
    rolling: true, // cada requisição renova o prazo
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, ttl: 30 * 60 }),
    cookie: {
      httpOnly: true, // o JavaScript da página não consegue ler o cookie
      sameSite: "none",
      secure: true, // em produção (com HTTPS) isso passa a ser true
      maxAge: 60 * 60 * 1000,
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

    app.listen(3000, () => {
      console.log("Servidor rodando em http://localhost:3000");
    });
  } catch (erro) {
    console.error("Não foi possível conectar ao MongoDB:", erro.message);
  }
}

iniciar();