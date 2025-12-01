import dotenv from "dotenv";
dotenv.config({
  path: process.env.NODE_ENV === "production" ? "/etc/ms/.env" : "./.env",
});

import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import crypto from "crypto"; // 👈 added
import { fileURLToPath } from "url";
import {
  blockMiddleware,
  clientIpFromReq,
  checkHoneypot,
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from "./Util/blocker.js";
import { 
  getServerStatus,
  authorizePlayer
 } from "./Util/serverManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logDir = path.join(__dirname, "Logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const PORT = process.env.PORT || 4000;
const USERS_FILE = process.env.USERS_FILE || "users.json";
const TOKEN_EXPIRE_TIME = process.env.TOKEN_EXPIRE_TIME || 5 * 60 * 1000; // default 5 min
const TOKEN_CLEANUP_TIME = process.env.TOKEN_CLEANUP_TIME || 60 * 60 * 1000; // default 1 hour
const SUBPAGE = process.env.SUBPAGE || 'PlayMinecraft';
const API_BASE = SUBPAGE + "/api";

const app = express();
app.use(bodyParser.json());
app.use(blockMiddleware);
app.use(express.static(path.join(__dirname, "public")));

// ---- TEMP TOKEN STORAGE ----
// key = `${ip}:${username}` → { token, expire }
const tempTokens = new Map();

// Cleanup expired tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of tempTokens.entries()) {
    if (data.expire <= now) tempTokens.delete(key);
  }
}, TOKEN_CLEANUP_TIME);

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch (e) {
    return {};
  }
}

// ---- LOGIN ----
app.post('/' + API_BASE + "/login", async (req, res) => {
  const { username, password } = req.body || {};
  const ip = clientIpFromReq(req);

  const hp = checkHoneypot(req, ip);
  if (hp.tripped) return res.status(401).json({ ok: false, error: "invalid" });

  const rate = checkRateLimit(username, ip);
  if (!rate.ok) return res.status(429).json({ ok: false, error: rate.reason });

  const users = loadUsers();
  const userHash = users[username];
  if (!userHash) {
    recordFailedAttempt(username, ip);
    return res.status(401).json({ ok: false, error: "invalid" });
  }

  try {
    const match = await bcrypt.compare(password, userHash);
    if (!match) {
      recordFailedAttempt(username, ip);
      return res.status(401).json({ ok: false, error: "invalid" });
    }

    // --- SUCCESS ---
    recordSuccessfulLogin(username, ip);
    await getServerStatus(); // TODO: Start the server in a better way
    // How to solve this: create a three way endpoint: first login, then status 
    // and when client see status = ok, it fires the authorize
    const authorization = await authorizePlayer(ip, username);
    if(!authorization.ok)
      return res.status(500).json({ ok: false, error: authorization.error });

    const key = `${ip}:${username}`;
    const existing = tempTokens.get(key);
    const now = Date.now();

    // Reuse valid existing token if still active
    if (existing && existing.expire > now) {
      return res.json({
        ok: true,
        message: "logged",
        token: existing.token,
        expires_in: Math.floor((existing.expire - now) / 1000),
      });
    }

    // Otherwise, generate a new one
    const token = generateToken();
    tempTokens.set(key, { token, expire: now + TOKEN_EXPIRE_TIME });

    return res.json({
      ok: true,
      message: "logged",
      token
    });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ ok: false, error: "server" });
  }
});

// ---- TOKEN VALIDATION MIDDLEWARE ----
function requireToken(req, res, next) {
  const ip = clientIpFromReq(req);
  const token = req.headers["x-auth-token"];

  // You can optionally include username in the request header if needed
  const username = req.headers["x-username"];
  if (!username) return res.status(401).json({ ok: false, error: "missing-username" });

  const key = `${ip}:${username}`;
  const entry = tempTokens.get(key);

  if (!entry || entry.token !== token || entry.expire <= Date.now()) {
    tempTokens.delete(key);
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  next();
}

// ---- STATUS ENDPOINT ----
app.get('/' + API_BASE + "/status", requireToken, async (req, res) => {
  const result = await getServerStatus();
  res.json(result);
});

// ---- SPA fallback ----
app.use('/' + SUBPAGE, express.static(path.join(__dirname, '..', 'Client', 'dist')));
app.get(new RegExp(`^/${SUBPAGE}(/.*)?$`), (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'Client', 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`mine-server-app listening on ${PORT}`));
