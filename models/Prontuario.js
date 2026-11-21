const mongoose = require("mongoose");

// Texto longo do resumo clínico (limite para ninguém salvar um arquivo inteiro por engano)
const textoLongo = () => ({
  type: String,
  trim: true,
  maxlength: [10000, "Texto longo demais (máximo de 10.000 caracteres)."],
});

const prontuarioSchema = new mongoose.Schema(
  {
    // Dono do prontuário (repetido aqui para toda consulta poder filtrar por psicólogo)
    psicologoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Psicologo",
      required: true,
      immutable: true,
    },

    // Ligação com o paciente: um prontuário por paciente.
    // O prontuário NÃO copia dados do cadastro, só guarda o id do paciente.
    pacienteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Paciente",
      required: true,
      immutable: true,
      unique: true,
    },

    // Resumo clínico
    demandaInicial: textoLongo(),
    historicoRelevante: textoLongo(),
    hipoteseFormulacao: textoLongo(),
    observacoes: textoLongo(),
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prontuario", prontuarioSchema);