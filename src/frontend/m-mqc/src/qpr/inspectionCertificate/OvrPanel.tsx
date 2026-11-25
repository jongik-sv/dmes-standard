"use client";

/**
 * 3 단건 수정 — 발행된 증명서 한 건만 양식·머리 항목·제목·REMARK·표 데이터(코일번호·치수·중량 등)를 고친다. 시험값은 고칠 수 없다.
 * 수정 사유는 필수이고(없으면 재발행 안 됨), 고친 뒤 [이 건 재발행] 해야 증명서에 반영된다(재발행은 현재 규칙 기준).
 */
import { useState } from "react";

import { Badge, Button, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { CardFrame, MutedText } from "@dk-oasis/shared/card";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";

import { COIL_EDIT, FORM_KEYS, FORMNAME, HEADF, custName } from "./engine/constants";
import { snapDiff } from "./engine/diff";
import { baseRemark } from "./engine/resolve";
import type { MtcStore } from "./store";
import { DetailTable, Field, Grow, Lead, Row, Stack } from "./ui";

function Clear({ show, onClick }: { show: boolean; onClick: () => void }) {
  return show ? (
    <Button size="sm" title="원래 값으로 되돌리기" onClick={onClick}>
      ↺
    </Button>
  ) : null;
}

export function OvrPanel({ store }: { store: MtcStore; version: number }) {
  const { showMessage } = useMessage();
  const [busy, setBusy] = useState(false);
  const d = store.data!;
  const id = store.ui.ovrSel;
  const cert = d.certs[id];
  const I = store.issuedOf(id);
  if (!cert || !I) return <Lead>발행된 증명서가 없습니다.</Lead>;
  const o = d.ovrs[id] || {};
  const oh = o.head || {};
  const st = store.st();
  const auto = store.resolve(id, "applied", { ...st, ovr: {} });
  const base = o.form ? store.resolve(id, "applied", { ...st, ovr: { [id]: { form: o.form, head: {} } } }) : auto;
  const fk = base.fk;
  const now = store.resolve(id);
  const n = now.nOvr;
  const ci = Math.min(store.ui.ovrCoil, cert.coils.length - 1);
  const cl = cert.coils[ci];
  const oc = o.coil || {};
  const nC = Object.keys(oc).length;

  const reissue = async () => {
    if (n && !store.ovrReason(id)) {
      showMessage({ message: "수정 사유를 입력하세요. 단건 수정이 있는 건은 사유가 있어야 재발행할 수 있습니다.", alertType: "warning" });
      return;
    }
    const rows = snapDiff(I.snap, now);
    showMessage({
      title: "확인",
      message: `${cert.head.mtc} 을(를) 현재 규칙과 단건 수정으로 재발행하시겠습니까?${rows.length ? ` 발행본과 ${rows.length}곳이 달라집니다(${rows.slice(0, 3).map((r) => r[0]).join(", ")}${rows.length > 3 ? " 등" : ""}).` : " 발행본과 내용이 같습니다."}`,
      alertType: "confirm",
      onConfirm: () => {
        setBusy(true);
        void store
          .reissue(id)
          .then(() => showMessage({ message: "단건 수정을 반영해 재발행했습니다.", alertType: "success", toast: true }))
          .catch((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }))
          .finally(() => setBusy(false));
      },
    });
  };

  return (
    <Stack>
      <DetailTable>
        <Field label="고칠 증명서">
          <Select
            aria-label="고칠 증명서"
            value={id}
            options={store.issuedIds().map((k) => ({ value: k, label: `${d.certs[k]?.head.mtc ?? k} · ${custName(d.certs[k]?.cust ?? "")}` }))}
            onChange={(v) => store.setUi({ ovrSel: v, ovrCoil: 0 })}
          />
        </Field>
        <Field label="발행본 양식">
          {I.snap.fname} v{I.snap.fver}
        </Field>
        <Field label="이 건만 바꿈">{n ? <Badge tone="warning" label={`${n}개 항목`} /> : <MutedText>없음</MutedText>}</Field>
        <Field label="수정 사유 *" hint="재발행할 때 발행 기록에 같이 남습니다.">
          <Textarea
            rows={2}
            value={o.reason ?? ""}
            placeholder="예: 고객 요청 — 중량 표기 정정 (요청자 · 요청일)"
            error={n && !o.reason ? "단건 수정이 있으면 사유를 입력해야 재발행할 수 있습니다." : undefined}
            onChange={(v) => store.setOvr("reason", v)}
            aria-label="수정 사유"
          />
        </Field>
      </DetailTable>
      <Lead>칸을 비우면 원래 값(회색 글씨 — MES·규칙에서 온 현재 값)을 씁니다. 고친 뒤 [이 건 재발행] 해야 증명서에 반영됩니다.</Lead>

      <CardFrame title="양식 · 머리 항목 · 문구">
        <DetailTable>
          <Field label="양식" hint="예: 스페인어로 나간 건을 고객 요청으로 이번만 영문 양식으로. 양식이 바뀌면 머리 항목 이름도 그 양식 기준으로 바뀝니다.">
            <Select
              aria-label="이 건 양식"
              value={o.form ?? ""}
              options={[{ value: "", label: `자동 — ${auto.fname} (언어·규칙 기준)` }, ...FORM_KEYS.map((k) => ({ value: k, label: `${FORMNAME[k]} 양식으로 바꾸기` }))]}
              onChange={(v) => store.setOvr("form", v)}
            />
          </Field>
          {HEADF[fk].map(([k, lab]) => (
            <Field key={k} label={lab}>
              <Row>
                <Grow>
                  <Input value={oh[k] ?? ""} placeholder={base.T["h." + k] || "(비어 있음)"} onChange={(v) => store.setOvrHead(k, v)} aria-label={lab} />
                </Grow>
                <Clear show={!!oh[k]} onClick={() => store.clearOvr("head." + k)} />
              </Row>
            </Field>
          ))}
          <Field label="제목">
            <Row>
              <Grow>
                <Input value={o.title ?? ""} placeholder={base.T["f.title"].replace(/\n/g, " ")} onChange={(v) => store.setOvr("title", v)} aria-label="제목" />
              </Grow>
              <Clear show={!!o.title} onClick={() => store.clearOvr("title")} />
            </Row>
          </Field>
          <Field
            label={o.remark !== undefined ? <>REMARK <Badge tone="warning" label="이 건만 고침" /></> : "REMARK"}
            hint="규칙에서 온 줄(예: BIS 인증 안내)도 이 건만 고치거나 지울 수 있고 줄을 더 넣어도 됩니다. 고치면 나중에 규칙이 바뀌어도 이 건은 따라가지 않습니다."
          >
            <Textarea rows={4} value={o.remark !== undefined ? o.remark : baseRemark(st, id)} placeholder="(비어 있음)" onChange={(v) => store.setOvrRemark(v)} aria-label="REMARK" />
            {o.remark !== undefined ? (
              <Button size="sm" onClick={() => store.clearOvr("remark")}>
                ↺ 규칙대로 되돌리기
              </Button>
            ) : null}
          </Field>
        </DetailTable>
      </CardFrame>

      <CardFrame title="표 데이터 (코일번호·치수·중량 등)" right={nC ? <Badge tone="warning" label={`${nC}칸 고침`} /> : undefined}>
        <DetailTable>
          <Field label="코일" hint="화학성분·기계시험·도장시험 같은 시험값은 고칠 수 없습니다(MES 원본 그대로). 원래 값과 같게 쓰거나 ↺ 를 누르면 되돌아갑니다. 합계(TOTAL)는 고친 값으로 다시 계산됩니다.">
            <Select
              aria-label="코일"
              value={String(ci)}
              options={cert.coils.map((x, i) => ({ value: String(i), label: `${x._id || "코일 " + (i + 1)}${Object.keys(oc).some((k) => k.startsWith(i + ".")) ? " · 고침" : ""}` }))}
              onChange={(v) => store.setUi({ ovrCoil: Number(v) })}
            />
          </Field>
          {base.cols
            .filter((c) => c.k in cl && COIL_EDIT.includes(c.k))
            .map((c) => {
              const k = ci + "." + c.k;
              const v = oc[k];
              const org = String(cl[c.k] ?? "");
              const label = c.l.replace(/\n/g, " ");
              return (
                <Field key={k} label={label}>
                  <Row>
                    <Grow>
                      <Textarea rows={Math.max(1, org.split("\n").length)} value={v ?? ""} placeholder={org || "(비어 있음)"} onChange={(x) => store.setOvrCell(k, x)} aria-label={label} />
                    </Grow>
                    <Clear show={v !== undefined} onClick={() => store.clearOvr("coil." + k)} />
                  </Row>
                </Field>
              );
            })}
        </DetailTable>
      </CardFrame>

      <Row>
        <Button variant="primary" disabled={busy} onClick={() => void reissue()}>
          이 건 재발행
        </Button>
        <Button
          variant="danger"
          disabled={busy || !n}
          onClick={() =>
            showMessage({ title: "확인", message: "이 건의 단건 수정을 모두 지우시겠습니까?", alertType: "confirm", onConfirm: () => store.clearOvrAll() })
          }
        >
          단건 수정 모두 지우기
        </Button>
        <Button onClick={() => store.setUi({ tab: "issue", sel: id })}>발행 목록 보기</Button>
      </Row>
    </Stack>
  );
}
