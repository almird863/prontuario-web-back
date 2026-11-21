const mongoose = require("mongoose");

const psicologoSchema = new mongoose.Schema(
  {
    nome: { type: String, required: [true, "O nome é obrigatório."], trim: true },
    crp: { type: String, required: [true, "O CRP é obrigatório."], trim: true, unique: true },
    email: {
      type: String,
      required: [true, "O e-mail é obrigatório."],
      trim: true,
      lowercase: true, // "Ana@x.com" e "ana@x.com" são a mesma conta
      unique: true,
    },

    // Nunca guardamos a senha, só o "hash" (uma versão embaralhada que não tem volta).
    // select: false = o campo não vem nas consultas, a menos que seja pedido de propósito.
    senhaHash: { type: String, required: true, select: false },

    ativo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Psicologo", psicologoSchema);