/** 비교 — 목업 formDiff(양식 적용본 ↔ 초안)·snapDiff(발행본 ↔ 다시 계산한 결과). */
import { FTEXT, HEADF } from "./constants";
import type { Form, Snap } from "./types";

export interface FormDiffItem {
  key: string;
  name: string;
}

export function formDiff(a: Form, b: Form): FormDiffItem[] {
  const out: FormDiffItem[] = [];
  for (const [k, n] of FTEXT) if (a[k] !== b[k]) out.push({ key: k, name: n });
  for (const c of b.cols) {
    const o = a.cols.find((x) => x.k === c.k);
    if (!o) {
      out.push({ key: "col." + c.k, name: `칸 추가 (${b.labels[c.k].split("\n")[0]})` });
      continue;
    }
    if (a.labels[c.k] !== b.labels[c.k]) out.push({ key: "col." + c.k, name: `칸 이름 (${a.labels[c.k].split("\n")[0]})` });
    if (o.on !== c.on) out.push({ key: "col." + c.k, name: `칸 ${c.on ? "보이기" : "숨기기"} (${b.labels[c.k].split("\n")[0]})` });
  }
  for (const o of a.cols) if (!b.cols.some((x) => x.k === o.k)) out.push({ key: "order", name: `칸 빼기 (${a.labels[o.k].split("\n")[0]})` });
  const ka = new Set(a.cols.map((c) => c.k));
  const kb = new Set(b.cols.map((c) => c.k));
  if (
    a.cols
      .filter((c) => kb.has(c.k))
      .map((c) => c.k)
      .join() !==
    b.cols
      .filter((c) => ka.has(c.k))
      .map((c) => c.k)
      .join()
  )
    out.push({ key: "order", name: "칸 순서" });
  return out;
}

/** [항목, 지금 발행본, 다시 계산한 결과]. */
export type DiffRow = [string, string, string];

const NAMES: Record<string, string> = {
  "f.title": "제목",
  "f.statement": "하단 증명 문구",
  "f.signLabel": "서명자 표기",
  "f.legend": "범례",
  "f.maker": "제조자 문구",
  "f.docno": "문서번호",
  "m.1": "인증 번호",
  "m.2": "인증 번호 2",
};

export function snapDiff(a: Snap, b: Snap): DiffRow[] {
  const out: DiffRow[] = [];
  const t = (s: unknown) => (s == null || s === "" ? "(없음)" : String(s));
  if (a.fk !== b.fk || a.fver !== b.fver) out.push(["양식", `${a.fname} v${a.fver}`, `${b.fname} v${b.fver}`]);
  for (const k of new Set([...Object.keys(a.T), ...Object.keys(b.T)]))
    if ((a.T[k] || "") !== (b.T[k] || ""))
      out.push([
        NAMES[k] ||
          (k.startsWith("rm.") ? `REMARK ${+k.slice(3) + 1}줄` : k.startsWith("h.") ? (HEADF[b.fk].find((x) => x[0] === k.slice(2)) || ["", k.slice(2)])[1] : k),
        t(a.T[k]),
        t(b.T[k]),
      ]);
  if ((a.signImg || "") !== (b.signImg || "")) out.push(["서명 이미지", a.signImg || "(없음)", b.signImg || "(없음)"]);
  if ((a.stampImg || "") !== (b.stampImg || "")) out.push(["도장 이미지", a.stampImg || "(없음)", b.stampImg || "(없음)"]);
  for (const [k, n] of [
    ["qr", "QR"],
    ["stamp", "도장"],
  ] as const)
    if (!!a[k] !== !!b[k]) out.push([n, a[k] ? "표시" : "안 함", b[k] ? "표시" : "안 함"]);
  const cl = (r: Snap) => r.cols.map((c) => c.l.replace(/\n/g, " ")).join(" · ");
  if (cl(a) !== cl(b)) out.push(["표 칸", cl(a), cl(b)]);
  const lab = (k: string) => {
    const c = b.cols.find((x) => x.k === k) || a.cols.find((x) => x.k === k);
    return c ? c.l.replace(/\n/g, " ") : k;
  };
  (b.coils || []).forEach((cb, i) => {
    const ca = (a.coils || [])[i] || {};
    for (const k in cb) if (!k.startsWith("_") && String(ca[k] ?? "") !== String(cb[k] ?? "")) out.push([`코일 ${cb._id || i + 1} · ${lab(k)}`, t(ca[k]), t(cb[k])]);
  });
  return out;
}
