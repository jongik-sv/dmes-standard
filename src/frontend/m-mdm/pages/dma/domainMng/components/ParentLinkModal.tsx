"use client";

/**
 * 부모 연결·교체·제거 대화상자(D-132, 기능설계서 B-007·B-008). 저장된 행 그대로에 부모만 바꿔 `validate` 로 검사 목록·
 * 영향도(참조 컬럼·하위 도메인)·diff 를 먼저 보이고, 오류가 없을 때 실행 단추로 `save` 한다. 경고(W04 영향, W05 구체화)는
 * 막지 않고 보여 준다 — 실행 단추가 확인이다. 편집 폼의 검증 상태와는 따로 둔다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { useMessage } from "@dk-oasis/shared/message-provider";
import { Modal } from "@dk-oasis/shared/modal";
import { saveDomain, searchDomains, validateDomain } from "../api";
import { linkCandidates, parentLinkLabels, relinkDraft, type ParentLinkMode } from "../parent-link";
import type { DomainDetail, DomainRow, ValidateResult } from "../types";
import { DomainCheckList } from "./DomainCheckList";
import { DomainImpactPanel } from "./DomainImpactPanel";
import { ParentDomainSelect } from "./ParentDomainSelect";

export interface ParentLinkModalProps {
  open: boolean;
  mode: ParentLinkMode;
  /** 저장된 행(view 응답). */
  domain: DomainDetail;
  /** 편집 폼에 저장하지 않은 변경이 있으면 버려진다고 알린다. */
  dirty: boolean;
  onClose: () => void;
  /** 저장에 성공하면 부모가 다시 조회하고 도메인을 다시 연다. */
  onChanged: (domainId: number) => void;
}

function nameOf(rows: DomainRow[], id: number | null): string {
  if (id === null) return "(없음 — 최상위)";
  const r = rows.find((x) => x.DOMAIN_ID === id);
  return r ? `${r.DOMAIN_NAME} (${r.STD_NAME})` : String(id);
}

export function ParentLinkModal({ open, mode, domain, dirty, onClose, onChanged }: ParentLinkModalProps) {
  const { showMessage } = useMessage();
  const [rows, setRows] = useState<DomainRow[]>([]);
  const [parentId, setParentId] = useState<number | null>(null);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const hasParent = domain.PARENT_DOMAIN_ID !== null && domain.PARENT_DOMAIN_ID !== undefined;
  const labels = parentLinkLabels(mode, hasParent);

  const fail = (e: unknown) =>
    showMessage({ title: "오류", message: e instanceof Error ? e.message : String(e), alertType: "error" });

  const check = async (target: number | null) => {
    const my = ++seq.current;
    setValidation(null);
    if (mode === "link" && target === null) return;
    setBusy(true);
    try {
      const f = relinkDraft(domain, target);
      const out = await validateDomain(f.draft, f.cases, f.examples);
      if (my === seq.current) setValidation(out);
    } catch (e) {
      if (my === seq.current) fail(e);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  // 열 때마다 초기화한다. 후보는 검색 조건과 무관하게 전체 목록에서 고른다(화면 목록은 걸러져 있을 수 있다).
  useEffect(() => {
    if (!open) return;
    setParentId(null);
    setValidation(null);
    searchDomains({ keyword: "", domainKind: "" })
      .then((out) => setRows(out.domains ?? []))
      .catch(fail);
    if (mode === "unlink") void check(null);
    // 열 때 한 번만 — domain·mode 는 열린 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const candidates = useMemo(
    () => linkCandidates(rows, domain.DOMAIN_ID, domain.PARENT_DOMAIN_ID ?? null),
    [rows, domain.DOMAIN_ID, domain.PARENT_DOMAIN_ID],
  );

  const choose = (id: number | null) => {
    setParentId(id);
    void check(id);
  };

  const submit = async () => {
    const target = mode === "unlink" ? null : parentId;
    setBusy(true);
    try {
      const f = relinkDraft(domain, target);
      const out = await saveDomain(f.draft, f.cases, f.examples);
      showMessage({ message: "저장되었습니다.", alertType: "success", toast: true });
      onClose();
      onChanged(out.domainId ?? domain.DOMAIN_ID);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const ready = !!validation?.ok && !busy && (mode === "unlink" || parentId !== null);
  const results = validation?.testResults ?? [];

  return (
    <Modal
      open={open}
      title={labels.title}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!ready}>
            {labels.action}
          </Button>
        </>
      }
    >
      <div className="domain-mng__parent-link" data-testid="domain-parent-link-modal">
        <table style={DETAIL_TABLE_STYLE}>
          <tbody>
            <tr>
              <th style={DETAIL_LABEL_CELL}>도메인</th>
              <td style={DETAIL_VALUE_CELL}>{`${domain.DOMAIN_NAME} (${domain.STD_NAME})`}</td>
            </tr>
            <tr>
              <th style={DETAIL_LABEL_CELL}>지금 부모</th>
              <td style={DETAIL_VALUE_CELL}>{nameOf(rows, domain.PARENT_DOMAIN_ID ?? null)}</td>
            </tr>
            {mode === "link" && (
              <tr>
                <th style={DETAIL_LABEL_CELL}>새 부모 도메인 *</th>
                <td style={DETAIL_VALUE_CELL}>
                  <ParentDomainSelect value={parentId} options={candidates} placeholder="선택" disabled={busy}
                    onChange={choose} />
                </td>
              </tr>
            )}
            <tr>
              <th style={DETAIL_LABEL_CELL}>안내</th>
              <td style={DETAIL_VALUE_CELL}>
                {mode === "unlink"
                  ? "상속받던 값(단위·길이·소수·코드 참조·검증식)을 이 도메인에 복사해 같은 정의를 유지합니다."
                  : "종류·타입·단위가 새 부모와 같아야 하고, 새 부모의 검증식이 더해집니다."}
                {dirty && " 편집 중인 변경은 저장되지 않고 버려집니다."}
              </td>
            </tr>
          </tbody>
        </table>
        <DomainCheckList validated={validation !== null} ok={validation?.ok} issues={validation?.issues ?? []}
          descendantResults={results.filter((r) => !r.OWN)}
          pendingHint={busy ? "검사 중입니다" : "새 부모를 고르면 검사 목록과 영향도가 보입니다"} />
        <DomainImpactPanel impact={validation?.impact} classification={validation?.classification}
          diff={validation?.diff ?? []} />
      </div>
    </Modal>
  );
}
