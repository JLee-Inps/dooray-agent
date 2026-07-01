#!/usr/bin/env node
// hooks/post-edit-verify.mjs
//
// PostToolUse verification hook (portable harness).
// After an Edit/Write/MultiEdit tool runs, if the changed file is a TypeScript
// source file under one of the project's app dirs (default "apps/web"), run
// ESLint on JUST that file and surface real findings back to the agent.
// Optionally (opt-in) also run a project `tsc --noEmit` type-check.
//
// Design decisions:
//   D1: changed-file ESLint by default. A full `tsc --noEmit` is opt-in
//       (POST_EDIT_VERIFY_TSC) because it type-checks the WHOLE project (tsc has
//       no reliable tsconfig-honoring single-file mode) and is too slow to run
//       on every edit unconditionally — but type errors are the most common
//       breakage, so the gate is available when wanted.
//   D2: multiple app dirs supported. POST_EDIT_VERIFY_APP_DIR may be a single
//       dir or a comma-separated list (monorepo with several apps/packages); the
//       file is linted under whichever listed dir contains it.
//   D3: Node .mjs, shell-agnostic. We spawn `node <eslint.js>` / `node <tsc>`
//       directly (NOT `pnpm`/`npx`, which are .cmd shims on Windows that Node
//       cannot spawn with shell:false). The eslint/tsc binary is resolved from
//       the matched app dir's node_modules first, then the project-root
//       node_modules (pnpm hoist / flat layouts).
//   D4: fail-open. Infra failures (binary missing, spawn error, timeout,
//       config/internal error, unparseable stdin) => exit 0/1 (NON-blocking).
//       Only real lint/type findings => exit 2 (stderr fed back to Claude).
//
// Exit codes (Claude Code convention):
//   0  = success / no-op / fail-open. (silent or non-fatal warning)
//   2  = blocking: real ESLint or tsc errors found; stderr is returned to Claude.
//   (we never use other non-zero codes — fail-open prefers 0)
//
// stdin: PostToolUse hook JSON. Relevant shape (Edit/Write/MultiEdit all carry
// the changed path at tool_input.file_path; MultiEdit additionally has an
// edits[] array which we ignore — one file_path is all we lint):
//   { "tool_name": "Edit"|"Write"|"MultiEdit",
//     "tool_input": { "file_path": "...", ... }, ... }
//
// Environment overrides:
//   POST_EDIT_VERIFY_PROJECT_ROOT: override the resolved project root.
//   POST_EDIT_VERIFY_APP_DIR:      app subdir(s) holding the lintable source +
//                                  the eslint/tsc binary (default "apps/web").
//                                  Comma-separated for multiple (e.g.
//                                  "apps/web,apps/admin,packages/ui"). On a
//                                  non-monorepo set it to ".".
//   POST_EDIT_VERIFY_TSC:          truthy => after a clean ESLint, also run
//                                  `tsc --noEmit` (project-wide) and block on
//                                  type errors. Off by default.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .claude/hooks/ (or <plugin>/hooks/) -> project root is two levels up.
const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "..", "..");

// App subdir(s) (relative to project root) holding the lintable source tree and
// the local eslint/tsc binary. Externalized so the hook is not bound to a single
// monorepo layout — on a non-monorepo project set POST_EDIT_VERIFY_APP_DIR=".".
const DEFAULT_APP_DIR = "apps/web";

// Soft timeout for the child checkers. Settings hook timeout is set higher so we
// time out ourselves first and fail-open instead of being killed.
const ESLINT_TIMEOUT_MS = 60_000;
const TSC_TIMEOUT_MS = 60_000;

/** Env truthiness for the opt-in tsc gate. */
export function isEnvTruthy(value) {
  if (value == null) return false;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false" && v !== "no" && v !== "off";
}

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
 * Extract the edited file path from a parsed hook payload (or null).
 * Tool-name-agnostic: Edit, Write, and MultiEdit all expose the changed file
 * at tool_input.file_path (MultiEdit's extra edits[] array is irrelevant here),
 * so a single accessor covers every matched tool.
 */
export function extractFilePath(payload) {
  const fp = payload?.tool_input?.file_path;
  return typeof fp === "string" && fp.length > 0 ? fp : null;
}

/** Parse POST_EDIT_VERIFY_APP_DIR into a list of app dirs (default ["apps/web"]). */
export function parseAppDirs(raw = process.env.POST_EDIT_VERIFY_APP_DIR) {
  const s = (raw || "").trim();
  if (!s) return [DEFAULT_APP_DIR];
  const dirs = s.split(",").map((d) => d.trim()).filter(Boolean);
  return dirs.length ? dirs : [DEFAULT_APP_DIR];
}

/**
 * Decide whether `rawPath` is a TypeScript source file under one of the app
 * dirs that we should lint. Returns { target, appDir, appRoot } (the abs path to
 * lint + the matched app dir + its abs root), or null (no-op).
 */
export function resolveLintTarget(rawPath, projectRoot, appDirs = parseAppDirs()) {
  if (typeof rawPath !== "string" || rawPath.length === 0) return null;
  const dirs = Array.isArray(appDirs) ? appDirs : [appDirs];
  const abs = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(projectRoot, rawPath);
  const ext = path.extname(abs).toLowerCase();
  if (ext !== ".ts" && ext !== ".tsx") return null;
  for (const appDir of dirs) {
    const appRoot = path.resolve(projectRoot, appDir);
    const rel = path.relative(appRoot, abs);
    // Inside appRoot iff rel does not escape upward and is not absolute.
    if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      return { target: abs, appDir, appRoot };
    }
  }
  return null;
}

/**
 * Resolve a node-script binary (eslint/tsc) from the matched app dir's
 * node_modules first, then the project-root node_modules (pnpm hoist / flat).
 * Returns the abs path to the binary's .js entry, or null.
 */
export function resolveBin(relParts, appRoot, projectRoot, existsFn = existsSync) {
  const candidates = [
    path.join(appRoot, "node_modules", ...relParts),
    path.join(projectRoot, "node_modules", ...relParts),
  ];
  for (const c of candidates) if (existsFn(c)) return c;
  return null;
}

/**
 * Map a checker spawnSync result to a hook decision.
 *   exit 0      -> clean         -> hook exit 0
 *   exit 1      -> real findings  -> hook exit 2 (blocking)
 *   exit 2      -> config/internal error (eslint) -> fail-open hook exit 0
 *   null (timeout/signal) / spawn error / anything else -> fail-open exit 0
 */
export function classifyEslintResult(result) {
  if (result == null) return { exit: 0, kind: "infra" };
  if (result.error) return { exit: 0, kind: "infra" };
  if (result.status === 0) return { exit: 0, kind: "clean" };
  if (result.status === 1) return { exit: 2, kind: "findings" };
  return { exit: 0, kind: "infra" };
}

/**
 * tsc exit codes: 0 = clean, non-zero = type errors. A spawn error / signal is
 * infra (fail-open). tsc has no "config error vs findings" split like eslint, so
 * any positive status is treated as findings (blocking).
 */
export function classifyTscResult(result) {
  if (result == null) return { exit: 0, kind: "infra" };
  if (result.error) return { exit: 0, kind: "infra" };
  if (result.status === 0) return { exit: 0, kind: "clean" };
  if (typeof result.status === "number" && result.status > 0)
    return { exit: 2, kind: "findings" };
  return { exit: 0, kind: "infra" };
}

function readStdinSync() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const projectRoot =
    process.env.POST_EDIT_VERIFY_PROJECT_ROOT || DEFAULT_PROJECT_ROOT;
  const appDirs = parseAppDirs();

  const payload = parseHookInput(readStdinSync());
  if (!payload) process.exit(0); // unparseable stdin -> fail-open no-op

  const filePath = extractFilePath(payload);
  const resolved = resolveLintTarget(filePath, projectRoot, appDirs);
  if (!resolved) process.exit(0); // not a lintable .ts/.tsx file -> no-op
  const { target, appRoot } = resolved;

  // ---- ESLint (always) ----
  const eslintBin = resolveBin(["eslint", "bin", "eslint.js"], appRoot, projectRoot);
  if (!eslintBin) {
    process.stderr.write(
      `[post-edit-verify] eslint not found under ${appRoot} or ${projectRoot} — skipping (fail-open)\n`
    );
    process.exit(0);
  }

  const eslintRes = spawnSync(process.execPath, [eslintBin, target], {
    cwd: appRoot,
    encoding: "utf8",
    shell: false,
    timeout: ESLINT_TIMEOUT_MS,
  });
  const eslintDecision = classifyEslintResult(eslintRes);

  if (eslintDecision.kind === "findings") {
    const rel = path.relative(projectRoot, target);
    const detail = `${eslintRes.stdout || ""}${eslintRes.stderr || ""}`.trim();
    process.stderr.write(
      `[post-edit-verify] ESLint reported problems in ${rel}:\n${detail}\n`
    );
    process.exit(2);
  }
  if (eslintDecision.kind === "infra") {
    const why = eslintRes?.error
      ? eslintRes.error.message
      : eslintRes?.status === null
        ? "timed out or terminated by signal"
        : `eslint exit ${eslintRes?.status}`;
    process.stderr.write(
      `[post-edit-verify] eslint skipped (${why}) — fail-open\n`
    );
    process.exit(0);
  }

  // ---- tsc --noEmit (opt-in: POST_EDIT_VERIFY_TSC) ----
  // Runs only after a clean ESLint. Project-wide check, so gated behind env.
  if (isEnvTruthy(process.env.POST_EDIT_VERIFY_TSC)) {
    const tscBin = resolveBin(["typescript", "bin", "tsc"], appRoot, projectRoot);
    if (!tscBin) {
      process.stderr.write(
        `[post-edit-verify] tsc requested but typescript not found under ${appRoot} or ${projectRoot} — skipping (fail-open)\n`
      );
      process.exit(0);
    }
    const tscRes = spawnSync(process.execPath, [tscBin, "--noEmit"], {
      cwd: appRoot,
      encoding: "utf8",
      shell: false,
      timeout: TSC_TIMEOUT_MS,
    });
    const tscDecision = classifyTscResult(tscRes);
    if (tscDecision.kind === "findings") {
      const detail = `${tscRes.stdout || ""}${tscRes.stderr || ""}`.trim();
      process.stderr.write(
        `[post-edit-verify] tsc --noEmit reported type errors (cwd ${path.relative(projectRoot, appRoot) || "."}):\n${detail}\n`
      );
      process.exit(2);
    }
    if (tscDecision.kind === "infra") {
      const why = tscRes?.error
        ? tscRes.error.message
        : tscRes?.status === null
          ? "timed out or terminated by signal"
          : `tsc exit ${tscRes?.status}`;
      process.stderr.write(
        `[post-edit-verify] tsc skipped (${why}) — fail-open\n`
      );
      process.exit(0);
    }
  }

  // clean
  process.exit(0);
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
