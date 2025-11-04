import { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

interface ServerStatus {
  ok: boolean;
  ip?: string;
  players?: string[];
}

function App() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverInfo, setServerInfo] = useState<ServerStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus("");
    setServerInfo(null);

    const form = e.currentTarget;
    const hp = (form as HTMLFormElement).website?.value || ""; // honeypot

    try {
      const res = await axios.post("/api/login", {
        username: user,
        password: pass,
        website: hp,
      });

      if (res.data && res.data.ok) {
        setStatus("✅ Bem vindo — Iniciando Servidor...");
        setChecking(true);
        setToken(res.data.token); // 🔐 store temporary token
      }
    } catch (err: any) {
      if (err.response) {
        if (err.response.status === 401) {
          setStatus("❌ Falha no Login: Login Inválido");
        } else if (err.response.status === 400) {
          setStatus("⚠️ Dados faltando — preencha tudo.");
        } else if (err.response.status === 429) {
          setStatus("🚨 Limite Atingido: Tente Novamente em 1 Hora");
        } else {
          setStatus("❌ Falha no Login: Erro no Servidor");
        }
      } else {
        setStatus("❌ Falha no Login: Sem conexão com o servidor");
      }
    } finally {
      setLoading(false);
    }
  }

  // ---- POLL SERVER STATUS ----
  useEffect(() => {
    if (!checking || !token) return;

    async function checkServer() {
      try {
        const res = await axios.get<ServerStatus>("/api/status", {
          headers: {
            "x-auth-token": token,
            "x-username": user, // required by backend middleware
          },
        });

        if (res.data.ok) {
          setServerInfo(res.data);
          setChecking(false);
          setStatus("✅ Servidor Online!");
        } else {
          setStatus("⏳ Servidor iniciando...");
        }
      } catch (err: any) {
        // handle 401 -> token expired
        if (err.response && err.response.status === 401) {
          setStatus("⚠️ Autenticação Expirada — Faça login novamente.");
          setChecking(false);
          setToken(null);
          setServerInfo(null);
        } else {
          setStatus("⏳ Servidor iniciando...");
        }
      }
    }

    // Run once immediately, then every 10s
    checkServer();
    const interval = setInterval(checkServer, 10000);
    return () => clearInterval(interval);
  }, [checking, token, user]);

  return (
    <>
      <div className="panel">
        <h1>Bora de Mine?</h1>
        <h2>Faz Login aí pra nós jogar!</h2>

        {!serverInfo && (
          <form onSubmit={submit}>
            <div style={{ display: "none" }} aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                autoComplete="off"
                tabIndex={-1}
              />
            </div>
            <label>Usuário</label>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder=""
            />
            <label>Senha</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder=""
            />
            <button disabled={loading}>{loading ? "..." : "LOGIN"}</button>
          </form>
        )}

        <div className="status">
          {status}
          {checking && (
            <div className="spinner" style={{ marginTop: "10px" }}></div>
          )}
        </div>

        {serverInfo && (
          <div className="server-info">
            <h3>🌐 IP do Servidor:</h3>
            <p className="ip">{serverInfo.ip}</p>
            <h3>👥 Jogadores Online:</h3>
            {serverInfo.players && serverInfo.players.length !== 0 ? (
              <ul>
                {serverInfo.players.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="ip">Sem Jogadores - Seja o Primeiro 🤩</p>
            )}
            <p className="tip">
              Copie o IP acima, cole no Minecraft e boa jogatina! 🎮
            </p>
          </div>
        )}

        <div className="pixel">2025 - Juan Libonatti</div>
      </div>
    </>
  );
}

export default App;