import { supabase } from '../supabaseClient';

/**
 * Service functions to handle user authentication via Supabase.
 *
 * The signUp function will create a new user account and trigger an
 * email confirmation. The signIn function will authenticate the user
 * and return session information only if the email has been confirmed.
 * The signOut function logs the user out of the current session.
 */

// Register a new user with email/password. Supabase will send a
// confirmation email automatically when email confirmations are enabled.
export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    throw error;
  }
  return data;
}

// Authenticate a user with email/password. This function checks that the
// email has been confirmed; if not, it signs the user out and throws an error.
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  // If the user exists but has not confirmed their email, force a sign-out
  if (data.user && !data.user.confirmed_at) {
    await supabase.auth.signOut();
    throw new Error('Por favor, confirma o teu email antes de fazer login.');
  }
  return data;
}

// Sign out the current user.
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}