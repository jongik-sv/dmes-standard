// 테스트 케이스 수정 팝업의 폼 ↔ JSON 변환(카드 ⑥).
import { describe, expect, it } from "vitest";

import {
  expectedFormOf,
  expectedJsonOf,
  hitOptionsOf,
  inputFormOf,
  inputJsonOf,
  orderHitIds,
  parseObject,
  resultSlots,
} from "../../../pages/dme/ruleEdit/value-test/case-form";
import { SAMPLE_ROWS, SAMPLE_VARS } from "./fixtures";

const NAMES = ["COIL_THK", "COIL_WID", "SURF_GRD"];
const SLOTS = resultSlots(SAMPLE_VARS);

describe("입력 폼", () => {
  it("계약 이름 순서로 줄을 만들고, 없는 키는 키 보냄 끔, null 은 빈 칸, 계약 밖 키는 뒤에 extra 로 남긴다", () => {
    const rows = inputFormOf(NAMES, '{"surf_grd":"A","OLD_KEY":5,"COIL_THK":null}');
    expect(rows).toEqual([
      { key: "COIL_THK", value: "", on: true, extra: false },
      { key: "COIL_WID", value: "", on: false, extra: false },
      { key: "SURF_GRD", value: "A", on: true, extra: false },
      { key: "OLD_KEY", value: "5", on: true, extra: true },
    ]);
  });

  it("계약 이름이 없으면 모든 키가 extra 줄이다", () => {
    expect(inputFormOf([], '{"A":"1"}')).toEqual([{ key: "A", value: "1", on: true, extra: true }]);
  });

  it("폼 → JSON: 키 보냄 끔은 빼고, 빈 칸은 null, 값은 문자열, extra 도 싣는다", () => {
    const rows = inputFormOf(NAMES, '{"COIL_THK":"0.65","OLD_KEY":5}');
    rows[0].value = "0.70";
    rows[2] = { ...rows[2], on: true, value: "" };
    expect(inputJsonOf(rows)).toBe('{"COIL_THK":"0.70","SURF_GRD":null,"OLD_KEY":"5"}');
  });

  it("빼기로 지운 extra 줄은 JSON 에서 사라진다", () => {
    const rows = inputFormOf(NAMES, '{"COIL_THK":"1","OLD_KEY":5}').filter((r) => r.key !== "OLD_KEY");
    expect(inputJsonOf(rows)).toBe('{"COIL_THK":"1"}');
  });

  it("JSON 객체가 아니면 읽지 못한 이유를 던진다", () => {
    expect(() => inputFormOf(NAMES, "{")).toThrow("입력 JSON 을 읽지 못했습니다");
    expect(() => parseObject("[1]", "입력")).toThrow("JSON 객체");
  });
});

describe("기대 폼", () => {
  it("결과 변수 줄(있는 키만 비교), hit, 계약 밖 키를 푼다", () => {
    const f = expectedFormOf(SLOTS, '{"PRC_FCT":1.05,"hit":[1,3],"X":"y"}');
    expect(f.none).toBe(false);
    expect(f.rows).toEqual([
      { key: "QLTY_GRD", value: "", on: false, extra: false },
      { key: "PRC_FCT", value: "1.05", on: true, extra: false },
      { key: "X", value: "y", on: true, extra: true },
    ]);
    expect(f.hit).toEqual({ on: true, rowIds: [1, 3] });
  });

  it("빈 기대 JSON 은 기대값 없이 돌려 보기만이다", () => {
    const f = expectedFormOf(SLOTS, "  ");
    expect(f.none).toBe(true);
    expect(expectedJsonOf(SLOTS, f)).toBe("");
  });

  it("폼 → JSON: 숫자 결과 변수는 적은 글자 그대로 숫자, 문자 변수는 문자열, 비교 끔은 뺀다", () => {
    const f = expectedFormOf(SLOTS, "{}");
    f.rows[0] = { ...f.rows[0], on: true, value: "A" };
    f.rows[1] = { ...f.rows[1], on: true, value: "1.050" };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"QLTY_GRD":"A","PRC_FCT":1.050}');
    f.rows[0] = { ...f.rows[0], on: false };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"PRC_FCT":1.050}');
  });

  it("hit 은 고른 행이 없으면 null, 하나면 숫자, 여럿이면 배열이다", () => {
    const f = expectedFormOf(SLOTS, "{}");
    f.hit = { on: true, rowIds: [] };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"hit":null}');
    f.hit = { on: true, rowIds: [3] };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"hit":3}');
    f.hit = { on: true, rowIds: [1, 2] };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"hit":[1,2]}');
  });

  it("빈 칸은 null, 배열 글자는 배열, extra 의 숫자 글자는 숫자로 싣는다", () => {
    const f = expectedFormOf(SLOTS, '{"QLTY_GRD":null,"X":2}');
    f.rows[1] = { ...f.rows[1], on: true, value: "[1.0,2]" };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"QLTY_GRD":null,"PRC_FCT":[1,2],"X":2}');
  });

  it("다시 풀면 같은 폼이 된다(왕복)", () => {
    const json = '{"QLTY_GRD":"B","PRC_FCT":0.98,"hit":3}';
    expect(expectedJsonOf(SLOTS, expectedFormOf(SLOTS, json))).toBe(json);
  });
});

describe("결과 열 그룹", () => {
  // QLTY_GRD 는 그룹 밖, 숫자 열 셋(PRC_FCT·A·B)은 그룹 SPD 다 — 엔진 결과 이름은 그룹 이름 하나다.
  const num = (varId: number, seq: number, varName: string) => ({ ...SAMPLE_VARS.find((v) => v.varName === "PRC_FCT")!, varId, seq, varName });
  const vars = [...SAMPLE_VARS, num(6, 3, "SPD_A"), num(7, 4, "SPD_B")];
  const meta = [
    { varId: 5, resGrp: "BASE_SPD" },
    { varId: 6, resGrp: " BASE_SPD " },
    { varId: 7, resGrp: "base_spd" },
    { varId: 4, resGrp: "  " },
  ];

  it("그룹에 든 결과 열은 첫 열 자리에 그룹 이름 한 줄로 묶고, 공백 그룹은 그룹이 아니다", () => {
    const slots = resultSlots(vars, meta);
    expect(slots.map((x) => [x.name, x.members])).toEqual([
      ["QLTY_GRD", []],
      ["BASE_SPD", ["PRC_FCT", "SPD_A", "SPD_B"]],
    ]);
  });

  it("기대 JSON 의 그룹 이름 키는 그룹 줄로 풀리고, 숫자 그룹 값은 숫자로 싣는다", () => {
    const slots = resultSlots(vars, meta);
    const f = expectedFormOf(slots, '{"BASE_SPD":90,"hit":3}');
    expect(f.rows).toEqual([
      { key: "QLTY_GRD", value: "", on: false, extra: false },
      { key: "BASE_SPD", value: "90", on: true, extra: false },
    ]);
    f.rows[1] = { ...f.rows[1], value: "95.0" };
    expect(expectedJsonOf(slots, f)).toBe('{"BASE_SPD":95.0,"hit":3}');
  });
});

describe("적중 행 후보", () => {
  it("NORMAL 은 seq 순, 기본 행은 끝이고, 저장 전 행(음수 ID)은 빼며, 표에 없는 고른 row_id 는 끝에 더한다", () => {
    const draft = { rowId: -1, seq: 4, rowKind: "NORMAL" as const, cells: "{}", note: null };
    const options = hitOptionsOf([SAMPLE_ROWS[3], SAMPLE_ROWS[2], draft, SAMPLE_ROWS[0], SAMPLE_ROWS[1]], [9]);
    expect(options).toEqual([
      { value: "1", label: "1행 · 광폭 A급" },
      { value: "2", label: "2행 · 광폭 B급" },
      { value: "3", label: "3행 · 후물" },
      { value: "4", label: "기본 행" },
      { value: "9", label: "row 9(표에 없음)" },
    ]);
  });

  it("고른 순서와 무관하게 후보 순서로 정렬해 hit 배열을 만든다", () => {
    const options = hitOptionsOf(SAMPLE_ROWS, []);
    const f = expectedFormOf(SLOTS, "{}");
    f.hit = { on: true, rowIds: orderHitIds(["3", "1"], options) };
    expect(expectedJsonOf(SLOTS, f)).toBe('{"hit":[1,3]}');
  });
});
