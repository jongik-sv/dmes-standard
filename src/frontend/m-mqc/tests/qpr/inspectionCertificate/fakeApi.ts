/**
 * 검사증명서 서버 대역 — docs/mqc/demo/mtc-contract.md 의 search·save·reg·issue·reissue·reset·confirm 을 메모리로 흉내 낸다.
 * 시작 값은 서버와 같은 시드(seed.json)다. `toData` 를 거치게 해 실제 응답(본문 = JSON 문자열) 모양도 함께 시험한다.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { toData, type MtcApi, type SaveParams } from "@/qpr/inspectionCertificate/api";
import type { Snap } from "@/qpr/inspectionCertificate/engine/types";

const SEED_PATH = path.resolve(__dirname, "../../../../../backend/mqc/lib/src/main/resources/mqc/mtc/seed.json");
export const SEED = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));

interface Doc {
  key: string;
  json: string;
  updatedAt: string;
}
interface Iss {
  certId: string;
  mtcNo: string;
  issueNo: number;
  issuedAt: string;
  reissueCnt: number;
  reason: string | null;
  snap: string;
  verifyCode: string | null;
  docHash: string | null;
}

const KINDS = { FORM: "forms", RULE: "rules", CERT: "certs", OVR: "ovrs", IMG: "imgs" } as const;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const code = (hash: string, no: number) => {
  const h = sha(hash + no).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${h.slice(0, 4)}-${h.slice(4, 8)}-${h.slice(8, 12)}`;
};

export class FakeMtcServer {
  docs!: Record<(typeof KINDS)[keyof typeof KINDS], Doc[]>;
  issued!: Iss[];
  hist!: { at: string; docNo: string | null; act: string; msg: string | null; reason: string | null; by: string | null }[];
  old = new Map<string, string>(); // 대체된 진위 확인 번호 → certId
  calls: { action: string; params: unknown }[] = [];
  private clock = 0;

  constructor() {
    this.reset();
  }
  private now() {
    this.clock++;
    return `2026-11-25T10:${String(Math.floor(this.clock / 60)).padStart(2, "0")}:${String(this.clock % 60).padStart(2, "0")}`;
  }
  reset() {
    const doc = (x: { key: string; json: unknown }) => ({ key: x.key, json: JSON.stringify(x.json), updatedAt: "2026-11-01T00:00:00" });
    this.docs = { forms: SEED.forms.map(doc), rules: SEED.rules.map(doc), certs: SEED.certs.map(doc), ovrs: SEED.ovrs.map(doc), imgs: SEED.imgs.map(doc) };
    this.issued = SEED.issued.map((x: Iss & { snap: unknown }) => {
      const cert = JSON.parse(this.docs.certs.find((c) => c.key === x.certId)!.json);
      return { ...x, mtcNo: cert.head.mtc, reason: null, snap: JSON.stringify(x.snap), verifyCode: null, docHash: null };
    });
    this.hist = SEED.hist.map((h: object) => ({ reason: null, by: "system", ...h }));
    this.old.clear();
  }
  private log(docNo: string | null, act: string, msg: string | null, reason: string | null = null) {
    this.hist.unshift({ at: this.now(), docNo, act, msg, reason, by: "tester" });
  }
  private sign(i: Iss, snap: string) {
    if (i.verifyCode) this.old.set(i.verifyCode, i.certId);
    i.snap = snap;
    i.docHash = sha(snap);
    i.verifyCode = code(i.docHash, i.issueNo + i.reissueCnt);
  }

  api(): MtcApi {
    const self = this;
    const rec = (action: string, params: unknown) => self.calls.push({ action, params });
    return {
      async search() {
        rec("search", {});
        return toData({
          ...self.docs,
          issued: [...self.issued].sort((a, b) => b.issueNo - a.issueNo),
          hist: self.hist.slice(0, 200),
        });
      },
      async save(p: SaveParams) {
        rec("save", p);
        const list = self.docs[KINDS[p.kind]];
        const i = list.findIndex((d) => d.key === p.key);
        if (p.json == null) {
          if (i >= 0) list.splice(i, 1);
        } else {
          const d = { key: p.key, json: JSON.stringify(p.json), updatedAt: self.now() };
          if (i >= 0) list[i] = d;
          else list.push(d);
        }
        self.log(p.key, p.act, p.msg, p.reason || null);
        return { key: p.key };
      },
      async reg(src: string) {
        rec("reg", { src });
        const cert = JSON.parse(self.docs.certs.find((c) => c.key === src)!.json);
        const n = self.docs.certs.filter((c) => c.key.startsWith("N")).length + 1;
        const certId = "N" + String(n).padStart(3, "0");
        cert.head = { ...cert.head, mtc: `UC1-${cert.kind}-261125-${String(n).padStart(3, "0")}` };
        self.docs.certs.push({ key: certId, json: JSON.stringify(cert), updatedAt: self.now() });
        self.log(cert.head.mtc, "RECEIVE", "신규 수신");
        return { certId, cert };
      },
      async issue(certId: string, snap: Snap, msg: string) {
        rec("issue", { certId, msg });
        if (self.issued.some((x) => x.certId === certId)) throw new Error("이미 발행된 증명서입니다. 재발행을 쓰세요.");
        const cert = JSON.parse(self.docs.certs.find((c) => c.key === certId)!.json);
        const i: Iss = { certId, mtcNo: cert.head.mtc, issueNo: Math.max(...self.issued.map((x) => x.issueNo)) + 1, issuedAt: self.now(), reissueCnt: 0, reason: null, snap: "", verifyCode: null, docHash: null };
        self.sign(i, JSON.stringify(snap));
        self.issued.push(i);
        self.log(i.mtcNo, "ISSUE", msg);
        return { certId, issueNo: i.issueNo, issuedAt: i.issuedAt, verifyCode: i.verifyCode!, docHash: i.docHash! };
      },
      async reissue(certId: string, snap: Snap, reason: string, msg: string) {
        rec("reissue", { certId, reason, msg });
        if (self.docs.ovrs.some((o) => o.key === certId) && !reason.trim()) throw new Error("단건 수정이 있는 증명서는 수정 사유를 넣어야 재발행할 수 있습니다.");
        const i = self.issued.find((x) => x.certId === certId)!;
        i.reissueCnt++;
        i.issuedAt = self.now();
        i.reason = reason || null;
        self.sign(i, JSON.stringify(snap));
        self.log(i.mtcNo, "REISSUE", msg, reason || null);
        return { certId, reissueCnt: i.reissueCnt, issuedAt: i.issuedAt, verifyCode: i.verifyCode!, docHash: i.docHash! };
      },
      async reset() {
        rec("reset", {});
        self.reset();
      },
      async confirm(verifyCode: string, snap?: Snap) {
        rec("confirm", { verifyCode, snap: !!snap });
        const i = self.issued.find((x) => x.verifyCode === verifyCode);
        if (!i) return { status: self.old.has(verifyCode) ? "SUPERSEDED" : "NOT_FOUND" };
        const status = snap && sha(JSON.stringify(snap)) !== i.docHash ? "TAMPERED" : "GENUINE";
        return { status, mtcNo: i.mtcNo, issueNo: i.issueNo, issuedAt: i.issuedAt, reissueCnt: i.reissueCnt, docHash: i.docHash };
      },
    };
  }
}
