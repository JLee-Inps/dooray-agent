// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import { chmod, rm, stat, writeFile } from "node:fs/promises";
import {
  CONFIG_DIR,
  CONFIG_FILE,
  loadConfig,
  loadRawConfig,
  saveConfig,
} from "./config";

// test-setup.ts 가 HOME 을 임시 디렉터리로 돌려두므로 CONFIG_FILE 은
// 버려지는 임시 경로를 가리킨다(실제 홈 무해). 테스트 간 격리를 위해
// 매번 설정 파일을 지운다.
beforeEach(async () => {
  await rm(CONFIG_FILE, { force: true });
});

describe("loadConfig", () => {
  it("파일이 없으면 null", async () => {
    expect(await loadConfig()).toBeNull();
  });

  it("token 만 있고 baseUrl 이 없으면 null", async () => {
    await saveConfig({ token: "t" });
    expect(await loadConfig()).toBeNull();
  });

  it("baseUrl 만 있고 token 이 없으면 null", async () => {
    await saveConfig({ baseUrl: "https://x" });
    expect(await loadConfig()).toBeNull();
  });

  it("token+baseUrl 이 있으면 자격증명을 돌려준다", async () => {
    await saveConfig({ token: "t", baseUrl: "https://x" });
    const config = await loadConfig();
    expect(config).toEqual({ token: "t", baseUrl: "https://x" });
  });
});

describe("saveConfig", () => {
  it("부분 저장은 기존 필드를 병합 보존한다", async () => {
    await saveConfig({ token: "t", baseUrl: "https://x" });
    await saveConfig({ imapHost: "imap.example.com" });
    const raw = await loadRawConfig();
    expect(raw).toEqual({
      token: "t",
      baseUrl: "https://x",
      imapHost: "imap.example.com",
    });
  });

  it("같은 키를 다시 저장하면 덮어쓴다", async () => {
    await saveConfig({ token: "old", baseUrl: "https://x" });
    await saveConfig({ token: "new" });
    const config = await loadConfig();
    expect(config?.token).toBe("new");
    expect(config?.baseUrl).toBe("https://x");
  });
});

describe("saveConfig — 파일 권한 (POSIX 한정)", () => {
  it.skipIf(process.platform === "win32")(
    "저장 후 파일 mode === 0o600, 디렉터리 mode === 0o700",
    async () => {
      await saveConfig({ token: "t", baseUrl: "https://x" });
      const fileStat = await stat(CONFIG_FILE);
      const dirStat = await stat(CONFIG_DIR);
      expect(fileStat.mode & 0o777).toBe(0o600);
      expect(dirStat.mode & 0o777).toBe(0o700);
    },
  );

  it.skipIf(process.platform === "win32")(
    "느슨한 권한(0o644)으로 만든 파일을 saveConfig 재호출 시 0o600 으로 수렴 (명시적 chmod 요구사항)",
    async () => {
      // 1차 저장 후 권한을 의도적으로 느슨하게 변경
      await saveConfig({ token: "t", baseUrl: "https://x" });
      await chmod(CONFIG_FILE, 0o644);
      // writeFile mode 만으로는 기존 파일 mode 를 좁히지 못함
      // → 명시적 chmod 가 있어야 0o600 으로 수렴
      await saveConfig({ token: "t2", baseUrl: "https://x2" });
      const fileStat = await stat(CONFIG_FILE);
      expect(fileStat.mode & 0o777).toBe(0o600);
    },
  );

  it.skipIf(process.platform === "win32")(
    "느슨한 권한(0o644)의 기존 파일에 writeFile 만 하면 0o600 으로 좁혀지지 않음 (anti-overfit: 명시적 chmod 가 필요함을 확인)",
    async () => {
      // 이 케이스는 "writeFile mode 만으로는 부족하다"는 사실 자체를 테스트로 문서화.
      // tmpdir 의 새 파일에 0o644 로 직접 쓰기 후 writeFile(mode:0o600) 재호출해도 여전히 0o644 임을 확인.
      await writeFile(CONFIG_FILE, '{"token":"x"}', {
        encoding: "utf8",
        mode: 0o644,
      });
      // mode 옵션이 있어도 기존 파일 mode 는 변경되지 않음
      await writeFile(CONFIG_FILE, '{"token":"y"}', {
        encoding: "utf8",
        mode: 0o600,
      });
      const fileStat = await stat(CONFIG_FILE);
      // writeFile mode 는 O_CREAT 시 적용 → 기존 파일은 0o644 그대로 유지
      expect(fileStat.mode & 0o777).toBe(0o644);
    },
  );
});
