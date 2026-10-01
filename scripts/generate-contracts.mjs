#!/usr/bin/env node
// Ortak contract üretici: packages/shared-contracts/contracts.json → TS / Kotlin / C#.
// Kullanım: node scripts/generate-contracts.mjs [--check]
// --check: üretilen dosyalar güncel değilse 1 ile çıkar (CI).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = JSON.parse(readFileSync(resolve(root, "packages/shared-contracts/contracts.json"), "utf8"));
const check = process.argv.includes("--check");

const HEADER = "Bu dosya scripts/generate-contracts.mjs tarafından üretilmiştir. Elle düzenlemeyin.";

const pascal = (s) =>
  s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
const constCase = (s) => s.toUpperCase();

function ts() {
  const out = [`// ${HEADER}`, ""];
  for (const [name, def] of Object.entries(contracts.enums)) {
    const keys = Object.keys(def.values);
    out.push(`export const ${name}Values = ${JSON.stringify(keys)} as const;`);
    out.push(`export type ${name} = (typeof ${name}Values)[number];`);
    out.push(`export const ${name}Labels: Record<${name}, string> = ${JSON.stringify(def.values, null, 2)};`);
    out.push("");
  }
  out.push(
    `export const OrderTransitions: ReadonlyArray<readonly [OrderStatus, OrderStatus, TransitionActor]> = ${JSON.stringify(
      contracts.orderTransitions,
    )} as const;`,
  );
  out.push("");
  out.push(`export const BusinessRules = ${JSON.stringify(contracts.rules, null, 2)} as const;`);
  out.push("");
  return out.join("\n");
}

function kotlin() {
  const out = [`// ${HEADER}`, "package site.kapinda.courier.core.contracts", ""];
  for (const [name, def] of Object.entries(contracts.enums)) {
    out.push(`enum class ${name}(val wire: String, val label: String) {`);
    const entries = Object.entries(def.values).map(([k, v]) => `    ${constCase(k)}(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
    out.push(entries.join(",\n") + ";");
    out.push("");
    out.push("    companion object {");
    out.push(`        fun fromWire(value: String?): ${name}? = entries.firstOrNull { it.wire == value }`);
    out.push("    }");
    out.push("}");
    out.push("");
  }
  const r = contracts.rules;
  out.push("object BusinessRules {");
  out.push(`    const val MINIMUM_BASKET_TRY = ${r.minimumBasketTry}`);
  out.push(`    const val COMMISSION_PER_ITEM_TRY = ${r.commissionPerItemTry}`);
  out.push(`    const val MAX_RATING_COMMENT_LENGTH = ${r.maxRatingCommentLength}`);
  out.push(
    `    val SERIOUS_INCIDENT_TYPES: Set<IncidentType> = setOf(${r.seriousIncidentTypes
      .map((t) => `IncidentType.${constCase(t)}`)
      .join(", ")})`,
  );
  out.push(
    `    val ACTIVE_COURIER_STATUSES: Set<OrderStatus> = setOf(${r.activeCourierStatuses
      .map((t) => `OrderStatus.${constCase(t)}`)
      .join(", ")})`,
  );
  out.push(
    `    val TERMINAL_ORDER_STATUSES: Set<OrderStatus> = setOf(${r.terminalOrderStatuses
      .map((t) => `OrderStatus.${constCase(t)}`)
      .join(", ")})`,
  );
  out.push("}");
  out.push("");
  return out.join("\n");
}

function csharp() {
  const out = [`// ${HEADER}`, "#nullable enable", "namespace Kapinda.Vendor.Core.Contracts;", ""];
  for (const [name, def] of Object.entries(contracts.enums)) {
    out.push(`public enum ${name}`);
    out.push("{");
    out.push(Object.keys(def.values).map((k) => `    ${pascal(k)}`).join(",\n"));
    out.push("}");
    out.push("");
    out.push(`public static class ${name}Wire`);
    out.push("{");
    out.push(`    private static readonly System.Collections.Generic.Dictionary<${name}, (string Wire, string Label)> Map = new()`);
    out.push("    {");
    out.push(
      Object.entries(def.values)
        .map(([k, v]) => `        [${name}.${pascal(k)}] = (${JSON.stringify(k)}, ${JSON.stringify(v)})`)
        .join(",\n"),
    );
    out.push("    };");
    out.push("");
    out.push(`    public static string ToWire(this ${name} value) => Map[value].Wire;`);
    out.push(`    public static string ToLabel(this ${name} value) => Map[value].Label;`);
    out.push("");
    out.push(`    public static ${name}? FromWire(string? wire)`);
    out.push("    {");
    out.push("        foreach (var pair in Map)");
    out.push("        {");
    out.push("            if (pair.Value.Wire == wire) return pair.Key;");
    out.push("        }");
    out.push("        return null;");
    out.push("    }");
    out.push("}");
    out.push("");
  }
  const r = contracts.rules;
  out.push("public static class BusinessRules");
  out.push("{");
  out.push(`    public const decimal MinimumBasketTry = ${r.minimumBasketTry}m;`);
  out.push(`    public const decimal CommissionPerItemTry = ${r.commissionPerItemTry}m;`);
  out.push("}");
  out.push("");
  return out.join("\n");
}

const targets = [
  ["packages/shared-contracts/src/generated.ts", ts()],
  ["apps/courier-android/app/src/main/java/site/kapinda/courier/core/contracts/Contracts.kt", kotlin()],
  ["apps/vendor-windows/src/Kapinda.Vendor.Core/Contracts/Contracts.g.cs", csharp()],
];

let stale = false;
for (const [rel, content] of targets) {
  const path = resolve(root, rel);
  const current = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (current === content) continue;
  if (check) {
    console.error(`Güncel değil: ${rel}`);
    stale = true;
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log(`Yazıldı: ${rel}`);
  }
}
if (stale) {
  console.error("Contract dosyaları güncel değil. `pnpm contracts:generate` çalıştırın.");
  process.exit(1);
}
