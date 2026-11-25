"use client";

/**
 * 1 발행 — 발행된 증명서 목록, 선택한 건 정보·재발행, 신규 수신(시연), 진위 확인, 처리 이력.
 * 목록에는 발행된 건만 나온다(인터페이스 데이터가 들어오면 그 시점 규칙으로 바로 발행된다는 To-Be 흐름).
 */
import { useState } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Badge, Button, Input, Select } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { Modal } from "@dk-oasis/shared/modal";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";

import type { VerifyResult, VerifyStatus } from "./api";
import { FORMNAME, KIND, custName } from "./engine/constants";
import { snapDiff, type DiffRow } from "./engine/diff";
import { autoFormKey, autoWhy, certDate, fmtD } from "./engine/resolve";
import { clone } from "./engine/text";
import type { Snap } from "./engine/types";
import { fmtAt, type MtcStore } from "./store";
import { cellBadge, DetailTable, Field, Lead, Row, Stack } from "@/common/ui";

const ISSUED_COLUMNS: GridColumn[] = [
  { key: "mtcNo", header: "증명서번호", width: 140, align: "left" },
  { key: "cust", header: "고객 · 양식", width: 200, minWidth: 160, align: "left" },
  { key: "at", header: "발행", width: 92, align: "center" },
  { key: "reissueCnt", header: "재발행", width: 64, align: "center", render: (v) => (Number(v) ? cellBadge(`${String(v)}회`, "success") : "—") },
];

const HIST_COLUMNS: GridColumn[] = [
  { key: "at", header: "시각", width: 96, align: "center" },
  { key: "docNo", header: "문서", width: 130, align: "left" },
  { key: "text", header: "내용", width: 260, minWidth: 180, align: "left" },
  { key: "by", header: "처리자", width: 70, align: "center" },
];

const DIFF_COLUMNS: GridColumn[] = [
  { key: "name", header: "항목", width: 160, align: "left" },
  { key: "before", header: "지금 발행본", width: 220, minWidth: 160, align: "left", cellClass: "cell-light-pink" },
  { key: "after", header: "재발행 후", width: 220, minWidth: 160, align: "left", cellClass: "cell-emphasis" },
];

const VERIFY_TEXT: Record<VerifyStatus, { tone: "success" | "danger" | "warning" | "neutral"; label: string; text: string }> = {
  GENUINE: { tone: "success", label: "정상", text: "지금 유효한 발행본과 같습니다." },
  TAMPERED: { tone: "danger", label: "위변조 의심", text: "번호는 맞지만 내용이 발행본과 다릅니다. 문서 해시가 일치하지 않습니다." },
  SUPERSEDED: { tone: "warning", label: "대체됨", text: "재발행으로 바뀐 이전 번호입니다. 최신 증명서를 확인하세요." },
  NOT_FOUND: { tone: "neutral", label: "없는 번호", text: "발행 기록에 없는 진위 확인 번호입니다." },
};

/** 위조 흉내 — 발행본의 값 하나(첫 코일 순중량, 없으면 P/O 번호)를 바꾼다. */
export function forge(snap: Snap): { snap: Snap; what: string } {
  const s = clone(snap);
  const c = s.coils[0];
  const k = c && ("net" in c ? "net" : "wl" in c ? "wl" : "");
  if (c && k) {
    c[k] = c[k].replace(/\d/, (d) => String((+d + 1) % 10));
    return { snap: s, what: `코일 ${c._id ?? 1} 중량 ${snap.coils[0][k].split("\n")[0]} → ${c[k].split("\n")[0]}` };
  }
  s.T["h.po"] = (s.T["h.po"] ?? "") + "-X";
  return { snap: s, what: "P/O 번호 끝에 -X" };
}

export function IssuePanel({ store }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<{ id: string; rows: DiffRow[]; reason: string } | null>(null);
  const [code, setCode] = useState("");
  const [verify, setVerify] = useState<(VerifyResult & { code: string; forged?: string }) | null>(null);
  const d = store.data!;
  const ui = store.ui;
  const fail = (e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" });

  const rows = store.issuedIds().map((id) => {
    const I = store.issuedOf(id)!;
    const c = d.certs[id];
    return {
      certId: id,
      mtcNo: c?.head.mtc ?? I.mtcNo,
      cust: `${custName(c?.cust ?? "")} · ${KIND[c?.kind ?? 1]} · ${I.snap.fname} v${I.snap.fver}`,
      at: fmtAt(I.issuedAt).slice(5),
      reissueCnt: I.reissueCnt,
    };
  });
  const I = store.issuedOf(ui.sel);
  const c = I ? d.certs[I.certId] : undefined;
  const R = I?.snap;
  const now = I ? store.resolve(I.certId) : null;
  const nDiff = R && now ? snapDiff(R, now).length : 0;
  const hist = d.hist
    .filter((h) => !/_DRAFT$/.test(h.act))
    .slice(0, 30)
    .map((h, i) => ({ k: i, at: fmtAt(h.at).slice(5), docNo: h.docNo ?? "", text: (h.msg ?? h.act) + (h.reason ? ` · 사유: ${h.reason}` : ""), by: h.by ?? "" }));

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      showMessage({ message: done, alertType: "success", toast: true });
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openReissue = () => {
    if (!I || !now) return;
    if (now.nOvr && !store.ovrReason(I.certId)) {
      store.setUi({ tab: "ovr", ovrSel: I.certId });
      showMessage({ message: "단건 수정이 있는 건은 수정 사유를 입력해야 재발행할 수 있습니다.", alertType: "warning" });
      return;
    }
    setDiff({ id: I.certId, rows: snapDiff(I.snap, now), reason: now.nOvr ? store.ovrReason(I.certId) : "" });
  };

  const doConfirm = async (forged?: boolean) => {
    const v = (forged ? I?.verifyCode : code.trim()) ?? "";
    if (!v) {
      showMessage({ message: "진위 확인 번호를 입력하세요.", alertType: "warning" });
      return;
    }
    try {
      if (forged && R) {
        const f = forge(R);
        setVerify({ ...(await store.confirm(v, f.snap)), code: v, forged: f.what });
      } else setVerify({ ...(await store.confirm(v)), code: v });
    } catch (e) {
      fail(e);
    }
  };

  const srcOptions = Object.keys(d.certs)
    .filter((k) => k.startsWith("C") && k !== "C5")
    .map((k) => ({ value: k, label: `${custName(d.certs[k].cust)} · ${FORMNAME[autoFormKey(d.certs[k])]}` }));
  const vr = verify ? VERIFY_TEXT[verify.status] ?? VERIFY_TEXT.NOT_FOUND : null;

  return (
    <Stack>
      <AgDataGrid
        gridId="issued"
        title="발행된 증명서"
        count={rows.length}
        rowKey="certId"
        columns={ISSUED_COLUMNS}
        data={rows}
        columnSizing="fit"
        height="auto"
        highlightedRowKey={ui.sel}
        onRowClick={(r) => {
          store.setUi({ sel: String(r.certId) });
          setVerify(null);
        }}
      />

      <CardFrame title="선택한 증명서" testId="mtc-selected">
        {I && R && c ? (
          <>
            <DetailTable>
              <Field label="발행">
                {fmtAt(I.issuedAt)}
                {I.reissueCnt ? ` · 재발행 ${I.reissueCnt}회` : ""}
              </Field>
              <Field label="양식">
                {R.src.form === "ovr" ? <Badge tone="warning" label="단건 수정으로 지정" /> : autoWhy(c)} → <b>{R.fname}</b> v{R.fver}
                {R.nOvr ? (
                  <>
                    {" "}
                    <Badge tone="warning" label={`단건 수정 ${R.nOvr}개`} />
                  </>
                ) : null}
              </Field>
              {I.reason ? <Field label="수정 사유">{I.reason}</Field> : null}
              <Field label="예외 규칙">
                {R.rules.length ? (
                  <Row>
                    {R.rules.map((r) => (
                      <Badge key={r} tone="primary" label={r} />
                    ))}
                  </Row>
                ) : (
                  <MutedText>없음</MutedText>
                )}
              </Field>
              <Field label="서명 · 도장">
                {R.signImg || <MutedText>서명 없음</MutedText>} · {R.stampImg} <MutedText>(증명서 날짜 {fmtD(certDate(c))})</MutedText>
              </Field>
              <Field label="진위 확인">
                {I.verifyCode ? (
                  <>
                    <b>{I.verifyCode}</b> <MutedText>· 해시 {(I.docHash ?? "").slice(0, 16)}</MutedText>
                  </>
                ) : (
                  <MutedText>번호 없음 (시드 발행본 — 재발행하면 부여)</MutedText>
                )}
              </Field>
              <Field label="현재 규칙과">
                {nDiff ? (
                  <>
                    <Badge tone="danger" label={`${nDiff}곳 다름`} /> <MutedText>재발행하면 반영</MutedText>
                  </>
                ) : (
                  <MutedText>같음</MutedText>
                )}
              </Field>
            </DetailTable>
            <Lead>오른쪽은 발행된 증명서입니다. 규칙·양식을 바꿔도 재발행 전까지는 그대로입니다.</Lead>
            <Row>
              <Button variant="primary" disabled={busy} onClick={openReissue}>
                재발행 (현재 규칙)
              </Button>
              <Button disabled={busy} onClick={() => store.setUi({ tab: "ovr", ovrSel: I.certId, ovrCoil: 0 })}>
                이 건만 고쳐서 재발행
              </Button>
            </Row>
          </>
        ) : (
          <MutedText>발행된 증명서를 고르세요.</MutedText>
        )}
      </CardFrame>

      <CardFrame title="신규 수신 (시연)">
        <Lead>실제로는 MES 인터페이스 → 프로시저 → QULT300/310 적재 후 그 시점 규칙으로 바로 발행됩니다. 여기서는 예시 데이터를 오늘 날짜 새 번호로 받아 흉내 냅니다.</Lead>
        <Row>
          <Select aria-label="받을 데이터" value={ui.arrSrc} options={srcOptions} onChange={(v) => store.setUi({ arrSrc: v })} />
          <Button
            variant="primary"
            disabled={busy || !ui.arrSrc}
            onClick={() => {
              setBusy(true);
              void store
                .arrive(ui.arrSrc)
                .then((mtc) => showMessage({ message: `${mtc} 데이터가 들어와 현재 규칙으로 바로 발행했습니다.`, alertType: "success", toast: true }))
                .catch(fail)
                .finally(() => setBusy(false));
            }}
          >
            데이터 수신 → 자동 발행
          </Button>
        </Row>
      </CardFrame>

      <CardFrame title="진위 확인" testId="mtc-verify">
        <Lead>고객이 받은 증명서 하단(또는 QR)의 진위 확인 번호를 넣으면 발행 기록과 맞는지 봅니다. [위조 흉내] 는 선택한 발행본의 값 하나를 바꿔 해시가 달라지는 것을 보여 줍니다.</Lead>
        <Row>
          <Input aria-label="진위 확인 번호" placeholder="XXXX-XXXX-XXXX" value={code} onChange={setCode} />
          <Button variant="primary" onClick={() => void doConfirm()}>
            확인
          </Button>
          <Button disabled={!I?.verifyCode} onClick={() => setCode(I?.verifyCode ?? "")}>
            선택한 건 번호 넣기
          </Button>
          <Button disabled={!I?.verifyCode} onClick={() => void doConfirm(true)}>
            위조 흉내
          </Button>
        </Row>
        {verify && vr ? (
          <DetailTable>
            <Field label="결과">
              <Badge tone={vr.tone} label={vr.label} testId="mtc-verify-status" /> {vr.text}
            </Field>
            <Field label="확인 번호">{verify.code}</Field>
            {verify.forged ? <Field label="바꾼 값">{verify.forged}</Field> : null}
            {verify.mtcNo ? (
              <Field label="증명서">
                {verify.mtcNo} · 발행 {fmtAt(verify.issuedAt)}
                {verify.reissueCnt ? ` · 재발행 ${verify.reissueCnt}회` : ""}
              </Field>
            ) : null}
            {verify.docHash ? <Field label="저장된 해시">{verify.docHash.slice(0, 16)}…</Field> : null}
          </DetailTable>
        ) : null}
      </CardFrame>

      <AgDataGrid gridId="hist" title="처리 이력" count={hist.length} rowKey="k" columns={HIST_COLUMNS} data={hist} columnSizing="fit" height="auto" />

      {diff ? (
        <Modal
          open
          size="lg"
          title={diff.rows.length ? `재발행 — ${diff.rows.length}곳이 바뀝니다` : "재발행"}
          onClose={() => !busy && setDiff(null)}
          footer={
            <>
              <Button onClick={() => setDiff(null)} disabled={busy}>
                취소
              </Button>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => void run(() => store.reissue(diff.id), "현재 규칙으로 재발행했습니다.").then((ok) => ok && setDiff(null))}
              >
                재발행
              </Button>
            </>
          }
        >
          <Stack>
            <Lead>
              {d.certs[diff.id]?.head.mtc} 을(를) 현재 규칙으로 다시 만듭니다.{" "}
              {diff.rows.length ? "발행 뒤 바뀐 양식·규칙·단건 수정이 반영되고, 고객이 이미 받은 증명서와 아래 항목이 달라집니다." : "발행된 내용과 현재 규칙 결과가 같습니다. 같은 내용으로 재발행합니다."}
            </Lead>
            {diff.reason ? (
              <DetailTable>
                <Field label="수정 사유">{diff.reason}</Field>
              </DetailTable>
            ) : null}
            {diff.rows.length ? (
              <AgDataGrid
                gridId="reissue-diff"
                title="바뀌는 곳"
                rowKey="i"
                columns={DIFF_COLUMNS}
                data={diff.rows.map(([name, before, after], i) => ({ i, name, before, after }))}
                columnSizing="fit"
                height="auto"
              />
            ) : null}
          </Stack>
        </Modal>
      ) : null}
    </Stack>
  );
}
