/**
 * 검사증명서관리 OASIS 호출 — POST /api/mqc/oasis/inspectionCertificate/{search|save|reg|issue|reissue|reset|confirm}.
 * 계약: docs/mqc/demo/mtc-contract.md. JSON 본문은 문자열 파라미터(json·snap)로 보낸다(params 에 배열·객체 금지).
 * 화면은 `MtcApi` 로만 서버와 말한다 — 시험은 같은 모양의 가짜를 넘긴다.
 */
import { callOasis } from "@/common/oasis";

import type { Cert, FormKey, FormState, Img, Ovr, Rule, Snap } from "./engine/types";

export const SCREEN_ID = "inspectionCertificate";

export type MtcKind = "FORM" | "RULE" | "CERT" | "OVR" | "IMG";

export interface Issued {
  certId: string;
  mtcNo: string;
  issueNo: number;
  issuedAt: string;
  reissueCnt: number;
  reason: string | null;
  snap: Snap;
  verifyCode?: string | null;
  docHash?: string | null;
}

export interface HistRow {
  at: string;
  docNo: string | null;
  act: string;
  msg: string | null;
  reason: string | null;
  by: string | null;
}

/** 서버 저장값 전부(`search`). */
export interface MtcData {
  forms: Record<FormKey, FormState>;
  rules: Rule[];
  certs: Record<string, Cert>;
  ovrs: Record<string, Ovr>;
  imgs: (Img & { updatedAt?: string })[];
  issued: Issued[];
  hist: HistRow[];
}

export interface SaveParams {
  kind: MtcKind;
  key: string;
  /** 본문. null 이면 삭제. */
  json: unknown | null;
  act: string;
  msg: string;
  reason?: string;
}

export type VerifyStatus = "GENUINE" | "TAMPERED" | "SUPERSEDED" | "NOT_FOUND";
export interface VerifyResult {
  status: VerifyStatus;
  mtcNo?: string | null;
  issueNo?: number | null;
  issuedAt?: string | null;
  reissueCnt?: number | null;
  docHash?: string | null;
}

export interface MtcApi {
  search(): Promise<MtcData>;
  save(p: SaveParams): Promise<{ key: string; updatedAt?: string }>;
  reg(sourceCertId: string): Promise<{ certId: string; cert: Cert }>;
  issue(certId: string, snap: Snap, msg: string): Promise<{ certId: string; issueNo: number; issuedAt: string; verifyCode?: string; docHash?: string }>;
  reissue(certId: string, snap: Snap, reason: string, msg: string): Promise<{ certId: string; reissueCnt: number; issuedAt: string; verifyCode?: string; docHash?: string }>;
  reset(): Promise<void>;
  confirm(verifyCode: string, snap?: Snap): Promise<VerifyResult>;
}

interface Stored {
  key: string;
  json: string;
  updatedAt?: string;
}
interface RawIssued extends Omit<Issued, "snap"> {
  snap: string | Snap;
}

const parse = <T>(s: unknown): T => (typeof s === "string" ? (JSON.parse(s) as T) : (s as T));

/** 규칙 목록 순서 = 시작 규칙(R·S) 번호 순 → 화면에서 만든 규칙(U) 번호 순. 같은 우선순위에서는 목록 뒤쪽이 이긴다. */
export function ruleOrder(id: string) {
  const n = Number(id.replace(/^\D+/, "")) || 0;
  return id.startsWith("R") ? n : id.startsWith("S") ? 100 + n : 1000 + n;
}
/** 증명서 순서 = 예시(C) → 신규 수신(N). */
export const certOrder = (id: string) => (id.startsWith("C") ? 0 : 100000) + (Number(id.replace(/^\D+/, "")) || 0);

/** 시드 이미지 순서(서명 발령 순 → 도장). 그 뒤에 올린 이미지가 올린 순서로 붙는다. */
export const BASE_IMGS = [
  "Z_MTC_SIGN_20150101.bmp",
  "Z_MTC_SIGN_20160101.JPG",
  "Z_MTC_SIGN_20160201.JPG",
  "Z_MTC_SIGN_20180701.JPG",
  "Z_MTC_SIGN_20181201.JPG",
  "Z_MTC_SIGN_20190101.JPG",
  "Z_MTC_SIGN_20210101.JPG",
  "Z_MTC_SIGN_20240101.jpg",
  "Z_MTC_SIGN_20251229.png",
  "cm_stamp.png",
  "cm_stamp2.png",
];
const imgOrder = (name: string) => {
  const i = BASE_IMGS.indexOf(name);
  return i < 0 ? BASE_IMGS.length : i;
};

/** 서버 응답을 화면 상태로. */
export function toData(out: Record<string, unknown>): MtcData {
  const rows = (k: string) => (Array.isArray(out[k]) ? (out[k] as Stored[]) : []);
  const forms = Object.fromEntries(rows("forms").map((r) => [r.key, parse<FormState>(r.json)])) as Record<FormKey, FormState>;
  const rules = rows("rules")
    .map((r) => parse<Rule>(r.json))
    .sort((a, b) => ruleOrder(a.id) - ruleOrder(b.id));
  const certs = Object.fromEntries(
    rows("certs")
      .sort((a, b) => certOrder(a.key) - certOrder(b.key))
      .map((r) => [r.key, parse<Cert>(r.json)]),
  );
  const ovrs = Object.fromEntries(rows("ovrs").map((r) => [r.key, parse<Ovr>(r.json)]));
  const imgs = rows("imgs")
    .map((r) => ({ name: r.key, updatedAt: r.updatedAt ?? "", ...parse<Omit<Img, "name">>(r.json) }))
    .sort((a, b) => imgOrder(a.name) - imgOrder(b.name) || a.updatedAt.localeCompare(b.updatedAt) || a.name.localeCompare(b.name));
  const issued = (Array.isArray(out.issued) ? (out.issued as RawIssued[]) : []).map((x) => ({ ...x, snap: parse<Snap>(x.snap) }));
  const hist = Array.isArray(out.hist) ? (out.hist as HistRow[]) : [];
  return { forms, rules, certs, ovrs, imgs, issued, hist };
}

const call = <T>(action: string, params: object = {}) => callOasis<T>(SCREEN_ID, action, params);

export const realApi: MtcApi = {
  async search() {
    return toData(await call<Record<string, unknown>>("search"));
  },
  save: (p) =>
    call("save", { kind: p.kind, key: p.key, json: p.json == null ? "" : JSON.stringify(p.json), act: p.act, msg: p.msg, reason: p.reason ?? "" }),
  async reg(sourceCertId) {
    const out = await call<{ certId: string; json: string | Cert }>("reg", { sourceCertId });
    return { certId: out.certId, cert: parse<Cert>(out.json) };
  },
  issue: (certId, snap, msg) => call("issue", { certId, snap: JSON.stringify(snap), msg }),
  reissue: (certId, snap, reason, msg) => call("reissue", { certId, snap: JSON.stringify(snap), reason, msg }),
  async reset() {
    await call("reset");
  },
  confirm: (verifyCode, snap) => call<VerifyResult>("confirm", snap ? { verifyCode, snap: JSON.stringify(snap) } : { verifyCode }),
};
