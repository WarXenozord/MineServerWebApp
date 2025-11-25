import dotenv from "dotenv";
dotenv.config({ path: process.env.NODE_ENV === "production" ? "/etc/ms/.env" : "./.env" });

import fs from "fs";
import fetch from "node-fetch";
import crypto from "crypto";
import { invokeStartServerLambda } from "./lambdaCaller.js";

const STATE_FILE = "./Logs/lastServer.json";
const MAX_LAMBDA_CALLS_PER_DAY = process.env.MAX_LAMBDA_CALLS_PER_DAY || 20;
const PORT = process.env.API_PORT
const AUTH_SECRET = process.env.AUTH_SECRET || "dev-super-secret"; 

let lastKnownIp = null;
let lambdaCallsToday = 0;
let lastCallDay = new Date().getDate();
let serverStarting = false;

// --- Load persisted IP if available ---
try {
  if (fs.existsSync(STATE_FILE)) {
    const data = JSON.parse(fs.readFileSync(STATE_FILE));
    lastKnownIp = data.ip || null;
    lambdaCallsToday = data.lambdaCallsToday || 0;
    lastCallDay = data.lastCallDay || new Date().getDate();
  }
} catch {
  console.warn("[ServerManager] No lastServer.json yet, starting fresh");
}

// --- Persist state ---
function saveState() {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify({ ip: lastKnownIp, lambdaCallsToday, lastCallDay }, null, 2)
  );
}

// --- Try to reach the Minecraft server ---
async function checkServer(ip) {
  const controller = new AbortController();
  const timeoutMs = 4000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${ip}:${PORT}/status`, {
      signal: controller.signal,
      // Node 18+ option to kill slow TL handshake:
      dispatcher: new Agent({ connect: { timeout: timeoutMs } })
    });

    if (!res.ok) return null;
    return await res.json();

  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getServerStatus() {
  // Reset daily counter
  const today = new Date().getDate();
  if (today !== lastCallDay) {
    lambdaCallsToday = 0;
    lastCallDay = today;
  }

  if (serverStarting) {
    console.log("[ServerManager] Server is starting...");
    return { status: "booting", ip: lastKnownIp };
  }
 
  // Try existing IP
  if (lastKnownIp) {
    const status = await checkServer(lastKnownIp);
    if (status && status.ok) {
      return { status: "online", ip: lastKnownIp+":"+status.port, players: status.players };
    }
  }

  // Otherwise, trigger Lambda if below limit
  if (lambdaCallsToday >= MAX_LAMBDA_CALLS_PER_DAY) {
    console.warn("[ServerManager] Lambda limit reached for today");
    return { status: "error", message: "Lambda call limit reached", ip: lastKnownIp };
  }

  try {
    serverStarting = true;
    const result = await invokeStartServerLambda();

    if (!result || !result.ip) throw new Error("Lambda returned no IP");
    lastKnownIp = result.ip;
    lambdaCallsToday++;
    saveState();

    // Wait/poll until online
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 10000));
      const status = await checkServer(lastKnownIp);
      if (status && status.ok) {
        serverStarting = false;
        return { status: "online", ip: lastKnownIp+":"+status.port, players: status.players };
      }
    }

    serverStarting = false;
    return { status: "booting", ip: lastKnownIp };
  } catch (err) {
    console.error("[ServerManager] Lambda failed:", err.message);
    serverStarting = false;
    return { status: "error", message: err.message, ip: lastKnownIp };
  }
}

export async function authorizePlayer(ip, username) {
  const url = `http://${lastKnownIp}:${PORT}/authorize`;
  const body = JSON.stringify({ ip, username });
  const timestamp = Date.now().toString();

  // Create HMAC signature: HMAC_SHA256(secret, timestamp + ":" + body)
  const signature = crypto
    .createHmac("sha256", AUTH_SECRET)
    .update(`${timestamp}:${body}`)
    .digest("hex");

  try {
    console.log(url);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-timestamp": timestamp,
        "x-signature": signature,
      },
      body,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Authorization failed");

    console.log(`[AuthServer] Authorized ${username}@${ip} -> ${data.message}`);
    return { ok: true, response: data };
  } catch (err) {
    console.error(`[AuthServer] Failed to authorize ${username}@${ip}:`, err.message);
    return { ok: false, error: err.message };
  }
}