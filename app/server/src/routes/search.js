const express = require('express');
const Book = require('../models/Book');

const router = express.Router();

// VULN-001 : injection NoSQL.
// Le paramètre `q` de l'utilisateur est interpolé dans un opérateur `$where`.
// Exemple d'exploitation : GET /api/search?q=1;return true
// Un attaquant peut exfiltrer toute la base ou faire exécuter du JS côté serveur.
// Remède : utiliser une regex échappée / une recherche textuelle, jamais $where.

router.get('/', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'missing query param q' });

  // eslint-disable-next-line security/detect-non-literal-regexp
  const books = await Book.find({ $where: `this.title.includes('${q}')` });
  res.json(books);
});

module.exports = router;
