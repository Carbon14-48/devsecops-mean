const express = require('express');
const path = require('path');

const hello = require('./routes/hello');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/hello', hello);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`[app] listening on :${port}`));
