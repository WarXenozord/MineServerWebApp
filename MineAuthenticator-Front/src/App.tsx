import { useState } from "react";
import axios from 'axios';
import "./App.css";

function App() {
  const [user,setUser] = useState('');
  const [pass, setPass] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setStatus("");
    try {
      const res = await axios.post("/api/login", {
        username: user,
        password: pass,
      });
      if (res.data && res.data.ok) {
        setStatus("✅ Bem vindo — Iniciando Servidor...");
      } else {
        setStatus("❌ Falha no Login: Login Inválido");
      }
    } catch (err) {
      setStatus("❌ Falha no Login: Erro no Servidor");
    } finally {
      setLoading(false);
    }
}

  return (
    <>
      <div className="panel">
        <h1>Bora de Mine?</h1>
        <h2>Faz Login aí pra nós jogar!</h2>
        <form onSubmit={submit}>
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
        <div className="status">{status}</div>
        <div className="pixel">2025 - Juan Libonatti</div>
      </div>
    </>
  );
}

export default App;
