// Protege rotas: só passa quem já fez login.
// Nas rotas protegidas, o id de quem está logado fica em req.session.psicologoId.
function exigirLogin(req, res, next) {
  if (!req.session.psicologoId) {
    return res.status(401).json({ mensagem: "Faça login para continuar." });
  }
  next();
}

module.exports = exigirLogin;