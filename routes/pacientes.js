const express = require("express");
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");

const router = express.Router();

// Escolhe, campo a campo, o que aceitamos do front. Tudo o que não estiver aqui
// (como "status" ou "_id") é ignorado, mesmo que alguém envie.
function dadosDoPaciente(corpo = {}) {
  const e = corpo.endereco || {};
  const r = corpo.responsavel || {};
  const em = corpo.emergencia || {};
  const c = corpo.consentimento || {};

  return {
    nome: corpo.nome,
    nomeSocial: corpo.nomeSocial,
    dataNascimento: corpo.dataNascimento,
    cpf: corpo.cpf,
    genero: corpo.genero,
    estadoCivil: corpo.estadoCivil,
    escolaridade: corpo.escolaridade,
    profissao: corpo.profissao,

    telefone: corpo.telefone,
    email: corpo.email,
    endereco: {
      cep: e.cep,
      logradouro: e.logradouro,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      cidade: e.cidade,
      uf: e.uf,
    },

    responsavel: {
      nome: r.nome,
      parentesco: r.parentesco,
      cpf: r.cpf,
      telefone: r.telefone,
    },
    emergencia: {
      nome: em.nome,
      parentesco: em.parentesco,
      telefone: em.telefone,
    },

    queixa: corpo.queixa,
    encaminhamento: corpo.encaminhamento,
    dataInicio: corpo.dataInicio,
    medicacao: corpo.medicacao,
    tratamentosAnteriores: corpo.tratamentosAnteriores,
    historicoFamiliar: corpo.historicoFamiliar,
    observacoes: corpo.observacoes,

    consentimento: {
      aceito: c.aceito,
      data: c.data || undefined, // quem decide a data padrão é a rota
    },
  };
}

// Resposta de erro padrão das rotas
function responderErro(erro, res) {
  if (erro.name === "ValidationError") {
    // Devolve só a primeira mensagem, sem o texto técnico em volta
    const primeira = Object.values(erro.errors)[0].message;
    return res.status(400).json({ mensagem: primeira });
  }
  console.error(erro);
  res.status(500).json({ mensagem: "Erro interno do servidor." });
}

// Transforma "jose" numa expressão que também encontra "José", "JOSÉ" etc.
function regexSemAcento(texto) {
  const letras = {
    a: "[aàáâãäå]",
    e: "[eèéêë]",
    i: "[iìíîï]",
    o: "[oòóôõö]",
    u: "[uùúûü]",
    c: "[cç]",
    n: "[nñ]",
  };

  const semAcento = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const seguro = semAcento.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // protege caracteres especiais
  const padrao = seguro.replace(/[aeioucn]/gi, (letra) => letras[letra.toLowerCase()]);

  return new RegExp(padrao, "i");
}

const STATUS_VALIDOS = ["ativo", "pausa", "alta", "arquivado"];

// Criar paciente
router.post("/", async (req, res) => {
  try {
    const dados = dadosDoPaciente(req.body);
    dados.consentimento.data = dados.consentimento.data || new Date(); // sem data informada, vale hoje

    const paciente = await Paciente.create({ ...dados, psicologoId: req.session.psicologoId });
    res.status(201).json(paciente);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Listar pacientes (com busca, filtro de situação e ordem)
router.get("/", async (req, res) => {
  try {
    const condicoes = [];

    // Busca por nome, nome social ou CPF
    const busca = String(req.query.busca || "").trim().slice(0, 100);
    if (busca) {
      const alternativas = [{ nome: regexSemAcento(busca) }, { nomeSocial: regexSemAcento(busca) }];

      // O CPF está salvo com pontos e traço; aqui a busca ignora a pontuação
      const digitos = busca.replace(/\D/g, "");
      if (digitos.length >= 3) {
        alternativas.push({ cpf: new RegExp(digitos.split("").join("\\D*")) });
      }

      condicoes.push({ $or: alternativas });
    }

    // Situação. Pacientes antigos, sem o campo "status", contam como ativos.
    const status = String(req.query.status || "");
    if (status === "ativo") {
      condicoes.push({ $or: [{ status: "ativo" }, { status: { $exists: false } }] });
    } else if (STATUS_VALIDOS.includes(status)) {
      condicoes.push({ status });
    }

    const filtro = {
      psicologoId: req.session.psicologoId,
      ...(condicoes.length > 0 ? { $and: condicoes } : {}),
    };

    // Ordem. Qualquer valor desconhecido cai na ordem alfabética.
    const ordem = req.query.ordem === "cadastro" ? { createdAt: -1 } : { nome: 1 };

    const pacientes = await Paciente.find(filtro)
      .sort(ordem)
      .collation({ locale: "pt" }); // ordena "Álvaro" junto com o A, ignorando acentos

    res.json(pacientes);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Buscar um paciente pelo id
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    const paciente = await Paciente.findById(req.params.id);

    if (!paciente) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    res.json(paciente);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Editar paciente
router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    const paciente = await Paciente.findById(req.params.id);

    if (!paciente) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    const dados = dadosDoPaciente(req.body);

    // Se o front não enviou outra data de consentimento, mantém a original
    dados.consentimento.data = dados.consentimento.data || paciente.consentimento?.data;

    paciente.set(dados);
    await paciente.save(); // o save confere as regras do modelo (nome obrigatório etc.)

    res.json(paciente);
  } catch (erro) {
    responderErro(erro, res);
  }
});

module.exports = router;