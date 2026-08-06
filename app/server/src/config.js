// Fichier de configuration central de l'application.
//
// VULN-002 : secret en dur dans le code source.
// Cette clé ne doit JAMAIS être commitée. Elle doit vivre dans un vault
// (Jenkins Credentials en V2) et être injectée via variable d'environnement.
// Pour la démo V0, elle est volontairement présente pour être détectée
// par SemGrep (V0) puis Gitleaks (V1).

const apiKey = 'AKIAIOSFODNN7EXAMPLE';

module.exports = {
  port: 3000,
  mongoUri: 'mongodb://localhost:27017/devsecops',
  apiKey,
  dbPassword: 'admin123',
};
