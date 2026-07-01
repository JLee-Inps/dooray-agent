// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { requireConfig } from "./config";
import { DoorayClient } from "../dooray/client";

/** 저장된 인증 정보로 Dooray 클라이언트를 만든다. */
export async function createClient(): Promise<DoorayClient> {
  const { token, baseUrl } = await requireConfig();
  return new DoorayClient(token, baseUrl);
}
