const express = require("express");
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");
const Prontuario = require("../models/Prontuario");
const Evolucao = require("../models/Evolucao");
const Psicologo = require("../models/Psicologo");

// mergeParams: faz este arquivo enxergar o ":id" do paciente, que vem da URL de montagem
// (/api/pacientes/:id/prontuario)
const router = express.Router({ mergeParams: true });

// Campos de texto do resumo que o front pode salvar
const CAMPOS_RESUMO = ["demandaInicial", "historicoRelevante", "hipoteseFormulacao", "observacoes"];

// Confere se o paciente existe E é do psicólogo logado. Senão, devolve null.
function acharPaciente(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Paciente.findOne({ _id: req.params.id, psicologoId: req.session.psicologoId }).select("_id");
}

// Devolve o prontuário do paciente. Na primeira vez que é aberto, cria um vazio.
async function obterOuCriar(paciente, psicologoId) {
  const existente = await Prontuario.findOne({ pacienteId: paciente._id, psicologoId });
  if (existente) return existente;

  try {
    return await Prontuario.create({ pacienteId: paciente._id, psicologoId });
  } catch (erro) {
    // Duas requisições criaram ao mesmo tempo: a segunda só lê o que já existe
    if (erro.code === 11000) return Prontuario.findOne({ pacienteId: paciente._id, psicologoId });
    throw erro;
  }
}

function responderErro(erro, res) {
  if (erro.name === "ValidationError") {
    return res.status(400).json({ mensagem: Object.values(erro.errors)[0].message });
  }
  console.error(erro);
  res.status(500).json({ mensagem: "Erro interno do servidor." });
}

// Ler o prontuário
router.get("/", async (req, res) => {
  try {
    const paciente = await acharPaciente(req);
    if (!paciente) return res.status(404).json({ mensagem: "Paciente não encontrado." });

    const prontuario = await obterOuCriar(paciente, req.session.psicologoId);
    res.json(prontuario);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Salvar o resumo clínico.
// Só altera os campos que vierem no corpo da requisição: quem não enviar um campo
// não apaga o que já estava salvo nele.
router.put("/", async (req, res) => {
  try {
    const paciente = await acharPaciente(req);
    if (!paciente) return res.status(404).json({ mensagem: "Paciente não encontrado." });

    const prontuario = await obterOuCriar(paciente, req.session.psicologoId);

    for (const campo of CAMPOS_RESUMO) {
      if (typeof req.body?.[campo] === "string") {
        prontuario[campo] = req.body[campo];
      }
    }

    await prontuario.save(); // confere as regras do modelo (limite de tamanho)
    res.json(prontuario);
  } catch (erro) {
    responderErro(erro, res);
  }
});

// Tudo o que o PDF precisa, numa chamada só: dados do paciente, resumo clínico e as
// evoluções FINALIZADAS (rascunhos ficam de fora), da mais antiga para a mais recente.
// Esta rota só lê: não cria o prontuário se ele ainda não existir.
router.get("/completo", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    const psicologoId = req.session.psicologoId;
    const paciente = await Paciente.findOne({ _id: req.params.id, psicologoId });

    if (!paciente) return res.status(404).json({ mensagem: "Paciente não encontrado." });

    const [prontuario, evolucoes, psicologo] = await Promise.all([
      Prontuario.findOne({ pacienteId: paciente._id, psicologoId }),
      Evolucao.find({ pacienteId: paciente._id, psicologoId, status: "finalizada" }).sort({ dataSessao: 1 }),
      Psicologo.findById(psicologoId).select("nome crp"),
    ]);

    res.json({
      psicologo: psicologo ? { nome: psicologo.nome, crp: psicologo.crp } : null,
      paciente,
      prontuario, // pode ser null se o prontuário nunca foi aberto
      evolucoes,
      geradoEm: new Date(),
    });
  } catch (erro) {
    responderErro(erro, res);
  }
});

module.exports = router;