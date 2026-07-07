# npm 배포 절차 (PUBLISHING)

`dooray-agent` 를 npm registry 에 올려 `npm i -g dooray-agent` 한 줄로 설치 가능하게 하는 절차.
**실제 `npm publish` 는 자격증명이 필요한 수동 단계**다 — 아래는 그 체크리스트다.

## 무엇이 배포되나

`package.json` 의 `files` allowlist 로 tarball 내용이 결정된다:

- `dist/*.js` — **실행 산출물**(`dist/cli.js`·`dist/mcp.js`). bin 3개(`dooray-agent`·`dra`·`dooray-agent-mcp`)가 여기를 가리킨다. TypeScript 원본(`src/`)은 싣지 않는다 — 사용자는 컴파일 없이 실행한다.
- `skills/`·`README.md`·`LICENSE`.
- **소스맵(`dist/*.map`)은 제외** — 실행 불필요, 패키지 ~60% 감량. 디버깅이 필요하면 소스에서 빌드해 재현한다.

> 왜 `dist` 를 미리 빌드해 싣나: npm registry 설치는 tarball 을 **그대로 압축 해제**할 뿐 빌드하지 않는다. `tsup`/`typescript` 는 devDependencies 라 `npm i -g` 시 설치되지 않는다. 따라서 실행 가능한 JS 를 미리 빌드해 실어야 bin 심링크가 실존 파일을 가리킨다.

## 사전 점검 (매 배포)

```bash
node_modules/.bin/tsc --noEmit        # 타입 clean
node_modules/.bin/vitest run          # 244 tests (243 + 1 known-limitation xfail)
node_modules/.bin/eslint .            # lint clean
node_modules/.bin/tsup                # dist 최신 빌드
npm pack --dry-run                    # tarball 내용·크기 확인 (.map 없어야, dist/*.js 있어야)
```

`npm pack --dry-run` 기대치: 6 파일(LICENSE·README·dist/cli.js·dist/mcp.js·package.json·skills/dooray-agent/SKILL.md), `.map` 없음.

### tarball 설치 스모크 (배포 직전 권장 — "남이 설치하면 되는가")

실제 tarball 을 격리 디렉터리에 설치해 bin·의존성·ESM 이 정상 동작하는지 확인한다(publish 없이):

```bash
npm run build && TARBALL=$(npm pack)                 # dooray-agent-<ver>.tgz
D=$(mktemp -d) && cd "$D" && npm init -y >/dev/null
npm install "$OLDPWD/$TARBALL"                        # deps 포함 실제 설치
HOME=$(mktemp -d) node_modules/.bin/dra --help        # CLI 부팅
HOME=$(mktemp -d) node_modules/.bin/dra whoami --json # → code:4 (미설정, 크래시 아님)
node_modules/.bin/dooray-agent-mcp                    # stdio MCP — initialize/tools/list 로 27툴 확인
```

기대: bin 3개(`dra`·`dooray-agent`·`dooray-agent-mcp`) 링크, 런타임 deps(ky·commander·chalk·imapflow·nodemailer·mailparser·@modelcontextprotocol/sdk) 설치, CLI/MCP 정상 부팅. (2026-07-07 검증 완료.)

## 배포

```bash
npm login                             # 최초 1회 (2FA 권장)
npm version patch                     # or minor/major — package.json version bump + git tag
npm publish                           # prepublishOnly 가 npm run build 로 dist 재빌드 후 업로드
```

- `prepublishOnly: "npm run build"` — 배포 직전 자동 재빌드(패키지매니저 독립: pnpm 불요).
- 이름 `dooray-agent` 은 미배포 상태라 최초 publish 시 확보된다(unscoped, public).
- 2FA 사용 시 OTP 입력 프롬프트.

## 배포 후 검증

```bash
npm view dooray-agent version                     # 게시 버전 확인
npm i -g dooray-agent && dra --help               # 전역 설치 후 실행
dra login --token <T> --base-url https://api.dooray.com && dra whoami
```

Claude Desktop 커넥터는 전역 설치 시 `"command": "dooray-agent-mcp"` 한 줄로 단순해진다(`docs/mcp-quickstart.md` §1).

## 롤백

npm 은 게시 후 24시간 내 `npm unpublish dooray-agent@<ver>` 가능(이후 제한). 잘못 올렸으면 즉시 `npm deprecate` 후 patch 재배포가 안전하다.
