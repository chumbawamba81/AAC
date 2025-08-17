export function isValidPostalCode(pt: string): boolean {
  return /^\d{4}-\d{3}$/.test(pt.trim());
}

export function isValidNIF(nif: string): boolean {
  const m = nif.match(/^\d{9}$/);
  if (!m) return false;
  const n = nif.split('').map(Number);
  const c = n.slice(0, 8).reduce((acc, d, i) => acc + d * (9 - i), 0);
  const v = 11 - (c % 11);
  const check = v >= 10 ? 0 : v;
  return check === n[8];
}

export function yearsAtSeasonStart(dobIso: string) {
  const ref = new Date('2025-09-01T00:00:00Z');
  const dob = new Date(dobIso);
  let age = ref.getUTCFullYear() - dob.getUTCFullYear();
  const md = ref.getUTCMonth() - dob.getUTCMonth();
  if (md < 0 || (md === 0 && ref.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

export function computeEscalao(dobIso: string, genero: 'Feminino'|'Masculino'): string {
  if (!dobIso) return 'Fora de escalões';
  const y = new Date(dobIso).getUTCFullYear();
  if (y === 2020 || y === 2021) return 'Baby Basket (2020-2021)';
  if (y === 2018 || y === 2019) return 'Mini 8 (2018-2019)';
  if (y === 2016 || y === 2017) return 'Mini 10 (2016-2017)';
  if (y === 2014 || y === 2015) return 'Mini 12 (2014-2015)';
  if (y === 2012 || y === 2013) return genero === 'Feminino' ? 'Sub 14 feminino (2012-2013)' : 'Sub 14 masculino (2012-2013)';
  if (y === 2010 || y === 2011) return genero === 'Feminino' ? 'Sub 16 feminino (2010-2011)' : 'Sub 16 masculino (2010-2011)';
  if (y === 2008 || y === 2009) return genero === 'Feminino' ? 'Sub 18 femininos (2008-2009)' : 'Sub 18 masculinos (2008-2009)';
  if (genero === 'Feminino') {
    if (y <= 2007 && y >= 1995) return 'Seniores femininas (≤2007)';
    if (y < 1995) return 'Masters (<1995)';
  } else {
    if (y >= 2002 && y <= 2007) return 'Seniores masculinos Sub23 (2002-2007)';
	if (y < 1995) return 'Masters (<1995)';
  }
  return 'Fora de escalões';
}

export function areEmailsValid(s: string): boolean {
  return s.split(';').map(p => p.trim()).filter(Boolean)
    .every(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
}