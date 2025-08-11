
import React, { useState, useEffect } from 'react';
import { signIn, signUp, signOut } from './services/authService';
import { supabase } from './supabaseClient';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verifica se há sessão ativa
    const session = supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
      }
      setLoading(false);
    });

    // Subscreve alterações de autenticação
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const data = await signIn(email, password);
      setUser(data.user);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleRegister = async () => {
    try {
      await signUp(email, password);
      alert('Conta criada! Confirma o teu email antes de fazer login.');
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUser(null);
  };

  if (loading) return <p>A carregar...</p>;

  if (!user) {
    return (
      <div className="login-page">
        <h2>Login</h2>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button onClick={handleLogin}>Entrar</button>
        <button onClick={handleRegister}>Registar</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header>
        <h1>AAC-SB</h1>
        <button onClick={handleLogout}>Sair</button>
      </header>
      {/* Aqui vem todo o teu conteúdo existente da aplicação */}
    </div>
  );
}

export default App;
