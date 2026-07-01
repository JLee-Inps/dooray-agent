// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";

const CACHE_DIR = join(homedir(), ".dooray-agent", "cache");

interface Envelope<T> {
  savedAt: number;
  data: T;
}

/** 캐시 TTL 상수. */
export const TTL = {
  hour: 3_600_000,
  day: 86_400_000,
} as const;

async function read<T>(key: string): Promise<Envelope<T> | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, `${key}.json`), "utf8");
    return JSON.parse(raw) as Envelope<T>;
  } catch {
    return null;
  }
}

async function write<T>(key: string, data: T): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const envelope: Envelope<T> = { savedAt: Date.now(), data };
  await writeFile(join(CACHE_DIR, `${key}.json`), JSON.stringify(envelope));
}

/**
 * key 캐시가 ttl 이내면 그대로 반환하고, 아니면 loader 로 새로 불러 저장한다.
 * 조회 결과(프로젝트·멤버·태그 등)를 재사용해 반복 호출을 줄인다.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const envelope = await read<T>(key);
  if (envelope && Date.now() - envelope.savedAt < ttlMs) return envelope.data;
  const data = await loader();
  await write(key, data);
  return data;
}

/** 캐시 전체를 비운다. */
export async function clearCache(): Promise<void> {
  await rm(CACHE_DIR, { recursive: true, force: true });
}
