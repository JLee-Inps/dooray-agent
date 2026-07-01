#!/usr/bin/env node
// hooks/session-start-context.mjs
//
// SessionStart context-injection hook (portable harness).
// On session start, print a short summary of:
//   - in-progress phases (tasks/phase-meta.yml, status: in-progress)
//   - currently-open QA issues (tasks/TODO.md, "QA 이슈 (현재 열림)" section)
// to stdout. For SessionStart hooks, Claude Code injects stdout into the
// session context.
//
// Design decisions:
//   D3: Node .mjs, shell-agnostic. js-yaml (a root devDependency, if present) is
//       the preferred YAML parser, but it is loaded LAZILY via dynamic import
//       inside parseInProgressPhases — never at module load time. On a fresh
//       checkout / pruned install where js-yaml is absent, the import throws
//       ERR_MODULE_NOT_FOUND; we catch it and degrade to the tolerant line
//       scanner instead of crashing the hook before fail-open can engage.
//   D4 / read-only: this hook NEVER writes files or runs git — it cannot brick
//       a session. Any read/parse failure => empty output + exit 0 (fail-open).
//
// Exit code: always 0 (read-only, fail-open).
//
// Environment overrides:
//   SESSION_START_PROJECT_ROOT: override the resolved project root.
//   SESSION_CONTEXT_LABEL:      header label for the injected block
//                               (default "[harness session context]"). Set it
//                               to your project name, e.g. "[acme session context]".

import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/hooks/ (or <plugin>/hooks/) -> project root is two levels up.
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");

const DEFAULT_LABEL = "[harness session context]";

/**
 * Coerce a raw YAML scalar fragment to a string value, handling simple quoting
 * and stripping trailing " # comment". (Quoted titles may legitimately contain
 * '#', e.g. "...(#1)", so comments are only stripped from plain scalars.)
 */
function parseScalar(raw) {
  let s = String(raw).trim();
  if (s.startsWith('"')) {
    const end = s.indexOf('"', 1);
    return end === -1 ? s.slice(1) : s.slice(1, end);
  }
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    return end === -1 ? s.slice(1) : s.slice(1, end);
  }
  const m = s.match(/\s+#/);
  if (m) s = s.slice(0, m.index);
  return s.trim();
}

function coerceId(str) {
  return /^\d+$/.test(str) ? Number(str) : str;
}

/**
 * Tolerant, line-based phase extractor. A canonical tasks/phase-meta.yml may
 * contain values with unquoted ": " that strict YAML rejects, yet it is the
 * live source of truth. This scanner reads `- id:` blocks and the first
 * title/status within each, ignoring comments.
 */
export function parsePhasesLineBased(yamlText) {
  if (typeof yamlText !== "string") return [];
  const phases = [];
  let cur = null;
  for (const line of yamlText.split(/\r?\n/)) {
    const idMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (idMatch) {
      if (cur) phases.push(cur);
      cur = { id: coerceId(parseScalar(idMatch[1])), title: null, status: null };
      continue;
    }
    if (!cur) continue;
    const titleMatch = line.match(/^\s+title:\s*(.+)$/);
    if (titleMatch && cur.title === null) {
      cur.title = parseScalar(titleMatch[1]);
      continue;
    }
    const statusMatch = line.match(/^\s+status:\s*(.+)$/);
    if (statusMatch && cur.status === null) {
      cur.status = parseScalar(statusMatch[1]);
      continue;
    }
  }
  if (cur) phases.push(cur);
  return phases;
}

/**
 * Parse phase-meta YAML text into the list of in-progress phases.
 * Returns [{ id, title }]. Primary path = strict js-yaml, loaded lazily via
 * dynamic import; on EITHER a missing js-yaml (ERR_MODULE_NOT_FOUND on fresh
 * checkout / pruned install) OR a strict parse failure it falls back to a
 * tolerant line scan. Bad input yields [] (fail-open). Async because of the
 * dynamic import.
 */
export async function parseInProgressPhases(yamlText) {
  if (typeof yamlText !== "string" || yamlText.trim() === "") return [];
  // Primary: strict YAML via lazy dynamic import. Importing js-yaml here (not at
  // module load) keeps a missing dependency from throwing before fail-open can
  // engage — both ERR_MODULE_NOT_FOUND and strict-YAML violations land in the
  // catch below and degrade to the line scanner.
  try {
    const yaml = (await import("js-yaml")).default;
    const doc = yaml.load(yamlText);
    if (doc && Array.isArray(doc.phases)) {
      return doc.phases
        .filter((p) => p && String(p.status).trim() === "in-progress")
        .map((p) => ({ id: p.id, title: p.title }));
    }
  } catch {
    // js-yaml unavailable OR strict parse failed — fall through to line scan.
  }
  // Fallback: tolerant line scan.
  return parsePhasesLineBased(yamlText)
    .filter((p) => p.status === "in-progress")
    .map((p) => ({ id: p.id, title: p.title }));
}

/**
 * Extract the raw text of the "QA 이슈 (현재 열림)" section from TODO markdown,
 * i.e. everything between that heading and the next level-2 heading.
 * Returns the trimmed section text, or null if the heading is absent.
 */
export function extractOpenIssuesSection(md) {
  if (typeof md !== "string") return null;
  const lines = md.split(/\r?\n/);
  const startIdx = lines.findIndex((l) =>
    /^##\s+QA\s*이슈\s*\(\s*현재\s*열림\s*\)/.test(l)
  );
  if (startIdx === -1) return null;
  const rest = lines.slice(startIdx + 1);
  const endRel = rest.findIndex((l) => /^##\s/.test(l));
  const sectionLines = endRel === -1 ? rest : rest.slice(0, endRel);
  return sectionLines.join("\n").trim();
}

/**
 * Parse the open-issues section into a list of one-line issue summaries.
 * "(없음)" or a missing section => [].
 */
export function parseOpenIssues(md) {
  const section = extractOpenIssuesSection(md);
  if (section == null) return [];
  if (/\(\s*없음\s*\)/.test(section)) return [];
  const issues = [];
  for (const raw of section.split("\n")) {
    const t = raw.trim();
    if (!t) continue;
    const cleaned = t.replace(/^[>\-*\s]+/, "").trim();
    if (!cleaned) continue;
    issues.push(cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned);
  }
  return issues;
}

/** Build the context block printed to stdout. */
export function formatContext(phases, issues, label = DEFAULT_LABEL) {
  const lines = [label];

  if (phases.length === 0) {
    lines.push("- 진행중 Phase: 없음");
  } else {
    lines.push("- 진행중 Phase:");
    for (const p of phases) {
      lines.push(`  - Phase ${p.id}: ${p.title ?? "(제목 없음)"}`);
    }
  }

  if (issues.length === 0) {
    lines.push("- 열린 QA 이슈: 없음");
  } else {
    lines.push(`- 열린 QA 이슈 (${issues.length}건):`);
    for (const issue of issues) {
      lines.push(`  - ${issue}`);
    }
  }

  if (phases.length === 0 && issues.length === 0) {
    lines.push("(clean — 진행중 작업/열린 이슈 없음)");
  }

  return lines.join("\n");
}

export function markerExists(projectRoot, fs = { existsSync }) {
  return fs.existsSync(path.join(projectRoot, ".claude", ".hcg-harness.json"));
}

export function formatBootstrapHint(label) {
  return [
    label,
    "- 상태: 이 프로젝트는 아직 HCG 하네스로 부트스트랩되지 않았습니다.",
    "- 다음 단계: `/hcg-init` 를 실행해 프레임워크를 선택하고 하네스 + 앱 골격을 생성하세요.",
  ].join("\n");
}

function safeRead(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const projectRoot =
    process.env.SESSION_START_PROJECT_ROOT || DEFAULT_PROJECT_ROOT;
  const label = process.env.SESSION_CONTEXT_LABEL || DEFAULT_LABEL;

  if (!markerExists(projectRoot, { existsSync })) {
    process.stdout.write(`${formatBootstrapHint(label)}\n`);
    process.exit(0);
  }

  let phases = [];
  let issues = [];
  try {
    const metaText = safeRead(path.join(projectRoot, "tasks", "phase-meta.yml"));
    if (metaText) phases = await parseInProgressPhases(metaText);

    const todoText = safeRead(path.join(projectRoot, "tasks", "TODO.md"));
    if (todoText) issues = parseOpenIssues(todoText);
  } catch {
    // fail-open: emit nothing rather than risk a noisy/partial injection.
    process.exit(0);
  }

  process.stdout.write(`${formatContext(phases, issues, label)}\n`);
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
// fail-open: even an unexpected rejection must not produce a non-zero exit.
if (invokedDirectly) main().catch(() => process.exit(0));
