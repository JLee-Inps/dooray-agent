// Copyright (c) 2026 JLee-Inps
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import { matchByName } from "./match";
import { AppError } from "../core/errors";

interface Item {
  id: string;
  name: string;
}

const name = (item: Item) => item.name;
const describeItem = (item: Item) => `${item.name} (${item.id})`;

function pick(items: Item[], input: string): Item {
  return matchByName(items, input, "항목", name, describeItem);
}

describe("matchByName", () => {
  it("정확 일치를 부분 일치보다 우선한다", () => {
    const items: Item[] = [
      { id: "1", name: "개발" },
      { id: "2", name: "개발팀" },
    ];
    expect(pick(items, "개발").id).toBe("1");
  });

  it("정확 일치가 없으면 부분 일치를 고른다", () => {
    const items: Item[] = [{ id: "2", name: "개발팀" }];
    expect(pick(items, "개발").id).toBe("2");
  });

  it("후보가 2개 이상이면 AppError 를 던진다", () => {
    const items: Item[] = [
      { id: "1", name: "개발팀" },
      { id: "2", name: "개발실" },
    ];
    expect(() => pick(items, "개발")).toThrow(AppError);
    try {
      pick(items, "개발");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).toContain("여러 개");
    }
  });

  it("찾지 못하면 AppError 를 던진다", () => {
    const items: Item[] = [{ id: "1", name: "개발" }];
    expect(() => pick(items, "없음")).toThrow(AppError);
    try {
      pick(items, "없음");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).message).toContain("찾을 수 없습니다");
    }
  });

  it("빈 이름 항목은 후보에서 제외한다", () => {
    const items: Item[] = [
      { id: "1", name: "" },
      { id: "2", name: "개발" },
    ];
    expect(pick(items, "개발").id).toBe("2");
  });

  it("모든 항목의 이름이 비어 있으면 찾지 못해 AppError 를 던진다", () => {
    const items: Item[] = [{ id: "1", name: "" }];
    expect(() => pick(items, "개발")).toThrow(AppError);
  });
});
