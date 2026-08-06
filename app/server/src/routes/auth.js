const express = require('express');
const config = require('../config');

const router = express.Router();

// VULN-001 (variante) : bypass d'authentification par injection NoSQL.
// Les entrées `username`/`password` de l'utilisateur sont insérées telles
// quelles dans le filtre Mongoose. Exploitation classique :
//   POST /api/auth/login  { "username": { "$ne": "" }, "password": { "$ne": "" } }
// → le filtre `{ username: { $ne: "" }, password: { $ne: "" } }` matche
//   n'importe quel utilisateur existant, sans connaître le mot de passe.
// Remède : valider que les entrées sont des chaînes (typeof === 'string'),
//   comparer le hash avec bcrypt, jamais passer l'objet brut au filtre.

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const db = require('mongoose').connection;
  const user = await db.collection('users').findOne({
    username,
    password,
  });

  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  res.json({ token: `fake-jwt-${user._id}`, secret: config.apiKey });
});

module.exports = router;
