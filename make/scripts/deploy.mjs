#!/usr/bin/env node
/**
 * Deploy this source tree to Make via the SDK Apps API.
 *
 * Make's own tooling (the web editor, the VS Code extension) is interactive;
 * this script is the non-interactive equivalent, so the app in Make is always
 * exactly what is committed here — the same discipline as the n8n node and
 * the Zapier app.
 *
 *   MAKE_API_TOKEN=... MAKE_ZONE=eu2 node scripts/deploy.mjs [--dry-run]
 *
 * The token needs the sdk-apps:read and sdk-apps:write scopes (Make profile →
 * API access). MAKE_ZONE is the subdomain you log in to: eu1, eu2, us1, us2.
 *
 * Names that Make generates for us (the app suffix, the connection, the
 * webhook) are recorded in .make-state.json so a second run updates the same
 * app instead of creating a new one. That file is git-ignored: it is specific
 * to one Make organization.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const STATE_FILE = path.join(ROOT, ".make-state.json");

const DRY = process.argv.includes("--dry-run");
const TOKEN = process.env.MAKE_API_TOKEN;
const ZONE = process.env.MAKE_ZONE ?? "eu2";
const API = `https://${ZONE}.make.com/api/v2`;

if (!TOKEN && !DRY) {
  console.error("MAKE_API_TOKEN is not set. Run with --dry-run to see what would be deployed.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
const state = fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) : {};
// A dry run must never record names it did not really create.
const saveState = () => {
  if (!DRY) fs.writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
};

const readSection = (dir, section) => {
  const file = path.join(dir, `${section}.imljson`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
};

let calls = 0;
async function api(method, endpoint, { body, contentType = "application/json" } = {}) {
  calls += 1;
  const url = `${API}${endpoint}`;
  if (DRY) {
    console.log(`  [dry] ${method} ${endpoint}`);
    return {};
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Token ${TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": contentType }),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const detail = parsed?.message ?? parsed?.detail ?? text.slice(0, 400);
    throw new Error(`${method} ${endpoint} → ${res.status} ${detail}`);
  }
  return parsed;
}

/** PUT a section file, reporting which file failed rather than which URL. */
async function putSection(label, endpoint, dir, section) {
  const content = readSection(dir, section);
  if (content === null) return false;
  try {
    await api("PUT", endpoint, { body: content });
    console.log(`  ✓ ${label} ${section}`);
    return true;
  } catch (err) {
    throw new Error(`${path.relative(ROOT, path.join(dir, `${section}.imljson`))} rejected — ${err.message}`);
  }
}

// ------------------------------------------------------------------- the app

const version = manifest.app.version ?? 1;

async function ensureApp() {
  if (state.appName) {
    console.log(`app: updating ${state.appName} v${version}`);
    await api("PATCH", `/sdk/apps/${state.appName}/${version}`, {
      body: {
        label: manifest.app.label,
        description: manifest.app.description,
        theme: manifest.app.theme,
        language: manifest.app.language,
      },
    });
    return;
  }
  console.log(`app: creating ${manifest.app.name}`);
  const created = await api("POST", "/sdk/apps", { body: { app: { ...manifest.app, version } } });
  // Make appends a numeric suffix when the name is taken, so always trust the
  // name it hands back rather than the one we asked for.
  state.appName = created?.app?.name ?? manifest.app.name;
  state.zone = ZONE;
  saveState();
  console.log(`  ✓ created as "${state.appName}"`);
}

async function ensureConnection() {
  const spec = manifest.connection;
  const dir = path.join(SRC, "connections", spec.dir);
  if (!state.connectionName) {
    const existing = await api("GET", `/sdk/apps/${state.appName}/connections`);
    const found = existing?.appConnections?.[0];
    if (found) {
      state.connectionName = found.name;
    } else {
      const created = await api("POST", `/sdk/apps/${state.appName}/connections`, {
        body: { type: spec.type, label: spec.label },
      });
      state.connectionName = created?.appConnection?.name;
      console.log(`  ✓ connection created as "${state.connectionName}"`);
    }
    saveState();
  }
  const name = state.connectionName ?? "(dry-run)";
  console.log(`connection: ${name}`);
  await putSection("connection", `/sdk/apps/connections/${name}/api`, dir, "api");
  await putSection("connection", `/sdk/apps/connections/${name}/parameters`, dir, "parameters");
}

async function ensureWebhooks() {
  state.webhooks ??= {};
  for (const spec of manifest.webhooks ?? []) {
    const dir = path.join(SRC, "webhooks", spec.dir);
    if (!state.webhooks[spec.dir]) {
      const created = await api("POST", `/sdk/apps/${state.appName}/webhooks`, {
        body: { type: spec.type, label: spec.label },
      });
      state.webhooks[spec.dir] = created?.appWebhook?.name ?? spec.dir;
      saveState();
      console.log(`  ✓ webhook created as "${state.webhooks[spec.dir]}"`);
    }
    const name = state.webhooks[spec.dir] ?? "(dry-run)";
    console.log(`webhook: ${name}`);
    await putSection("webhook", `/sdk/apps/webhooks/${name}/api`, dir, "api");
    await putSection("webhook", `/sdk/apps/webhooks/${name}/parameters`, dir, "parameters");
  }
}

async function deployBase() {
  console.log("base:");
  await putSection("app", `/sdk/apps/${state.appName}/${version}/base`, SRC, "base");
  const common = readSection(SRC, "common");
  if (common && common.trim() !== "{}") {
    await api("PUT", `/sdk/apps/${state.appName}/${version}/common`, { body: common });
    console.log("  ✓ base common");
  }
}

async function deployRpcs() {
  const existing = DRY ? [] : (await api("GET", `/sdk/apps/${state.appName}/${version}/rpcs`))?.appRpcs ?? [];
  const known = new Set(existing.map((r) => r.name));
  for (const spec of manifest.rpcs ?? []) {
    const dir = path.join(SRC, "rpcs", spec.name);
    // Make prefixes RPC names with the app name; match on the suffix.
    const remote = existing.find((r) => r.name === spec.name || r.name.endsWith(spec.name));
    let name = remote?.name;
    if (!name) {
      const created = await api("POST", `/sdk/apps/${state.appName}/${version}/rpcs`, {
        body: {
          name: spec.name,
          label: spec.label,
          connection: spec.connection ? state.connectionName : null,
        },
      });
      name = created?.appRpc?.name ?? spec.name;
      console.log(`  ✓ rpc created as "${name}"`);
    }
    console.log(`rpc: ${name}${known.has(name) ? "" : " (new)"}`);
    await putSection("rpc", `/sdk/apps/${state.appName}/${version}/rpcs/${name}/api`, dir, "api");
    await putSection("rpc", `/sdk/apps/${state.appName}/${version}/rpcs/${name}/parameters`, dir, "parameters");
    if (name !== spec.name) {
      console.warn(
        `  ! Make named this RPC "${name}" but modules reference "rpc://${spec.name}" — update the expect files.`,
      );
    }
  }
}

const SECTION_FILES = ["api", "epoch", "parameters", "expect", "interface", "samples", "scope"];

async function deployModules() {
  const existing = DRY
    ? []
    : (await api("GET", `/sdk/apps/${state.appName}/${version}/modules`))?.appModules ?? [];
  const known = new Map(existing.map((m) => [m.name, m]));

  for (const spec of manifest.modules) {
    const dir = path.join(SRC, "modules", spec.name);
    const body = {
      label: spec.label,
      description: spec.description,
      ...(spec.connection ? { connection: state.connectionName } : {}),
      ...(spec.webhook ? { webhook: state.webhooks?.[manifest.webhooks[0].dir] } : {}),
      ...(spec.crud ? { crud: spec.crud } : {}),
    };
    if (known.has(spec.name)) {
      console.log(`module: ${spec.name}`);
      await api("PATCH", `/sdk/apps/${state.appName}/${version}/modules/${spec.name}`, { body });
    } else {
      console.log(`module: ${spec.name} (new)`);
      await api("POST", `/sdk/apps/${state.appName}/${version}/modules`, {
        body: { name: spec.name, typeId: spec.typeId, moduleInitMode: "blank", ...body },
      });
    }
    for (const section of SECTION_FILES) {
      await putSection(
        spec.name,
        `/sdk/apps/${state.appName}/${version}/modules/${spec.name}/${section}`,
        dir,
        section,
      );
    }
  }
}

// ---------------------------------------------------------------------- main

try {
  console.log(`Deploying to ${API}${DRY ? " (dry run — no requests sent)" : ""}\n`);
  await ensureApp();
  await ensureConnection();
  await ensureWebhooks();
  await deployBase();
  await deployRpcs();
  await deployModules();
  console.log(`\n✓ done — ${calls} API call(s)`);
  if (!DRY) {
    console.log(`  Open: https://${ZONE}.make.com/sdk/apps/${state.appName}/${version}`);
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
