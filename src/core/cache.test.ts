// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, beforeEach } from "vitest";
import { cached, clearCache, TTL } from "./cache";

// test-setup 이 HOME 을 임시 디렉터리로 돌려두므로 실제 홈 캐시는 건드리지 않는다.

let counter = 0;
function uniqueKey(): string {
  counter += 1;
  return `cache-test-${Date.now()}-${counter}`;
}

describe("cached", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("miss 면 loader 를 호출해 값을 저장·반환한다", async () => {
    let calls = 0;
    const value = await cached(uniqueKey(), TTL.hour, async () => {
      calls += 1;
      return { n: 1 };
    });
    expect(value).toEqual({ n: 1 });
    expect(calls).toBe(1);
  });

  it("TTL 이내면 loader 를 다시 부르지 않고 캐시 값을 반환한다", async () => {
    const key = uniqueKey();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    const first = await cached(key, TTL.hour, loader);
    const second = await cached(key, TTL.hour, loader);
    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(calls).toBe(1);
  });

  it("TTL 이 0 이면 매번 만료로 보고 loader 를 다시 부른다", async () => {
    const key = uniqueKey();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    await cached(key, 0, loader);
    const second = await cached(key, 0, loader);
    expect(second).toBe(2);
    expect(calls).toBe(2);
  });

  it("clearCache 후에는 다시 loader 를 호출한다", async () => {
    const key = uniqueKey();
    let calls = 0;
    const loader = async () => {
      calls += 1;
      return calls;
    };
    await cached(key, TTL.hour, loader);
    await clearCache();
    const after = await cached(key, TTL.hour, loader);
    expect(after).toBe(2);
    expect(calls).toBe(2);
  });

  it("키가 다르면 서로 격리된다", async () => {
    const a = await cached(uniqueKey(), TTL.hour, async () => "A");
    const b = await cached(uniqueKey(), TTL.hour, async () => "B");
    expect(a).toBe("A");
    expect(b).toBe("B");
  });

  it("TTL 상수는 시간/일 밀리초다", () => {
    expect(TTL.hour).toBe(3_600_000);
    expect(TTL.day).toBe(86_400_000);
  });

  it("중첩 객체/배열도 그대로 직렬화·복원한다", async () => {
    const key = uniqueKey();
    const data = { list: [{ id: "1", name: "가" }], nested: { ok: true } };
    await cached(key, TTL.hour, async () => data);
    const restored = await cached(key, TTL.hour, async () => {
      throw new Error("호출되면 안 됨");
    });
    expect(restored).toEqual(data);
  });
});
