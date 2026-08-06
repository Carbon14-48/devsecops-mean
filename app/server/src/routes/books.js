const express = require('express');
const _ = require('lodash');

const Book = require('../models/Book');

const router = express.Router();

// VULN-003 (usage) : lodash@4.17.15 est une version vulnérable
// (CVE-2019-10744, prototype pollution via defaultsDeep).
// La version est épinglée volontairement dans package.json pour
// que npm audit / Trivy la remontent.

router.get('/', async (_req, res) => {
  const books = await Book.find();
  res.json(books.map((b) => b.toObject()));
});

router.post('/', async (req, res) => {
  const attrs = _.pick(req.body, ['title', 'author', 'year', 'price']);
  const book = await Book.create(attrs);
  res.status(201).json(book);
});

router.get('/:id', async (req, res) => {
  const book = await Book.findById(req.params.id);
  if (!book) return res.status(404).json({ error: 'not found' });
  res.json(book);
});

router.delete('/:id', async (req, res) => {
  await Book.findByIdAndDelete(req.params.id);
  res.status(204).end();
});

module.exports = router;
