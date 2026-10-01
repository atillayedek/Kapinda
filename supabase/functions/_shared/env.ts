// Ortam değişkenleri. Değerler Supabase secrets ile verilir; repoya yazılmaz.
export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.length > 0 ? value : undefined;
}
