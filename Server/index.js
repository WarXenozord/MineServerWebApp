import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '/etc/ms/.env' : './.env' });

import express from "express";
import bodyParser from "body-parser";
import bcrypt from "bcrypt";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  blockMiddleware,
  clientIpFromReq,
  checkHoneypot,
  checkRateLimit,
  recordFailedAttempt,
  recordSuccessfulLogin,
} from "./Util/blocker.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const USERS_FILE = process.env.USERS_FILE || "users.json";

const app = express();
app.use(bodyParser.json());
app.use(blockMiddleware);
app.use(express.static(path.join(__dirname, "public")));

function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE));
  } catch (e) {
    return {};
  }
}

// ---- STATE SIMULATION ----
let serverBooting = false;
let serverOnline = false;
let bootStartTime = 0;

// Simulate a fake Minecraft server that takes ~15s to start
function simulateServerStart() {
  serverBooting = true;
  serverOnline = false;
  bootStartTime = Date.now();

  setTimeout(() => {
    serverBooting = false;
    serverOnline = true;
  }, 15000);
}

// ---- LOGIN ----
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  const ip = clientIpFromReq(req);

  // --- Honeypot check ---
  const hp = checkHoneypot(req, ip);
  if (hp.tripped) {
    // respond like normal failure
    return res.status(401).json({ ok: false, error: "invalid" });
  }

  // --- Brute-force rate limiter ---
  const rate = checkRateLimit(username, ip);
  if (!rate.ok) {
    return res.status(429).json({ ok: false, error: rate.reason });
  }

  // --- User verification ---
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

    // Success
    recordSuccessfulLogin(username, ip);
    if (!global.serverBooting && !global.serverOnline) simulateServerStart();

    return res.json({ ok: true, message: "logged" });
  } catch (err) {
    console.error("login error", err);
    return res.status(500).json({ ok: false, error: "server" });
  }
});

// ---- STATUS ENDPOINT ----
app.get("/api/status", (req, res) => {
  if (serverOnline) {
    return res.json({
      ok: true,
      ip: "192.168.0.42:22564",
      players: [],
    });
  }

  if (serverBooting) {
    const elapsed = ((Date.now() - bootStartTime) / 1000).toFixed(1);
    return res.json({ ok: false, message: `booting (${elapsed}s elapsed)` });
  }

  return res.json({ ok: false, message: "server offline" });
});

// ---- SPA fallback ----
app.use(
  express.static(path.join(__dirname, "..", "MineAuthenticator-Front", "dist"))
);
app.get(/.*/, (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "MineAuthenticator-Front", "dist", "index.html")
  );
});

app.listen(PORT, () => console.log(`mine-server-app listening on ${PORT}`));
