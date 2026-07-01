#!/usr/bin/env node
// hooks/contracts-guard.mjs
//
// PreToolUse guard hook (portable harness). Two independent, command/path-pattern
// based guards (NO agent identity — see the IMPORTANT note below):
//
//   G1  contracts lock — Edit/Write/MultiEdit/NotebookEdit whose target file is
//       under the contracts dir (default "contracts") is DENIED unless contracts
//       are explicitly unlocked via env HARNESS_CONTRACTS_WRITE. This turns the
//       prose rule "contracts/ is read-only; only the plan/orchestration role
//       authors it" into a real lock: an implementer agent that strays into a
//       contract file mid-pipeline (env unset) is blocked. Authoring/updating a
//       contract becomes a deliberate, auditable unlock step.
//
//   G2  destructive-command guard — a Bash command matching a curated set of
//       irreversible/catastrophic patterns (prisma migrate reset, prisma db push
//       --force-reset/--accept-data-loss, SQL DROP DATABASE/TABLE/SCHEMA,
//       TRUNCATE TABLE, `rm -rf` on a filesystem/home root, `git push --force`)
//       is DENIED unless disabled via env HARNESS_DISABLE_DESTRUCTIVE_GUARD.
//       Aligns with Operating Rules §0 (reversibility / safety first).
//
// IMPORTANT — why a LOCK, not "allow plan / deny others":
//   The PreToolUse stdin payload is { session_id, cwd, hook_event_name,
//   tool_name, tool_input } — it carries NO agent identifier (verified against
//   the Claude Code hooks docs). A hook therefore cannot tell WHICH subagent is
//   calling, so per-agent scoping ("is this plan-agent?") is impossible from the
//   hook alone. G1 keys on INTENT ("are contracts unlocked right now?") instead
//   of identity. Also undocumented: whether PreToolUse fires for *subagent* tool
//   calls at all — if it does not, this guard only covers main-thread calls.
//   Treat end-to-end subagent coverage as an install-time (rung-4) check.
//
// Deny mechanism (Claude Code PreToolUse convention): exit 2 with the reason on
// stderr — Claude Code cancels the tool call and feeds the reason back to Claude.
// Fail-open: any infra/parse failure => exit 0 (a hook bug must never block work).
//
// Exit codes:
//   0 = allow (no violation, or fail-open on an infra/parse error)
//   2 = deny  (violation detected; stderr reason is returned to the agent)
//
// Environment overrides:
//   HARNESS_CONTRACTS_WRITE           truthy => unlock contracts writes (G1 off).
//   HARNESS_CONTRACTS_DIR             contracts dir relative to project root
//                                     (default "contracts").
//   HARNESS_DISABLE_DESTRUCTIVE_GUARD truthy => disable G2.
//   CONTRACTS_GUARD_PROJECT_ROOT      override the resolved project root (the
//                                     launcher maps CLAUDE_PROJECT_DIR into this).

import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/hooks/ (or <plugin>/hooks/) -> project root is two levels up.
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CONTRACTS_DIR = "contracts";

const WRITE_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

/**
 * Parse the hook stdin payload. Returns the parsed object or null on failure
 * (fail-open: a malformed payload must never block).
 */
export function parseHookInput(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Env truthiness: a value is "truthy" iff it is set and not one of the falsey
 * spellings ("", "0", "false", "no", "off", case-insensitive).
 */
export function isEnvTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

/** Resolve the project root for path checks (env override > payload.cwd > default). */
export function resolveProjectRoot(payload, env = process.env) {
  if (env.CONTRACTS_GUARD_PROJECT_ROOT) return env.CONTRACTS_GUARD_PROJECT_ROOT;
  const cwd = payload?.cwd;
  if (typeof cwd === "string" && cwd.length > 0) return cwd;
  return DEFAULT_PROJECT_ROOT;
}

/** The edited file path for a write-tool payload (file_path | notebook_path), or null. */
export function extractWritePath(payload) {
  const ti = payload?.tool_input;
  const fp = ti?.file_path ?? ti?.notebook_path;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

/** True iff absFile lives inside dirAbs (not the dir itself, no upward escape). */
export function isUnderDir(absFile, dirAbs) {
  const rel = path.relative(dirAbs, absFile);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * G1 — contracts lock. Returns { deny, reason }.
 *   opts: { projectRoot, contractsDir, unlocked }
 * Only write tools targeting a file under the contracts dir trip it, and only
 * when contracts are NOT unlocked.
 */
export function checkContractsLock(payload, opts) {
  const { projectRoot, contractsDir = DEFAULT_CONTRACTS_DIR, unlocked } = opts;
  if (unlocked) return { deny: false };
  if (!payload || !WRITE_TOOLS.has(payload.tool_name)) return { deny: false };
  const rawPath = extractWritePath(payload);
  if (!rawPath) return { deny: false };
  const abs = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(projectRoot, rawPath);
  const contractsAbs = path.resolve(projectRoot, contractsDir);
  if (!isUnderDir(abs, contractsAbs)) return { deny: false };
  const rel = path.relative(projectRoot, abs) || rawPath;
  return {
    deny: true,
    reason:
      `contracts/ is the read-only SSOT — '${rel}' may not be edited here. ` +
      `Contracts are owned by the plan/orchestration role and are LOCKED by ` +
      `default. To author/update a contract deliberately, set ` +
      `HARNESS_CONTRACTS_WRITE=1 for that step; otherwise record the needed ` +
      `change as a TODO/BUG for the plan role (do not edit contracts/ from an ` +
      `implementer).`,
  };
}

// G2 — destructive Bash rules. Each test(cmd) => true means "deny".
const RM_RECURSIVE_FORCE =
  /\brm\s+(?:-[A-Za-z]*r[A-Za-z]*f|-[A-Za-z]*f[A-Za-z]*r)\b|\brm\b(?=[^\n]*\s-[A-Za-z]*r\b)(?=[^\n]*\s-[A-Za-z]*f\b)/;
const RM_DANGEROUS_TARGET =
  /(?:^|\s)(?:\/|\/\*|~\/?|\$HOME|\.{1,2})(?:\s|$)|(?:^|\s)[A-Za-z]:\\?(?:\s|$)/;

export const DESTRUCTIVE_RULES = [
  {
    label: "prisma migrate reset (drops and recreates the entire database)",
    test: (c) => /\bprisma\s+migrate\s+reset\b/i.test(c),
  },
  {
    label: "prisma db push with a data-loss flag",
    test: (c) =>
      /\bprisma\s+db\s+push\b[^\n]*--(?:force-reset|accept-data-loss)\b/i.test(c),
  },
  {
    label: "SQL DROP DATABASE/TABLE/SCHEMA",
    test: (c) => /\bdrop\s+(?:database|table|schema)\b/i.test(c),
  },
  {
    label: "SQL TRUNCATE TABLE",
    test: (c) => /\btruncate\s+table\b/i.test(c),
  },
  {
    label: "rm -rf on a filesystem/home root",
    test: (c) => RM_RECURSIVE_FORCE.test(c) && RM_DANGEROUS_TARGET.test(c),
  },
  {
    label: "git push --force (use --force-with-lease, or push a fresh branch)",
    test: (c) =>
      /\bgit\s+push\b/.test(c) &&
      (/--force(?!-with-lease)\b/.test(c) || /\s-f\b/.test(c)),
  },
];

/**
 * G2 — destructive command guard. Returns { deny, reason }.
 *   opts: { enabled }
 */
export function checkDestructiveBash(payload, opts) {
  const { enabled } = opts;
  if (!enabled) return { deny: false };
  if (!payload || payload.tool_name !== "Bash") return { deny: false };
  const cmd = payload?.tool_input?.command;
  if (typeof cmd !== "string" || cmd.length === 0) return { deny: false };
  for (const rule of DESTRUCTIVE_RULES) {
    if (rule.test(cmd)) {
      return {
        deny: true,
        reason:
          `Blocked a destructive/irreversible command (${rule.label}). ` +
          `If this is intentional and safe, run it yourself or set ` +
          `HARNESS_DISABLE_DESTRUCTIVE_GUARD=1 for this step.`,
      };
    }
  }
  return { deny: false };
}

/**
 * Top-level decision for a parsed payload. Returns { deny, reason }.
 * Pure: env + project root are passed in so it is fully testable.
 */
export function evaluate(payload, { env = process.env } = {}) {
  const projectRoot = resolveProjectRoot(payload, env);
  const contracts = checkContractsLock(payload, {
    projectRoot,
    contractsDir: env.HARNESS_CONTRACTS_DIR || DEFAULT_CONTRACTS_DIR,
    unlocked: isEnvTruthy(env.HARNESS_CONTRACTS_WRITE),
  });
  if (contracts.deny) return contracts;
  const destructive = checkDestructiveBash(payload, {
    enabled: !isEnvTruthy(env.HARNESS_DISABLE_DESTRUCTIVE_GUARD),
  });
  if (destructive.deny) return destructive;
  return { deny: false };
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const payload = parseHookInput(readStdinSync());
  if (!payload) process.exit(0); // unparseable stdin -> fail-open allow

  let decision;
  try {
    decision = evaluate(payload, { env: process.env });
  } catch {
    process.exit(0); // any evaluation bug -> fail-open allow
  }

  if (decision.deny) {
    process.stderr.write(`[contracts-guard] ${decision.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
