const express = require('express');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ message: 'hello from the clean fixture' });
});

router.post('/echo', (req, res) => {
  const name = String(req.body.name || 'world').slice(0, 80);
  res.json({ message: `hello ${name}` });
});

module.exports = router;
