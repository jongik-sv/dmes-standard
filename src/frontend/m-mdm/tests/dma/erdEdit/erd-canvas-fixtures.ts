// ERD 캔버스 편집 시험 공용 — 가짜 편집 문맥. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
// 가짜 문맥은 FE1 Task 9 의 fakeEditContext(erd-fixtures.ts) 위에 이 레인의 기본값만 얹는다(README "화면 내부 계약").
// 그래서 FE1 이 ErdEditContext 에 칸을 더해도 여기를 고치지 않는다.
import { vi } from "vitest";

import type { ApplyOutcome, ErdEditContext, ErdNotice, Right } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson, ErdModelJson, ErdState } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, emptyModel, fakeEditContext, menuModel, relation, stateOf, table } from "./erd-fixtures";

export const OK: Right = { ok: true, reason: null };
export const deny = (reason: string): Right => ({ ok: false, reason });

export interface Applied {
  commands: ErdCommandJson[];
  label: string;
}

export interface FakeCtx extends ErdEditContext {
  /** apply 로 받은 묶음(차례대로). */
  applied: Applied[];
  /** apply 가 차례로 돌려줄 결과. 비면 받아들임(rev 4). */
  outcomes: ApplyOutcome[];
}

export function notice(over: Partial<ErdNotice> = {}): ErdNotice {
  return {
    code: "INVALID", label: "", message: "거절", hint: null, commandIndex: 0, elementId: null, property: null,
    byRev: null, byUserId: null, bySession: null, current: null, mine: null, choices: null, ...over,
  };
}

/** 메뉴(t-1, 자식)·오브젝트(t-2, 부모) 두 표, 다이어그램 d-all. 권한은 모두 있다. */
export function fakeCtx(over: Partial<ErdEditContext> = {}): FakeCtx {
  const applied: Applied[] = [];
  const outcomes: ApplyOutcome[] = [];
  const ctx = fakeEditContext(stateOf(menuModel(), MENU_DIAGRAMS), {
    modelId: "mcm", session: "ui-me", me: "tester",
    rights: { model: OK, diagram: OK, confirm: OK, manageEditors: OK, owner: true },
    diagramId: "d-all", selectedTableId: null,
    apply: vi.fn(async (commands: ErdCommandJson[], label: string): Promise<ApplyOutcome> => {
      applied.push({ commands, label });
      return outcomes.shift() ?? { ok: true, rev: 4, warnings: [] };
    }),
    ...over,
  });
  return { ...ctx, applied, outcomes };
}

/**
 * MCM 모양 모델 표 57개(주제별 나누기 시험용). TB_MCM_SEC_* 12(관계 없음), TB_MCM_CODE_* 3(SEC 와 관계 2개), TB_MCM_JOB_* 25(관계 묶음 15 + 10),
 * 기타 17(각자 다른 첫 토막, 관계 없음). 표 id 는 `t-<물리명 접미>` 소문자.
 */
export function mcmModel(): ErdModelJson {
  const m = emptyModel();
  const add = (phys: string) => {
    const id = `t-${phys.slice("TB_MCM_".length).toLowerCase()}`;
    m.tables[id] = table(phys, phys, []);
    return id;
  };
  const two = (n: number) => String(n).padStart(2, "0");
  let rel = 0;
  const link = (parent: string, child: string) => {
    m.relations[`r-${++rel}`] = relation(child, parent, []);
  };
  const sec = Array.from({ length: 12 }, (_, i) => add(`TB_MCM_SEC_${two(i + 1)}`));
  const code = Array.from({ length: 3 }, (_, i) => add(`TB_MCM_CODE_${two(i + 1)}`));
  link(sec[0], code[0]);
  link(sec[0], code[1]);
  const jobA = Array.from({ length: 15 }, (_, i) => add(`TB_MCM_JOB_A${two(i + 1)}`));
  for (let i = 1; i < jobA.length; i++) link(jobA[i - 1], jobA[i]);
  const jobB = Array.from({ length: 10 }, (_, i) => add(`TB_MCM_JOB_B${two(i + 1)}`));
  for (let i = 1; i < jobB.length; i++) link(jobB[i - 1], jobB[i]);
  for (let i = 0; i < 17; i++) add(`TB_MCM_X${two(i + 1)}`);
  return m;
}

/** mcmModel 을 담은 상태. 다이어그램 d-all(표 없음) 하나. */
export function mcmState(): ErdState {
  return stateOf(mcmModel(), { diagrams: [{ id: "d-all", areaName: "기본", diagramName: "전체", sortSeq: 0 }], nodes: [] });
}
