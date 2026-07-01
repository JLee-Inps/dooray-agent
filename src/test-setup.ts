// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 테스트 격리: HOME/USERPROFILE 을 OS 임시 디렉터리로 돌린다.
 * config(`~/.dooray-agent/config.json`)·cache(`~/.dooray-agent/cache`) 가
 * 사용자의 실제 홈을 건드리지 않고 버려지는 임시 경로에 쓰이게 한다.
 * setupFiles 는 테스트 모듈 import 보다 먼저 실행되므로,
 * cache/config 모듈이 로드 시 계산하는 경로가 이 임시 홈을 가리킨다.
 */
const tempHome = mkdtempSync(join(tmpdir(), "dooray-agent-test-"));
process.env.HOME = tempHome;
process.env.USERPROFILE = tempHome;
