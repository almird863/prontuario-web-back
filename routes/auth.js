const express = require("express");
const bcrypt = require("bcrypt");
const { rateLimit } = require("express-rate-limit");
const Psicologo = require("../models/Psicologo");
const exigirLogin = require("../middlewares/exigirLogin");

const router = express.Router();

// Limita tentativas: 10 erros a cada 15 minutos por IP (os acertos não contam).
// Protege contra quem tenta adivinhar senhas no login.
const limiteTentativas = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { mensagem: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});

// Cadastro: no máximo 5 contas por hora por IP (aqui contam também as que dão certo),
// para ninguém criar contas sem parar.
const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: { mensagem: "Muitos cadastros deste endereço. Tente novamente mais tarde." },
});

// Confere se todos os valores são textos preenchidos.
// Importante: impede que alguém envie um objeto no lugar do e-mail para enganar o banco.
function textos(...valores) {
  return valores.every((v) => typeof v === "string" && v.trim() !== "");
}

// Criar conta
router.post("/cadastro", limiteCadastro, async (req, res) => {
  try {
    const { nome, crp, email, senha } = req.body || {};

    if (!textos(nome, crp, email, senha)) {
      return res.status(400).json({ mensagem: "Preencha todos os campos." });
    }
    // O limite de 72 existe porque o bcrypt ignora o que passa disso
    if (senha.length < 8 || senha.length > 72) {
      return res.status(400).json({ mensagem: "A senha precisa ter entre 8 e 72 caracteres." });
    }

    const senhaHash = await bcrypt.hash(senha, 12);
    await Psicologo.create({ nome, crp, email, senhaHash });

    res.status(201).json({ mensagem: "Conta criada." });
  } catch (erro) {
    if (erro.code === 11000) {
      return res.status(409).json({ mensagem: "Já existe uma conta com este e-mail ou CRP." });
    }
    if (erro.name === "ValidationError") {
      return res.status(400).json({ mensagem: Object.values(erro.errors)[0].message });
    }
    console.error(erro);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
});

// Entrar
router.post("/login", limiteTentativas, async (req, res) => {
  try {
    const { email, senha } = req.body || {};

    if (!textos(email, senha)) {
      return res.status(400).json({ mensagem: "Informe o e-mail e a senha." });
    }

    // .select("+senhaHash") pede o hash de propósito, já que ele vem escondido por padrão
    const psicologo = await Psicologo.findOne({ email: email.trim().toLowerCase() }).select("+senhaHash");
    const senhaCorreta = psicologo ? await bcrypt.compare(senha, psicologo.senhaHash) : false;

    // Mesma mensagem para e-mail inexistente e senha errada (não revela quais e-mails existem)
    if (!psicologo || !senhaCorreta || !psicologo.ativo) {
      return res.status(401).json({ mensagem: "E-mail ou senha incorretos." });
    }

    // Cria uma sessão nova ao entrar (evita que uma sessão antiga seja reaproveitada)
    req.session.regenerate((erro) => {
      if (erro) {
        console.error(erro);
        return res.status(500).json({ mensagem: "Erro interno do servidor." });
      }

      req.session.psicologoId = String(psicologo._id);
      req.session.save(() => {
        res.json({ psicologo: { nome: psicologo.nome, crp: psicologo.crp, email: psicologo.email } });
      });
    });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
});

// Sair
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("prontuario.sid");
    res.json({ mensagem: "Sessão encerrada." });
  });
});

// Quem está logado (o front usa para mostrar o nome e saber se a sessão ainda vale)
router.get("/eu", exigirLogin, async (req, res) => {
  try {
    const psicologo = await Psicologo.findById(req.session.psicologoId);

    if (!psicologo || !psicologo.ativo) {
      return req.session.destroy(() => {
        res.status(401).json({ mensagem: "Faça login para continuar." });
      });
    }

    res.json({ psicologo: { nome: psicologo.nome, crp: psicologo.crp, email: psicologo.email } });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
});

module.exports = router;