import express from 'express';
import bodyParser from 'body-parser';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Convert ES module URL to a file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up ports and DB
const PORT = process.env.PORT || 4000;
const USERS_FILE = path.join(__dirname, 'users.json');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch (e) {
    return {};
  }
}


app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ ok: false, error: "missing" });

  const hashes = loadUsers();
  const userHash = hashes[username];
  if (!userHash) return res.status(401).json({ ok: false, error: "invalid" });

  try {
    const match = await bcrypt.compare(password, userHash);
    if (!match) return res.status(401).json({ ok: false, error: "invalid" });
    // Success — return a simple session token (in-memory) or boolean. For now return success.
    return res.json({ ok: true, message: "logged" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "server" });
  }
});


// fallback for SPA routes
app.use(express.static(path.join(__dirname, '..', 'MineAuthenticator-Front', 'dist')));
app.get(/.*/, (req, res) => {
res.sendFile(path.join(__dirname,'..', 'MineAuthenticator-Front', 'dist', 'index.html'));
});


app.listen(PORT, () => console.log(`mine-server-app listening on ${PORT}`))