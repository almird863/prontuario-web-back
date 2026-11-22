const express = require("express");
const mongoose = require("mongoose");
const Paciente = require("../models/Paciente");

// mergeParams: enxerga o ":id" do paciente, que vem da URL de montagem
// (/api/pacientes/:id/status)
const router = express.Router({ mergeParams: true });

const STATUS_VALIDOS = ["ativo", "pausa", "alta", "arquivado"];

// Alterar a situação do paciente. Arquivar é só trocar a situação para "arquivado":
// nada é apagado, e o paciente pode ser reativado a qualquer momento.
router.put("/", async (req, res) => {
  try {
    const status = req.body?.status;

    if (typeof status !== "string" || !STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({ mensagem: "Situação inválida." });
    }

    // Id inválido ou de paciente de outro psicólogo: "não encontrado" nos dois casos
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    // findOneAndUpdate muda SÓ a situação. (Usar .save() revalidaria o cadastro inteiro,
    // e pacientes antigos, sem consentimento ou telefone, não poderiam mudar de situação.)
    const paciente = await Paciente.findOneAndUpdate(
      { _id: req.params.id, psicologoId: req.session.psicologoId },
      { status },
      { new: true }
    );

    if (!paciente) {
      return res.status(404).json({ mensagem: "Paciente não encontrado." });
    }

    res.json({ _id: paciente._id, status: paciente.status });
  } catch (erro) {
    console.error(erro);
    res.status(500).json({ mensagem: "Erro interno do servidor." });
  }
});

module.exports = router;