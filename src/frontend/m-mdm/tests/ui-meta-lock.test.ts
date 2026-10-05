/**
 * 컬럼 사전 연결(meta) 고정 시험 — m-mcm·m-mdm·m-mls 소스의 열 정의·`cell()`·`<MdmFieldLabel>` 마다 효과 meta 값을 정적으로 뽑아
 * 기록(fixtures/ui-meta-lock.json)과 견준다. 열 도우미(`uiCols`)·라벨 상수로 묶는 리팩토링이 「어떤 칸이 사전에 이어지는가」를 바꾸지 않았는지 확인한다.
 * 연결을 일부러 바꿨다면 `UPDATE_UI_META_LOCK=1 pnpm vitest run tests/ui-meta-lock.test.ts` 로 기록을 다시 쓰고 diff 를 리뷰한다.
 * 추출 규칙은 tests/support/meta-map.ts 머리 주석.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { collectMetaMap, metaEntriesOf } from "./support/meta-map";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "../..");
const lockFile = path.join(here, "fixtures/ui-meta-lock.json");

describe("meta 추출 규칙", () => {
  it("열 정의의 효과 meta — 명시 false·문자열·없음", () => {
    const src = `const A = [{ key: "a", meta: false }, { key: "b", meta: "B_COL" }, { key: "c" }];`;
    expect(metaEntriesOf(src)).toEqual(['col|a|false', 'col|b|"B_COL"', "col|c|-"]);
  });

  it("uiCols 안의 열 — meta 가 없으면 사전 key 목록 밖은 false", () => {
    const src = `const A = uiCols([{ key: "a" }, { key: "b" }, { key: "c", meta: "C_COL", children: [{ key: "d" }] }], ["b"]);`;
    expect(metaEntriesOf(src)).toEqual(['col|a|false', "col|b|-", 'col|c|"C_COL"', "col|d|false"]);
  });

  it("uiCols 인자가 리터럴이 아니면 멈춘다", () => {
    expect(() => metaEntriesOf(`const A = uiCols(BASE, ["b"]);`)).toThrow(/uiCols/);
    expect(() => metaEntriesOf(`const A = uiCols([{ key: "a" }], DICT);`)).toThrow(/uiCols/);
  });

  it("라벨 — 명시·상수 펼침", () => {
    const src = `const A = <><MdmFieldLabel name="x" label="엑스" meta={false} /><MdmFieldLabel {...DESCRIPTION_LABEL} /><MdmFieldLabel name="y" /></>;`;
    expect(metaEntriesOf(src, "a.tsx")).toEqual([
      "label|description|설명|false",
      "label|x|엑스|false",
      "label|y||-",
    ]);
  });
});

describe("화면 소스의 컬럼 사전 연결 고정", () => {
  it("기록과 같다", () => {
    const actual = collectMetaMap(frontendRoot, ["m-mcm", "m-mdm", "m-mls"]);
    if (process.env.UPDATE_UI_META_LOCK === "1") {
      fs.mkdirSync(path.dirname(lockFile), { recursive: true });
      fs.writeFileSync(lockFile, JSON.stringify(actual, null, 1) + "\n");
    }
    const locked = JSON.parse(fs.readFileSync(lockFile, "utf8")) as Record<string, string[]>;
    expect(actual).toEqual(locked);
  });
});
