#!/usr/bin/env node
// Repoya girmiş gizli anahtarları tarar (git ls-files). Bulgu varsa 1 ile çıkar.
import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const PATTERNS = [
  ["Supabase/JWT (service_role olabilir)", /eyJhbGciOiJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/],
  ["Özel anahtar (PEM)", /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----\r?\n[A-Za-z0-9+\/=\r\n]{100,}/],
  ["Google API key", /AIza[0-9A-Za-z_-]{35}/],
  ["Resend API key", /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/],
  ["iyzico API/secret key", /\b(sandbox-)?[A-Za-z0-9]{32}\b(?=.*iyzi)/i],
  ["Firebase servis hesabı", /"type":\s*"service_account"/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Genel parola ataması", /(password|secret|api[_-]?key)\s*[:=]\s*["'][^"'\s]{12,}["']/i],
];
const ALLOW = [/^supabase\/functions\/tests\//, /\.test\.ts$/, /\/test\//, /Tests\//, /^scripts\/secret-scan\.mjs$/, /pnpm-lock\.yaml$/, /gradle-wrapper\.jar$/, /\.(png|ico|jar)$/];

const files = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const findings = [];
for (const f of files) {
  if (ALLOW.some((a) => a.test(f))) continue;
  try {
    if (statSync(f).size > 2_000_000) continue;
  } catch {
    continue;
  }
  const text = readFileSync(f, "utf8");
  for (const [name, re] of PATTERNS) {
    const m = text.match(re);
    if (m) findings.push(`${f}: ${name} (${m[0].slice(0, 12)}…)`);
  }
}
if (findings.length) {
  console.error("Olası gizli değer bulundu:\n" + findings.join("\n"));
  process.exit(1);
}
console.log(`Gizli değer taraması temiz (${files.length} dosya).`);
