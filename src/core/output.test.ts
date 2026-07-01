// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  reportWrite,
  writeJson,
  writeLines,
  writeTable,
} from "./output";

function capture() {
  const out: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation(
    (chunk: string | Uint8Array) => {
      out.push(String(chunk));
      return true;
    },
  );
  return () => out.join("");
}

const view = {
  table: { columns: ["id"], rows: [["1"]] as (string | number)[][] },
  json: { id: "1" },
  ids: ["1"],
};

describe("render", () => {
  afterEach(() => vi.restoreAllMocks());

  it("--json → 원자료 JSON", () => {
    const read = capture();
    render({ json: true }, view);
    expect(JSON.parse(read())).toEqual({ id: "1" });
  });

  it("--quiet → 식별자만", () => {
    const read = capture();
    render({ quiet: true }, view);
    expect(read()).toBe("1\n");
  });

  it("기본 → 표(헤더 포함)", () => {
    const read = capture();
    render({}, view);
    expect(read()).toContain("id");
  });
});

describe("reportWrite", () => {
  afterEach(() => vi.restoreAllMocks());
  const result = { json: { status: "updated" }, id: "1", message: "수정됨" };

  it("--json → 상태 객체", () => {
    const read = capture();
    reportWrite({ json: true }, result);
    expect(JSON.parse(read())).toEqual({ status: "updated" });
  });

  it("--quiet → id 한 줄", () => {
    const read = capture();
    reportWrite({ quiet: true }, result);
    expect(read()).toBe("1\n");
  });

  it("기본 → 사람이 읽는 메시지", () => {
    const read = capture();
    reportWrite({}, result);
    expect(read()).toBe("수정됨\n");
  });
});

describe("writeJson", () => {
  afterEach(() => vi.restoreAllMocks());

  it("2-스페이스 들여쓰기 + 개행", () => {
    const read = capture();
    writeJson({ a: 1 });
    expect(read()).toBe('{\n  "a": 1\n}\n');
  });
});

describe("writeLines", () => {
  afterEach(() => vi.restoreAllMocks());

  it("여러 줄을 개행으로 합친다", () => {
    const read = capture();
    writeLines(["a", "b", "c"]);
    expect(read()).toBe("a\nb\nc\n");
  });

  it("빈 배열이면 아무것도 쓰지 않는다", () => {
    const read = capture();
    writeLines([]);
    expect(read()).toBe("");
  });
});

describe("writeTable", () => {
  afterEach(() => vi.restoreAllMocks());

  it("헤더와 여러 행을 모두 렌더링한다(숫자 셀 문자열화)", () => {
    const read = capture();
    writeTable({
      columns: ["id", "name"],
      rows: [
        [1, "가"],
        [2, "나"],
      ],
    });
    const out = read();
    expect(out).toContain("id");
    expect(out).toContain("name");
    expect(out).toContain("가");
    expect(out).toContain("나");
    expect(out).toContain("1");
    expect(out).toContain("2");
  });
});
