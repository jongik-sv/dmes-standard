/**
 * 양식 3종 정의 — 목업에서 추출한 data/formdef.json 에 「등록된 칸」(Cr·Ni·… 화학성분, 도료사)의 머리 구조를 덧붙인다(목업 EXTRA 반복문과 같다).
 */
import RAW from "../data/formdef.json";

import { EXTRA } from "./constants";
import { textToHtml } from "./text";
import type { FormDef, FormKey } from "./types";

function withExtra(raw: Record<FormKey, FormDef>): Record<FormKey, FormDef> {
  const out = JSON.parse(JSON.stringify(raw)) as Record<FormKey, FormDef>;
  for (const [fk, D] of Object.entries(out) as [FormKey, FormDef][]) {
    for (const x of EXTRA) {
      const H = D.heights.length;
      const cid = D.cells.length;
      if (x.like) {
        // 같은 묶음 칸의 머리 구조를 그대로 쓰고 맨 아래 칸만 새로
        const s = D.leaf[x.like];
        D.cells.push({ ...D.cells[s.top], t: textToHtml(x.lb[fk]) });
        D.leaf[x.k] = { ...s, occ: s.occ.map((c) => (c === s.top ? cid : c)), top: cid };
      } else {
        // 머리 전체 높이를 차지하는 단독 칸
        D.cells.push({ r: 0, rs: H, st: "font-size:8pt", vert: false, vst: null, t: textToHtml(x.lb[fk]) });
        D.leaf[x.k] = { w: 15, td: "", occ: Array(H).fill(cid), top: cid };
      }
    }
  }
  return out;
}

export const FORMDEF: Record<FormKey, FormDef> = withExtra(RAW as unknown as Record<FormKey, FormDef>);
