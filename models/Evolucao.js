const mongoose = require("mongoose");

const textoLongo = () => ({
  type: String,
  trim: true,
  maxlength: [10000, "Texto longo demais (máximo de 10.000 caracteres)."],
});

// Adendo: texto acrescentado a uma evolução já finalizada (corrige ou complementa)
const adendoSchema = new mongoose.Schema({
  texto: {
    type: String,
    required: [true, "O texto do adendo é obrigatório."],
    trim: true,
    maxlength: [5000, "Adendo longo demais (máximo de 5.000 caracteres)."],
  },
  criadoEm: { type: Date, default: Date.now },
});

const evolucaoSchema = new mongoose.Schema(
  {
    // Quem é o dono e de qual paciente é (o prontuário é o do paciente)
    psicologoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Psicologo",
      required: true,
      immutable: true,
    },
    pacienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paciente",
      required: true,
      immutable: true,
    },

    // Dados da sessão
    dataSessao: { type: Date, required: [true, "A data da sessão é obrigatória."] },
    duracaoMin: {
      type: Number,
      min: [1, "A duração precisa ser de 1 a 480 minutos."],
      max: [480, "A duração precisa ser de 1 a 480 minutos."],
    },
    modalidade: { type: String, enum: ["presencial", "online", "hibrido"] },
    presenca: { type: String, enum: ["compareceu", "faltou", "desmarcou"], default: "compareceu" },

    // Conteúdo
    resumo: textoLongo(),
    observacoes: textoLongo(),
    proximosPassos: textoLongo(),

    // Fluxo: rascunho (editável) -> finalizada (travada; correções viram adendos)
    status: { type: String, enum: ["rascunho", "finalizada"], default: "rascunho" },
    finalizadaEm: { type: Date },

    adendos: [adendoSchema],
  },
  { timestamps: true }
);

// Linha do tempo de um paciente: da sessão mais recente para a mais antiga
evolucaoSchema.index({ pacienteId: 1, dataSessao: -1 });

module.exports = mongoose.model("Evolucao", evolucaoSchema);