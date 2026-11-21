const express = require("express");
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");
const Evolucao = require("../models/Evolucao");

// mergeParams: enxerga o ":id" do paciente, que vem da URL de montagem
// (/api/pacientes/:id/evolucoes)
const router = express.Router({ mergeParams: true });

const CAMPOS_TEXTO = ["resumo", "observacoes", "proximosPassos"];
const MODALIDADES = ["presencial", "online", "hibrido"];
const PRESENCAS = ["compareceu", "faltou", "desmarcou"];

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------
// Confere se o paciente existe E é do psicólogo logado
function acharPaciente(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Paciente.findOne({ _id: req.params.id, psicologoId: req.session.psicologoId }).select("_id");
}

// Busca uma evolução do paciente, só se for do psicólogo logado
function acharEvolucao(req) {
  if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.evolucaoId)) {
    return null;
  }
  return Evolucao.findOne({
    _id: req.params.evolucaoId,
    pacienteId: req.params.id,
    psicologoId: req.session.psicologoId,
  });
}

// Copia para a evolução só os campos permitidos que vieram no corpo da requisição.
// Campos ausentes não são alterados. Devolve uma mensagem de erro, ou null se estiver tudo certo.
function aplicarCampos(evolucao, corpo = {}) {
  for (const campo of CAMPOS_TEXTO) {
    if (typeof corpo[campo] === "string") evolucao[campo] = corpo[campo];
  }

  if (corpo.dataSessao !== undefined) {
    const data = typeof corpo.dataSessao === "string" ? new Date(corpo.dataSessao) : new Date(NaN);
    if (Number.isNaN(data.getTime())) return "Data da sessão inválida.";
    evolucao.dataSessao = data;
  }

  if (corpo.duracaoMin !== undefined) {
    if (corpo.duracaoMin === "" || corpo.duracaoMin === null) {
      evolucao.duracaoMin = undefined; // campo limpo
    } else {
      const minutos = Number(corpo.duracaoMin);
      if (!Number.isInteger(minutos) || minutos < 1 || minutos > 480) {
        return "A duração precisa ser de 1 a 480 minutos.";
      }
      evolucao.duracaoMin = minutos;
    }
  }

  if (corpo.modalidade !== undefined) {
    if (corpo.modalidade === "" || corpo.modalidade === null) {
      evolucao.modalidade = undefined;
    } else if (MODALIDADES.includes(corpo.modalidade)) {
      evolucao.modalidade = corpo.modalidade;
    } else {
      return "Modalidade inválida.";
    }
  }

  if (corpo.presenca !== undefined) {
    if (!PRESENCAS.includes(corpo.presenca)) return "Presença inválida.";
    evolucao.presenca = corpo.presenca;
  }

  return null;
}

function responderErro(erro, res) {
  if (erro.name === "ValidationError") {
    return res.status(400).json({ mensagem: Object.values(erro.errors)[0].message });
  }
  console.error(erro);
  res.status(500).json({ mensagem: "Erro interno do servidor." });
}

const NAO_ENCONTRADA = { mensagem: "Evolução não encontrada." };

// ---------------------------------------------------------------------------
// Rotas
// ---------------------------------------------------------------------------

// Listar as evoluções do paciente (mais recente primeiro; inclui rascunhos)
router.get("/", async (req, res) => {
  try {
    const paciente = await acharPaciente(req);
    if (!paciente) return res.status(404).json({ mensagem: "Paciente não encontrado." });

    const evolucoes = await Evolucao.find({
      pacienteId: paciente._id,
      psicologoId: req.session.psicologoId,
    }).sort({ dataSessao: -1 });

    res.json(evolucoes);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Criar uma evolução (sempre nasce como rascunho)
router.post("/", async (req, res) => {
  try {
    const paciente = await acharPaciente(req);
    if (!paciente) return res.status(404).json({ mensagem: "Paciente não encontrado." });

    const evolucao = new Evolucao({
      pacienteId: paciente._id,
      psicologoId: req.session.psicologoId,
      dataSessao: new Date(), // se o corpo trouxer uma data, ela substitui esta
    });

    const problema = aplicarCampos(evolucao, req.body);
    if (problema) return res.status(400).json({ mensagem: problema });

    await evolucao.save();
    res.status(201).json(evolucao);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Ler uma evolução
router.get("/:evolucaoId", async (req, res) => {
  try {
    const evolucao = await acharEvolucao(req);
    if (!evolucao) return res.status(404).json(NAO_ENCONTRADA);

    res.json(evolucao);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Editar um rascunho (é a rota do salvamento automático)
router.put("/:evolucaoId", async (req, res) => {
  try {
    const evolucao = await acharEvolucao(req);
    if (!evolucao) return res.status(404).json(NAO_ENCONTRADA);

    if (evolucao.status === "finalizada") {
      return res.status(409).json({ mensagem: "Evolução finalizada não pode ser editada. Acrescente um adendo." });
    }

    const problema = aplicarCampos(evolucao, req.body);
    if (problema) return res.status(400).json({ mensagem: problema });

    await evolucao.save();
    res.json(evolucao);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Finalizar: a evolução fica travada. Se o corpo trouxer campos, eles são salvos antes,
// para o último texto digitado não se perder.
router.post("/:evolucaoId/finalizar", async (req, res) => {
  try {
    const evolucao = await acharEvolucao(req);
    if (!evolucao) return res.status(404).json(NAO_ENCONTRADA);

    if (evolucao.status === "finalizada") {
      return res.status(409).json({ mensagem: "Esta evolução já foi finalizada." });
    }

    const problema = aplicarCampos(evolucao, req.body);
    if (problema) return res.status(400).json({ mensagem: problema });

    if (!evolucao.resumo) {
      return res.status(400).json({ mensagem: "Escreva o resumo da sessão antes de finalizar." });
    }

    evolucao.status = "finalizada";
    evolucao.finalizadaEm = new Date();

    await evolucao.save();
    res.json(evolucao);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Acrescentar um adendo (só em evolução finalizada)
router.post("/:evolucaoId/adendos", async (req, res) => {
  try {
    const evolucao = await acharEvolucao(req);
    if (!evolucao) return res.status(404).json(NAO_ENCONTRADA);

    if (evolucao.status !== "finalizada") {
      return res.status(409).json({ mensagem: "Só é possível acrescentar adendo a uma evolução finalizada." });
    }

    if (typeof req.body?.texto !== "string") {
      return res.status(400).json({ mensagem: "O texto do adendo é obrigatório." });
    }

    evolucao.adendos.push({ texto: req.body.texto });

    await evolucao.save();
    res.status(201).json(evolucao);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Descartar um rascunho (evolução finalizada nunca é apagada)
router.delete("/:evolucaoId", async (req, res) => {
  try {
    const evolucao = await acharEvolucao(req);
    if (!evolucao) return res.status(404).json(NAO_ENCONTRADA);

    if (evolucao.status === "finalizada") {
      return res.status(409).json({ mensagem: "Evoluções finalizadas não podem ser excluídas." });
    }

    await evolucao.deleteOne();
    res.json({ mensagem: "Rascunho descartado." });
  } catch (erro) {
    responderErro(erro, res);
  }
});

module.exports = router;