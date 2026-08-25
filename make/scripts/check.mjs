#!/usr/bin/env node
/**
 * Local lint for the Make app source. Runs with no network and no Make
 * account, so a broken reference is caught before a deploy — and before an
 * app reviewer sees it.
 *
 * Checks:
 *  - every file in src/ is valid JSON
 *  - every module in app.json has the sections its type requires
 *  - every rpc:// reference resolves to an RPC that exists
 *  - every IML expression is balanced and uses a known variable root
 *  - Make's app-review rules we can verify statically (limit parameter on
 *    search/trigger modules, sanitized authorization, universal module
 *    present, module labels in Title Case)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");

const problems = [];
const notes = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

function readJson(file) {
  const rel = path.relative(ROOT, file);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    fail(rel, "missing");
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(rel, `invalid JSON — ${err.message}`);
    return null;
  }
}

const manifest = readJson(path.join(ROOT, "app.json"));
if (!manifest) {
  console.error("app.json is unreadable; nothing else can be checked.");
  process.exit(1);
}

// ---------------------------------------------------------------- structure

/** typeId → sections that must exist, and sections that may exist. */
const SECTIONS = {
  1: { required: ["api", "parameters", "interface", "samples"], optional: ["epoch", "expect", "scope"] },
  4: { required: ["api", "interface", "samples"], optional: ["expect", "parameters", "scope"] },
  9: { required: ["api", "interface", "samples"], optional: ["expect", "parameters", "scope"] },
  10: { required: ["api", "interface", "samples"], optional: ["parameters", "scope"] },
  12: { required: ["api", "expect", "interface", "samples"], optional: ["parameters", "scope"] },
};

const loaded = new Map(); // relative path -> parsed content

function loadSection(dir, name, section) {
  const file = path.join(dir, `${section}.imljson`);
  if (!fs.existsSync(file)) return undefined;
  const parsed = readJson(file);
  loaded.set(path.relative(ROOT, file), parsed);
  return parsed;
}

const base = readJson(path.join(SRC, "base.imljson"));
if (base) {
  loaded.set("src/base.imljson", base);
  if (!base.baseUrl?.startsWith("https://")) fail("src/base.imljson", "baseUrl must be https");
  if (!base.log?.sanitize?.some((s) => /authorization/i.test(s))) {
    fail("src/base.imljson", "log.sanitize must hide the authorization header (app review requirement)");
  }
  if (!base.response?.error) fail("src/base.imljson", "no error handling (app review requirement)");
}

const connDir = path.join(SRC, "connections", manifest.connection.dir);
const connApi = loadSection(connDir, manifest.connection.dir, "api");
const connParams = loadSection(connDir, manifest.connection.dir, "parameters");
if (!connApi) fail("connection", "api.imljson missing");
if (!connApi?.log?.sanitize?.length) fail("connection", "api.imljson must sanitize the credential");
if (!Array.isArray(connParams) || connParams.length === 0) fail("connection", "no parameters");
if (connParams?.some((p) => p.type === "password") !== true) {
  fail("connection", "the API key parameter must be type password");
}

const rpcNames = new Set();
for (const rpc of manifest.rpcs ?? []) {
  rpcNames.add(rpc.name);
  const dir = path.join(SRC, "rpcs", rpc.name);
  if (!fs.existsSync(dir)) fail(`rpc ${rpc.name}`, "directory missing");
  else if (!loadSection(dir, rpc.name, "api")) fail(`rpc ${rpc.name}`, "api.imljson missing");
}

for (const hook of manifest.webhooks ?? []) {
  const dir = path.join(SRC, "webhooks", hook.dir);
  if (!fs.existsSync(dir)) fail(`webhook ${hook.dir}`, "directory missing");
  else if (!loadSection(dir, hook.dir, "api")) fail(`webhook ${hook.dir}`, "api.imljson missing");
}

const titleCase = (label) =>
  label
    .split(" ")
    .every((word, i) =>
      i === 0 || word.length <= 3 || /^[A-Z]/.test(word) || ["a", "an", "the", "of", "to"].includes(word),
    );

let hasUniversal = false;
for (const mod of manifest.modules) {
  const where = `module ${mod.name}`;
  const dir = path.join(SRC, "modules", mod.name);
  const spec = SECTIONS[mod.typeId];
  if (!spec) {
    fail(where, `unknown typeId ${mod.typeId}`);
    continue;
  }
  if (mod.typeId === 12) hasUniversal = true;
  if (!fs.existsSync(dir)) {
    fail(where, "directory missing");
    continue;
  }
  for (const section of spec.required) {
    if (!fs.existsSync(path.join(dir, `${section}.imljson`))) fail(where, `${section}.imljson missing`);
  }
  for (const section of [...spec.required, ...spec.optional]) loadSection(dir, mod.name, section);

  for (const file of fs.readdirSync(dir)) {
    const section = file.replace(/\.imljson$/, "");
    if (![...spec.required, ...spec.optional].includes(section)) {
      fail(where, `unexpected file ${file} for this module type`);
    }
  }

  if (!mod.label) fail(where, "no label");
  else if (!titleCase(mod.label)) fail(where, `label "${mod.label}" is not Title Case`);
  if (!mod.description?.endsWith(".")) fail(where, "description must be a sentence ending in a period");
  if (mod.typeId === 10 && !mod.webhook) fail(where, "instant trigger has no webhook");
  if (mod.typeId !== 10 && !mod.connection) fail(where, "no connection");

  // Search and polling modules must let the user cap the result count.
  if (mod.typeId === 1 || mod.typeId === 9) {
    const params = [
      ...(loaded.get(path.relative(ROOT, path.join(dir, "parameters.imljson"))) ?? []),
      ...(loaded.get(path.relative(ROOT, path.join(dir, "expect.imljson"))) ?? []),
    ];
    if (!params.some((p) => p?.name === "limit")) {
      fail(where, "search/trigger modules need a `limit` parameter (app review requirement)");
    }
    const api = loaded.get(path.relative(ROOT, path.join(dir, "api.imljson")));
    if (api && !api.pagination) fail(where, "search/trigger modules should implement pagination");
  }
}
if (!hasUniversal) fail("app", "no universal module (app review requirement)");

// ------------------------------------------------------------------ IML use

const IML_ROOTS = new Set([
  "parameters", "connection", "common", "temp", "body", "headers", "statusCode", "item", "items",
  "iterate", "pagination", "now", "data", "output", "payload", "metadata", "scenario", "environment",
  "query", "method", "undefined", "null", "true", "false",
]);
const IML_FUNCTIONS = new Set([
  "if", "ifempty", "length", "parseDate", "formatDate", "replace", "toCollection", "base64", "join",
  "split", "lower", "upper", "trim", "omit", "pick", "merge", "get", "map", "keys", "values",
  "toString", "toNumber", "encodeURL", "substring", "contains", "max", "min", "sum", "add", "parseNumber",
]);

for (const [rel, content] of loaded) {
  const walk = (value) => {
    if (typeof value === "string") {
      const opens = (value.match(/\{\{/g) ?? []).length;
      const closes = (value.match(/\}\}/g) ?? []).length;
      if (opens !== closes) fail(rel, `unbalanced IML braces in "${value.slice(0, 60)}"`);
      for (const expr of value.match(/\{\{([\s\S]*?)\}\}/g) ?? []) {
        // Strip quoted literals and backtick-quoted keys — words inside a
        // message are not IML identifiers.
        const inner = expr
          .slice(2, -2)
          .trim()
          .replace(/'[^']*'/g, "''")
          .replace(/`[^`]*`/g, "``");
        if (inner === "...") continue; // spread key
        for (const token of inner.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
          const isCall = new RegExp(`\\b${token}\\s*\\(`).test(inner);
          const isProperty = new RegExp(`[.\`'"]${token}`).test(inner);
          if (isCall) {
            if (!IML_FUNCTIONS.has(token)) notes.push(`${rel}: unrecognised IML function ${token}()`);
          } else if (!isProperty && !IML_ROOTS.has(token) && !/^[0-9]/.test(token)) {
            notes.push(`${rel}: unrecognised IML root "${token}" in ${expr}`);
          }
        }
      }
      const rpcRef = value.match(/^rpc:\/\/([A-Za-z0-9_]+)/);
      if (rpcRef && !rpcNames.has(rpcRef[1])) fail(rel, `references rpc://${rpcRef[1]} which is not in app.json`);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(content);
}

// --------------------------------------------------------------------- done

for (const note of [...new Set(notes)]) console.log(`note  ${note}`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`\n✓ ${manifest.modules.length} modules, ${(manifest.rpcs ?? []).length} RPC(s), ${loaded.size} files — source looks deployable`);
