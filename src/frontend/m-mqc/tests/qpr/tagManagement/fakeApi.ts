/**
 * Tag관리 서버 대역 — docs/mqc/demo/tag-contract.md 의 search·save·approve·reset 을 메모리로 흉내 낸다.
 * `toResult` 를 거치게 해 실제 응답 모양도 함께 시험한다.
 */
import { toResult, type DocState, type SaveParams, type TagApi } from "@/qpr/tagManagement/api";

interface Doc {
  ver: number;
  state: DocState;
  json: string;
  base: string;
  updatedAt: string;
}

export class FakeTagServer {
  doc: Doc | null = null;
  versions: { ver: number; memo: string; approvedAt: string; approvedBy: string }[] = [];
  hist: { at: string; act: string; msg: string; by: string }[] = [];
  calls: { action: string; params: unknown }[] = [];
  private clock = 0;

  private now() {
    this.clock++;
    return `2026-11-25T10:${String(Math.floor(this.clock / 60)).padStart(2, "0")}:${String(this.clock % 60).padStart(2, "0")}`;
  }
  private log(act: string, msg: string) {
    this.hist.unshift({ at: this.now(), act, msg, by: "tester" });
  }

  search() {
    return { doc: this.doc ? { ...this.doc, updatedBy: "tester" } : null, versions: [...this.versions], hist: this.hist.slice(0, 100) };
  }
  save(p: SaveParams) {
    if (p.act === "INIT") {
      if (this.doc) throw new Error("이미 문서가 있습니다.");
      const at = this.now();
      this.doc = { ver: 1, state: "APPLIED", json: p.json, base: p.json, updatedAt: at };
      this.versions.unshift({ ver: 1, memo: p.msg, approvedAt: at, approvedBy: "tester" });
      this.log("INIT", p.msg);
      return { ver: 1, state: "APPLIED" as DocState, updatedAt: at };
    }
    if (!this.doc) throw new Error("문서가 없습니다.");
    if (this.doc.state === "PENDING" && p.act !== "UNREQUEST") throw new Error("승인 대기 중에는 고칠 수 없습니다. 승인 요청을 먼저 취소하세요.");
    if (p.act === "DISCARD") {
      this.doc = { ...this.doc, json: this.doc.base, state: "APPLIED" };
    } else {
      const state: DocState = p.act === "REQUEST" ? "PENDING" : p.state === "APPLIED" ? "APPLIED" : "DRAFT";
      this.doc = { ...this.doc, json: p.json || this.doc.json, state };
    }
    this.doc.updatedAt = this.now();
    this.log(p.act, p.msg);
    return { ver: this.doc.ver, state: this.doc.state, updatedAt: this.doc.updatedAt };
  }
  approve(memo: string) {
    if (!this.doc || this.doc.state !== "PENDING") throw new Error("승인 대기 중인 문서가 없습니다.");
    const at = this.now();
    this.doc = { ...this.doc, ver: this.doc.ver + 1, base: this.doc.json, state: "APPLIED" };
    this.versions.unshift({ ver: this.doc.ver, memo, approvedAt: at, approvedBy: "tester" });
    this.log("APPROVE", memo);
    return { ver: this.doc.ver, approvedAt: at };
  }
  reset() {
    this.doc = null;
    this.versions = [];
    this.hist = [];
    this.log("RESET", "시연 초기화");
  }

  api(): TagApi {
    const rec = <T>(action: string, params: unknown, fn: () => T) => {
      this.calls.push({ action, params });
      return Promise.resolve().then(fn);
    };
    return {
      search: () => rec("search", {}, () => toResult(JSON.parse(JSON.stringify(this.search())) as Record<string, unknown>)),
      save: (p) => rec("save", p, () => this.save(p)),
      approve: (memo) => rec("approve", { memo }, () => this.approve(memo)),
      reset: () => rec("reset", {}, () => void this.reset()),
    };
  }
}
