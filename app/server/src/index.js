const express = require('express');
const mongoose = require('mongoose');

const config = require('./config');
const books = require('./routes/books');
const search = require('./routes/search');
const auth = require('./routes/auth');

const app = express();
app.use(express.json());

function connectDB(retries = 10, delay = 3000) {
  mongoose
    .connect(config.mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('[db] connected'))
    .catch((err) => {
      console.error(`[db] connection error (${retries} left):`, err.message);
      if (retries > 0) setTimeout(() => connectDB(retries - 1, delay), delay);
    });
}
connectDB();

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api/books', books);
app.use('/api/search', search);
app.use('/api/auth', auth);

const port = config.port || 3000;
app.listen(port, () => console.log(`[app] listening on :${port}`));
