// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import { rm } from "node:fs/promises";
import { CONFIG_FILE, loadConfig, loadRawConfig, saveConfig } from "./config";

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
