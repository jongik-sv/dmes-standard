// ERD 캔버스 편집 시험 공용 — 가짜 편집 문맥. 시험 파일이 아니다(vitest 는 *.test.ts 만 모은다).
// 가짜 문맥은 FE1 Task 9 의 fakeEditContext(erd-fixtures.ts) 위에 이 레인의 기본값만 얹는다(README "화면 내부 계약").
// 그래서 FE1 이 ErdEditContext 에 칸을 더해도 여기를 고치지 않는다.
import { vi } from "vitest";

import type { ApplyOutcome, ErdEditContext, ErdNotice, Right } from "../../../pages/dma/erdEdit/edit-context";
import type { ErdCommandJson } from "../../../pages/dma/erdEdit/types";
import { MENU_DIAGRAMS, fakeEditContext, menuModel, stateOf } from "./erd-fixtures";

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
