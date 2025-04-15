require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient } = require('mongodb');
const dns = require('dns');
const urlparser = require('url');

const client = new MongoClient(process.env.DB_URL);
const port = process.env.PORT || 3000;

// Configure o CORS para permitir todas as origens explicitamente
app.use(cors({ origin: '*' }));

// Middleware para fazer o parse do body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Conecta ao MongoDB e define a coleção "urls"
let urls;
client.connect((err) => {
  if (err) {
    console.error('Erro ao conectar com o MongoDB:', err);
  } else {
    const db = client.db('urlshortener');
    urls = db.collection('urls');
    console.log("Conectado ao MongoDB");
  }
});

/*
  POST /api/shorturl
  - Verifica se a URL inicia com "http://" ou "https://".
  - Extrai o hostname usando urlparser.parse.
  - Usa dns.lookup(hostname, callback) para checar se o domínio resolve.
  - Se válido, conta os documentos na coleção para definir o next short_url,
    insere o documento e retorna { original_url, short_url }.
  - Se inválido, retorna { error: 'invalid url' }.
*/
app.post('/api/shorturl', (req, res) => {
  const original_url = req.body.url;

  // Verifica se a URL inicia com "http://" ou "https://"
  const urlRegex = /^(https?:\/\/)/;
  if (!urlRegex.test(original_url)) {
    return res.json({ error: 'invalid url' });
  }

  const hostname = urlparser.parse(original_url).hostname;
  if (!hostname) {
    return res.json({ error: 'invalid url' });
  }

  // Usa dns.lookup para verificar se o domínio existe
  dns.lookup(hostname, (err, address) => {
    if (err || !address) {
      return res.json({ error: 'invalid url' });
    } else {
      // Conta os documentos para definir o próximo short_url
      urls.countDocuments({}, (err, count) => {
        if (err) {
          return res.json({ error: 'server error' });
        }
        const short_url = count + 1;
        const doc = { original_url, short_url };
        urls.insertOne(doc, (err, result) => {
          if (err) {
            return res.json({ error: 'server error' });
          }
          return res.json({ original_url, short_url });
        });
      });
    }
  });
});

/*
  GET /api/shorturl/:short_url
  - Procura no banco o documento com o short_url recebido.
  - Se encontrado, redireciona para a URL original.
  - Se não encontrado, retorna { error: 'No URL found for this short URL' }.
*/
app.get('/api/shorturl/:short_url', (req, res) => {
  const short_url = Number(req.params.short_url);
  urls.findOne({ short_url }, (err, doc) => {
    if (err || !doc) {
      return res.json({ error: 'No URL found for this short URL' });
    }
    return res.redirect(doc.original_url);
  });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
