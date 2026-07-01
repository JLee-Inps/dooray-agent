#!/usr/bin/env node
// hooks/phase-gate-check.mjs
//
// Stop / SubagentStop advisory hook (portable harness).
// When the session is about to stop, check tasks/phase-meta.yml for any phase
// that is still `status: in-progress` AND whose codex gate has NOT run
// (`codex_review.executed` is not true). Such a phase has accumulated changes
// that were never adversarially reviewed — closing the session there silently
// skips the gate. This hook surfaces a reminder so the skip is visible.
//
// Default: ADVISORY (warn to stderr, exit 0 — never traps the user). Set
// HARNESS_PHASE_GATE_BLOCK=1 to make it BLOCK the stop (exit 2) until the gate
// runs or the phase is closed.
//
// Read-only + fail-open: never writes, never runs git; any read/parse failure
// => no output + exit 0. (Mirrors session-start-context.mjs' safety stance.)
//
// Environment overrides:
//   PHASE_GATE_PROJECT_ROOT:   override the resolved project root.
//   HARNESS_PHASE_GATE_BLOCK:  truthy => block stop (exit 2) on an un-gated phase.

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export function isEnvTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

export function parseHookInput(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Tolerant line-based scan: walk `- id:` blocks, and within each capture status
 * and codex_review.executed. Returns [{ id, title, status, executed }]. Used as
 * the fallback when js-yaml is unavailable / the file is not strict YAML.
 */
export function parsePhaseGatesLineBased(yamlText) {
  if (typeof yamlText !== "string") return [];
  const out = [];
  let cur = null;
  let inCodex = false;
  const scalar = (raw) => {
    let s = String(raw).trim();
    if (s.startsWith('"')) return s.slice(1, s.indexOf('"', 1) === -1 ? undefined : s.indexOf('"', 1));
    if (s.startsWith("'")) return s.slice(1, s.indexOf("'", 1) === -1 ? undefined : s.indexOf("'", 1));
    const m = s.match(/\s+#/);
    if (m) s = s.slice(0, m.index);
    return s.trim();
  };
  for (const line of yamlText.split(/\r?\n/)) {
    const idM = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (idM) {
      if (cur) out.push(cur);
      const idv = scalar(idM[1]);
      cur = { id: /^\d+$/.test(idv) ? Number(idv) : idv, title: null, status: null, executed: false };
      inCodex = false;
      continue;
    }
    if (!cur) continue;
    if (/^\s*codex_review:\s*$/.test(line)) { inCodex = true; continue; }
    // A new top-level (2-space) key ends the codex_review block.
    if (inCodex && /^\s{2}\S/.test(line) && !/^\s{2}codex_review:/.test(line)) inCodex = false;
    const titleM = line.match(/^\s+title:\s*(.+)$/);
    if (titleM && cur.title === null) { cur.title = scalar(titleM[1]); continue; }
    const statusM = line.match(/^\s+status:\s*(.+)$/);
    if (statusM && cur.status === null) { cur.status = scalar(statusM[1]); continue; }
    const execM = line.match(/^\s+executed:\s*(.+)$/);
    if (execM && inCodex) { cur.executed = scalar(execM[1]) === "true"; continue; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Return the list of in-progress phases whose codex gate has not run.
 * Primary: strict js-yaml (lazy import); fallback: tolerant line scan.
 * [{ id, title }]. Bad input => [] (fail-open).
 */
export async function findUngatedPhases(yamlText) {
  if (typeof yamlText !== "string" || yamlText.trim() === "") return [];
  try {
    const yaml = (await import("js-yaml")).default;
    const doc = yaml.load(yamlText);
    if (doc && Array.isArray(doc.phases)) {
      return doc.phases
        .filter((p) => p && String(p.status).trim() === "in-progress")
        .filter((p) => !(p.codex_review && p.codex_review.executed === true))
        .map((p) => ({ id: p.id, title: p.title }));
    }
  } catch {
    // fall through to line scan
  }
  return parsePhaseGatesLineBased(yamlText)
    .filter((p) => p.status === "in-progress" && p.executed !== true)
    .map((p) => ({ id: p.id, title: p.title }));
}

export function formatWarning(phases) {
  const lines = [
    "[phase-gate-check] 미완 게이트 경고 — 아래 Phase 는 in-progress 이며 codex 게이트(codex_review.executed)가 아직 실행되지 않았습니다:",
  ];
  for (const p of phases) lines.push(`  - Phase ${p.id}: ${p.title ?? "(제목 없음)"}`);
  lines.push(
    "  → qa-agent 의 Phase 완료 검증(codex-review 스킬)을 돌려 게이트를 닫거나, Phase 를 명시적으로 종료하세요."
  );
  return lines.join("\n");
}

function safeRead(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

async function main() {
  const payload = parseHookInput(readStdinSync()) || {};
  const projectRoot =
    process.env.PHASE_GATE_PROJECT_ROOT ||
    (typeof payload.cwd === "string" && payload.cwd) ||
    DEFAULT_PROJECT_ROOT;

  let ungated = [];
  try {
    const metaText = safeRead(path.join(projectRoot, "tasks", "phase-meta.yml"));
    if (metaText) ungated = await findUngatedPhases(metaText);
  } catch {
    process.exit(0); // fail-open
  }

  if (ungated.length === 0) process.exit(0);

  process.stderr.write(`${formatWarning(ungated)}\n`);
  // Block only when explicitly requested; default is advisory (non-trapping).
  process.exit(isEnvTruthy(process.env.HARNESS_PHASE_GATE_BLOCK) ? 2 : 0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main().catch(() => process.exit(0));
