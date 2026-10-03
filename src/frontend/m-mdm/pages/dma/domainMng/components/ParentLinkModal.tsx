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
import { DomainField, matchExactDomain } from "@/domain";
import { saveDomain, searchDomains, validateDomain } from "../api";
import { makeParentSearch } from "../parent-search";
import { linkCandidates, parentLinkLabels, relinkDraft, type ParentLinkMode } from "../parent-link";
import type { DomainDetail, DomainRow, ValidateResult } from "../types";
import { DomainCheckList } from "./DomainCheckList";
import { DomainImpactPanel } from "./DomainImpactPanel";

export interface ParentLinkModalProps {
  open: boolean;
  mode: ParentLinkMode;
  /** 화면이 이미 들고 있는 목록 — 「지금 부모」 이름을 보이는 데만 쓴다(전체 조회를 따로 하지 않는다). */
  rows: DomainRow[];
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

export function ParentLinkModal({ open, mode, rows, domain, dirty, onClose, onChanged }: ParentLinkModalProps) {
  const { showMessage } = useMessage();
  const [parentLabel, setParentLabel] = useState("");
  // 찾기 팝업이 위에 떠 있는 동안 Escape 는 그 팝업만 닫는다(Local-Rules §18).
  const [finding, setFinding] = useState(false);
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

  // 열 때마다 초기화한다. 후보는 칸에서 검색할 때만 서버에서 받는다(열 때 전체 조회 없음).
  useEffect(() => {
    if (!open) return;
    setParentId(null);
    setValidation(null);
    setParentLabel("");
    setFinding(false);
    if (mode === "unlink") void check(null);
    // 열 때 한 번만 — domain·mode 는 열린 동안 바뀌지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 후보 규칙(자기·자기 하위·지금 부모 제외)은 검색 결과 전체에 적용한다 — 하위가 검색어에 맞으면 서버가 조상 행을 함께 준다.
  const parentSearch = useMemo(
    () => makeParentSearch(
      (keyword) => searchDomains({ keyword, domainKind: "" }).then((out) => out.domains ?? []),
      (found) => linkCandidates(found, domain.DOMAIN_ID, domain.PARENT_DOMAIN_ID ?? null),
    ),
    [domain.DOMAIN_ID, domain.PARENT_DOMAIN_ID],
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
      onClose={() => {
        if (!finding) onClose();
      }}
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
                  <DomainField testId="domain-parent-link-field" ariaLabel="부모 도메인" autoPick={matchExactDomain}
                    onPopupChange={setFinding} domainId={parentId} label={parentLabel}
                    search={parentSearch} disabled={busy}
                    onChange={(r) => {
                      setParentLabel(r ? r.domainName || r.stdName : "");
                      choose(r ? r.domainId : null);
                    }} />
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
