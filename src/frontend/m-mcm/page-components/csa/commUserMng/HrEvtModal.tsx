"use client";

/**
 * commUserMng 「ERP 인사 연동」 팝업 — 받은 인사 정보(searchHrEvt)와 처리 상태를 보고,
 * 실패 건은 [다시 처리](retryHrEvt), 계정 생성 대기(HOLD) 입사 건은 [계정 만들기](regHrEvtUser, D12)를 한다.
 *
 * ERP 인사 인터페이스는 아직 없다(시안 D8 — 스펙 대기). 그래서 목록은 보통 비어 있다. 화면은 단순하게 둔다.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid, GridBadge, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, Input, Select } from "@dk-oasis/shared/form";

import { regHrEvtUser as apiRegHrEvtUser, retryHrEvt as apiRetryHrEvt, searchHrEvt as apiSearchHrEvt } from "./api";
import type { HrEvtRow } from "./types";
import {
  HR_EVT_TP_LABEL,
  HR_PROC_ST_LABEL,
  HR_PROC_ST_OPTIONS,
  bizErrorText,
  fmtDateTime,
  fmtYmd,
  hrProcTone,
  retrySummary,
  toneColors,
  type ResultNotice,
} from "./userState";

type HrGridRow = HrEvtRow & { __key: string };

const COLUMNS: GridColumn[] = [
  {
    key: "PROC_ST",
    header: "처리 상태",
    width: 110,
    align: "center",
    render: (v) => <GridBadge label={HR_PROC_ST_LABEL[String(v ?? "")] ?? String(v ?? "")} {...toneColors(hrProcTone(v))} />,
  },
  { key: "EVT_TP", header: "인사 정보", width: 100, align: "center", render: (v) => HR_EVT_TP_LABEL[String(v ?? "")] ?? String(v ?? "") },
  { key: "EVT_DT", header: "발령일", width: 96, align: "center", render: (v) => fmtYmd(v) },
  { key: "EMP_NO", header: "사번", width: 90, align: "left" },
  { key: "USER_NM", header: "이름", width: 90, align: "left" },
  { key: "DEPT_CD", header: "부서", width: 90, align: "left" },
  { key: "USER_ID", header: "사용자ID", width: 100, align: "left" },
  { key: "PROC_MSG", header: "처리 결과", width: 240, align: "left", tooltip: true },
  { key: "TRY_CNT", header: "시도", width: 56, align: "right" },
  { key: "PROC_AT", header: "처리 시각", width: 130, align: "center", render: (v) => fmtDateTime(v) },
];

const NOTE_STYLE = { margin: "0 0 var(--spacing-sm)", fontSize: 12, color: "var(--color-text-muted)" } as const;
const BAR_STYLE = { display: "flex", gap: 6, alignItems: "center", marginBottom: "var(--spacing-sm)", flexWrap: "wrap" } as const;

export interface HrEvtModalProps {
  /** 권한 — 다시 처리(retryHrEvt)·계정 만들기(regHrEvtUser). */
  canRetry: boolean;
  canReg: boolean;
  onClose: () => void;
  /** 결과 안내(토스트·알림 창은 화면이 띄운다). */
  onNotice: (n: ResultNotice) => void;
  onError: (message: string) => void;
  /** 계정을 만들었을 때 — 화면이 임시 비밀번호 안내를 띄우고 목록을 다시 조회한다. */
  onUserCreated: (userId: string, initPwd: string | undefined) => void;
}

export const HrEvtModal = memo(function HrEvtModal({ canRetry, canReg, onClose, onNotice, onError, onUserCreated }: HrEvtModalProps) {
  const [procSt, setProcSt] = useState("");
  const [rows, setRows] = useState<HrGridRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [newUserId, setNewUserId] = useState("");
  const seq = useRef(0);

  const load = useCallback(
    async (st: string) => {
      const my = ++seq.current;
      setLoading(true);
      try {
        const res = await apiSearchHrEvt(st);
        if (my !== seq.current) return;
        setRows((res.ds_hrEvt ?? []).map((r) => ({ ...r, __key: String(r.EVT_ID) })));
        setChecked([]);
        setFocusKey(null);
      } catch (e) {
        if (my === seq.current) onError(bizErrorText(e, "인사 정보를 읽지 못했습니다."));
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    [onError],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const focused = rows.find((r) => r.__key === focusKey) ?? null;
  const holdRow = focused && focused.PROC_ST === "HOLD" ? focused : null;

  const handleRetry = async () => {
    if (checked.length === 0) return;
    setBusy(true);
    try {
      const res = await apiRetryHrEvt(checked);
      onNotice(retrySummary(res.ds_hrResult ?? []));
      await load(procSt);
    } catch (e) {
      onError(bizErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleReg = async () => {
    if (!holdRow) return;
    const id = newUserId.trim();
    if (!id) {
      onError("만들 사용자 ID를 입력하세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRegHrEvtUser(holdRow.EVT_ID, id);
      setNewUserId("");
      onUserCreated(String(res.USER_ID ?? id), res.INIT_PWD);
      await load(procSt);
    } catch (e) {
      onError(bizErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="ERP 인사 연동"
      size="xl"
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <Button onClick={onClose} disabled={busy}>
          닫기
        </Button>
      }
    >
      <p style={NOTE_STYLE}>
        ERP 인사에서 받은 입사·휴직·복직·퇴직·부서 이동 정보입니다. ERP 인사 인터페이스는 아직 연결 전이라 보통 비어 있습니다.
        외부 직원(수동 관리)은 받지 않습니다.
      </p>
      <div style={BAR_STYLE}>
        <div style={{ width: 260 }}>
          <Select
            value={procSt}
            onChange={(v) => {
              setProcSt(v);
              void load(v);
            }}
            options={HR_PROC_ST_OPTIONS}
            aria-label="처리 상태"
          />
        </div>
        <Button onClick={() => void load(procSt)} disabled={loading || busy}>
          조회
        </Button>
        <Button
          onClick={() => void handleRetry()}
          disabled={!canRetry || busy || checked.length === 0}
          title={canRetry ? "체크한 실패 건을 다시 처리합니다" : "권한이 없습니다"}
        >
          다시 처리{checked.length > 0 ? ` (${checked.length})` : ""}
        </Button>
        <span style={{ flex: 1 }} />
        <div style={{ width: 160 }}>
          <Input
            type="text"
            value={newUserId}
            onChange={setNewUserId}
            maxLength={30}
            placeholder={holdRow ? "새 사용자 ID" : "계정 생성 대기 행을 고르세요"}
            disabled={!holdRow || !canReg || busy}
            aria-label="새 사용자 ID"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => void handleReg()}
          disabled={!holdRow || !canReg || busy}
          title={canReg ? "고른 입사 정보로 계정을 만듭니다. 역할그룹 없이, 임시 비밀번호로 만듭니다" : "권한이 없습니다"}
        >
          계정 만들기
        </Button>
      </div>
      <AgDataGrid
        gridId="modal-hrEvt"
        title="인사 정보"
        count={rows.length}
        columns={COLUMNS}
        data={rows}
        rowKey="__key"
        height={360}
        selectable
        multiSelect
        isRowSelectable={(r) => r.PROC_ST === "FAIL"}
        onRowSelect={(ids) => setChecked(ids.map(String))}
        highlightedRowKey={focusKey}
        onRowClick={(r) => setFocusKey(String((r as HrGridRow).__key))}
        loading={loading}
        loadingMessage="조회 중..."
        emptyMessage="받은 인사 정보가 없습니다."
      />
    </Modal>
  );
});
