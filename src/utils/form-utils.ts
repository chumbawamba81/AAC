// Validações e utilitários usados nos formulários.

/**
 * Valida códigos postais portugueses no formato ####-###. O campo é
 * convertido para string e espaços extra são removidos antes de
 * validar. Retorna true apenas quando o código corresponde ao
 * formato exacto.
 */
export function isValidPostalCode(pt: string): boolean {
  return /^\d{4}-\d{3}$/.test(pt.trim());
}

/**
 * Validação de NIF português. Um NIF válido tem nove dígitos e a
 * soma ponderada dos oito primeiros com pesos decrescentes determina
 * o dígito de controlo. Retorna true apenas quando o NIF é
 * composto por nove dígitos e o dígito de controlo calculado
 * coincide com o último dígito.
 */
export function isValidNIF(nif: string): boolean {
  const m = nif.match(/^\d{9}$/);
  if (!m) return false;
  const n = nif.split('').map(Number);
  const c = n.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const v = 11 - (c % 11);
  const check = v >= 10 ? 0 : v;
  return check === n[8];
}