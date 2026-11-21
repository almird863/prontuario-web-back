const mongoose = require("mongoose");

// Atalho para campos de texto simples (tira espaços sobrando)
const texto = () => ({ type: String, trim: true });

// O select do formulário envia "" quando nada é escolhido; guardamos como "sem valor"
const vazioParaNada = (valor) => valor || undefined;

const pacienteSchema = new mongoose.Schema(
  {
    // Identificação
    psicologoId: { type: mongoose.Schema.Types.ObjectId, ref: "Psicologo", required: true, immutable: true },
    nome: { type: String, required: [true, "O nome é obrigatório."], trim: true },
    nomeSocial: texto(),
    dataNascimento: { type: Date, required: [true, "A data de nascimento é obrigatória."] },
    cpf: texto(),
    genero: {
      type: String,
      enum: ["feminino", "masculino", "nao-binario", "transgenero", "outro", "nao-informado"],
      set: vazioParaNada,
    },
    estadoCivil: {
      type: String,
      enum: ["solteiro", "casado", "separado", "viuvo"],
      set: vazioParaNada,
    },
    escolaridade: texto(),
    profissao: texto(),

    // Contato
    telefone: { type: String, required: [true, "O telefone é obrigatório."], trim: true },
    email: { type: String, trim: true, lowercase: true },

    endereco: {
      cep: texto(),
      logradouro: texto(),
      numero: texto(),
      complemento: texto(),
      bairro: texto(),
      cidade: texto(),
      uf: { type: String, trim: true, uppercase: true, maxlength: 2 },
    },

    // Responsável legal (para menores) e emergência
    responsavel: {
      nome: texto(),
      parentesco: texto(),
      cpf: texto(),
      telefone: texto(),
    },
    emergencia: {
      nome: texto(),
      parentesco: texto(),
      telefone: texto(),
    },

    // Informações clínicas iniciais
    queixa: texto(),
    encaminhamento: texto(),
    dataInicio: { type: Date },
    medicacao: texto(),
    tratamentosAnteriores: texto(),
    historicoFamiliar: texto(),
    observacoes: texto(),

    // Consentimento
    consentimento: {
      aceito: {
        type: Boolean,
        required: [true, "É preciso registrar o consentimento do paciente."],
        validate: {
          validator: (valor) => valor === true,
          message: "É preciso registrar o consentimento do paciente.",
        },
      },
      data: { type: Date },
    },

    // Situação do acompanhamento
    status: {
      type: String,
      enum: ["ativo", "pausa", "alta", "arquivado"],
      default: "ativo",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Paciente", pacienteSchema);