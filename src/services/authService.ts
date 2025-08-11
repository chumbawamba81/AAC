import { supabase } from '../supabaseClient';

// Função de registo
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) throw error;

  return data;
}

// Função de login com verificação de email confirmado
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  // Bloqueia login se o email não estiver confirmado
  if (data.user && !data.user.confirmed_at) {
    await supabase.auth.signOut();
    throw new Error('Por favor, confirma o teu email antes de fazer login.');
  }

  return data;
}

// Função de logout
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
