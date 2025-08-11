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

// Função de login
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

// Função de logout
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
