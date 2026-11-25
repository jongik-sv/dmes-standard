/**
 * Tag관리 OASIS 호출 — POST /api/mqc/oasis/tagManagement/{search|save|approve|reset}.
 * 계약: docs/mqc/demo/tag-contract.md. 문서 본문은 문자열 파라미터 `json` 으로 보낸다(params 에 배열·객체 금지).
 * 화면은 `TagApi` 로만 서버와 말한다 — 시험은 같은 모양의 가짜를 넘긴다.
 */
import { callOasis } from "@/common/oasis";

export const SCREEN_ID = "tagManagement";

export type DocState = "APPLIED" | "DRAFT" | "PENDING";
export type SaveAct = "INIT" | "DRAFT" | "REQUEST" | "UNREQUEST" | "DISCARD";

export interface ServerDoc {
  ver: number;
  state: DocState;
  json: string;
  base: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}
export interface VersionRow {
  ver: number;
  memo: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
}
export interface HistRow {
  at: string;
  act: string;
  msg: string | null;
  by: string | null;
}
export interface SearchResult {
  doc: ServerDoc | null;
  versions: VersionRow[];
  hist: HistRow[];
}
export interface SaveParams {
  json: string;
  state: DocState;
  act: SaveAct;
  msg: string;
}

export interface TagApi {
  search(): Promise<SearchResult>;
  save(p: SaveParams): Promise<{ ver: number; state: DocState; updatedAt?: string }>;
  approve(memo: string): Promise<{ ver: number; approvedAt?: string }>;
  reset(): Promise<void>;
}

/** 서버 응답을 화면 모양으로(빠진 배열은 빈 배열). */
export function toResult(out: Record<string, unknown>): SearchResult {
  const doc = out.doc && typeof out.doc === "object" ? (out.doc as ServerDoc) : null;
  return {
    doc: doc && doc.json ? { ...doc, ver: Number(doc.ver) || 1 } : null,
    versions: Array.isArray(out.versions) ? (out.versions as VersionRow[]) : [],
    hist: Array.isArray(out.hist) ? (out.hist as HistRow[]) : [],
  };
}

const call = <T>(action: string, params: object = {}) => callOasis<T>(SCREEN_ID, action, params);

export const realApi: TagApi = {
  async search() {
    return toResult(await call<Record<string, unknown>>("search"));
  },
  save: (p) => call("save", { json: p.json, state: p.state, act: p.act, msg: p.msg.slice(0, 1000) }),
  approve: (memo) => call("approve", { memo: memo.slice(0, 1000) }),
  async reset() {
    await call("reset");
  },
};
