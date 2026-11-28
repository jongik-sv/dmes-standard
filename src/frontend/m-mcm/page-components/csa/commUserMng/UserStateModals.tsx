"use client";

/**
 * commUserMng 계정 상태 팝업 — 퇴직 처리 · 비활성화 · 담당 데이터 인계 · 확인(잠금 해제·다시 사용·계정 재생성).
 * 시안 「사용자 비활성화·퇴직 처리」(2026-11-28)의 팝업 문구·동작을 따른다. 모양은 shared Modal·상세 표·Badge 를 쓴다.
 *
 * 팝업은 부모가 열 때마다 새로 만든다(조건부 마운트) — 사유·받을 사람 입력이 다음 사람에게 남지 않게 한다.
 * 처리 중(busy)에는 X·ESC·취소로 닫히지 않는다.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { DETAIL_TABLE_STYLE, DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { Modal } from "@dk-oasis/shared/modal";
import { Badge, Button, Checkbox, Input, Select, Textarea } from "@dk-oasis/shared/form";
import { LookupModal, type LookupFetchFn, type LookupRow } from "@dk-oasis/shared/lookup";
import { MdmFieldLabel } from "@dk-oasis/shared/mdm-meta";

import { searchCmUser as apiSearchCmUser, searchOwned as apiSearchOwned } from "./api";
import { todayYmd } from "./detailUtils";
import type { OwnedRow } from "./types";
import { RETIRE_REASONS, SUSPEND_REASONS, bizErrorText, fmtYmd, joinReason, ownedTotal } from "./userState";

/** 바뀌는 내용 한 줄 — do: 바뀜, ask: 확인할 것, keep: 그대로 둠. */
export interface ImpactLine {
  kind: "do" | "ask" | "keep";
  text: ReactNode;
  sub?: ReactNode;
}

const IMPACT_BADGE: Record<ImpactLine["kind"], { tone: "danger" | "warning" | "success"; label: string }> = {
  do: { tone: "danger", label: "바뀜" },
  ask: { tone: "warning", label: "확인" },
  keep: { tone: "success", label: "그대로" },
};

const LEAD_STYLE = { margin: "0 0 var(--spacing-sm)", fontSize: 12, color: "var(--color-text-muted)" } as const;
const SUB_STYLE = { display: "block", fontSize: 12, color: "var(--color-text-muted)" } as const;
const LIST_STYLE = { listStyle: "none", margin: "var(--spacing-sm) 0 0", padding: 0, display: "grid", gap: 6 } as const;
const ITEM_STYLE = { display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 } as const;
const FIELD_ROW_STYLE = { display: "flex", gap: 6, alignItems: "center" } as const;

/** 바뀌는 내용 목록 — 시안의 ✕ / ! / ✓ 줄을 Badge 로 보인다. */
function ImpactList({ lines }: { lines: ImpactLine[] }) {
  return (
    <ul style={LIST_STYLE}>
      {lines.map((l, i) => {
        const b = IMPACT_BADGE[l.kind];
        return (
          <li key={i} style={ITEM_STYLE}>
            <Badge tone={b.tone} label={b.label} />
            <span>
              {l.text}
              {l.sub ? <small style={SUB_STYLE}>{l.sub}</small> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 처리 중이면 닫기를 무시한다. */
function guardClose(busy: boolean, onClose: () => void) {
  return () => {
    if (!busy) onClose();
  };
}

// ────────────────────────────────────────────────────────────────
// 담당 데이터 조회 (searchOwned)
// ────────────────────────────────────────────────────────────────

interface OwnedState {
  loading: boolean;
  rows: OwnedRow[];
  error: string | null;
}

/** 팝업이 열릴 때 한 번 담당 데이터를 읽는다. 권한이 없으면 읽지 않고 안내만 둔다. */
function useOwned(userId: string, enabled: boolean): OwnedState {
  const [state, setState] = useState<OwnedState>(() =>
    enabled ? { loading: true, rows: [], error: null } : { loading: false, rows: [], error: "담당 데이터를 볼 권한이 없습니다" },
  );
  useEffect(() => {
    if (!enabled || !userId) return;
    let cancelled = false;
    apiSearchOwned(userId)
      .then((res) => {
        if (!cancelled) setState({ loading: false, rows: res.ds_owned ?? [], error: res.OWNED_ERROR ?? null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ loading: false, rows: [], error: bizErrorText(e, "담당 데이터를 읽지 못했습니다") });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, enabled]);
  return state;
}

/** 담당 데이터 줄 — 종류별 건수. */
function ownedLine(owned: OwnedState, verb: string): ImpactLine {
  if (owned.loading) return { kind: "ask", text: "담당 데이터를 확인하는 중입니다." };
  if (owned.error) {
    return { kind: "ask", text: `담당 데이터를 확인하지 못했습니다(${owned.error}).`, sub: "인계는 나중에 「담당 데이터 인계」로 합니다." };
  }
  const total = ownedTotal(owned.rows);
  if (total === 0) return { kind: "keep", text: "넘길 담당 데이터가 없습니다." };
  return {
    kind: "ask",
    text: (
      <>
        담당 데이터 <b>{total}건</b>을 {verb}.
      </>
    ),
    sub: owned.rows
      .filter((r) => (Number(r.CNT) || 0) > 0)
      .map((r) => `${r.KIND_NM || r.KIND} ${Number(r.CNT) || 0}${r.SKIPPED === "Y" ? "(넘기지 않음)" : ""}`)
      .join(" · "),
  };
}

// ────────────────────────────────────────────────────────────────
// 받을 사람 고르기 — 활성 사용자 중에서 (searchCmUser cboUSERST=ACTIVE)
// ────────────────────────────────────────────────────────────────

/**
 * 받을 사람 칸 — 읽기 전용 칸 + [찾기] → 사용자 검색 팝업(LookupModal).
 * 후보는 searchCmUser 를 상태=활성으로 불러 쓴다. 서버도 받을 사람이 활성(또는 잠금)인지 다시 검사한다.
 */
function ReceiverPicker({
  excludeUserId,
  value,
  onChange,
  disabled,
}: {
  excludeUserId: string;
  value: LookupRow | null;
  onChange: (row: LookupRow | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const fetchFn = useCallback<LookupFetchFn>(
    async ({ keyword, page, size }) => {
      const res = await apiSearchCmUser({ edt_USER_ID: keyword, cbo_USER_ST: "ACTIVE" });
      const all: LookupRow[] = (res.ds_main ?? [])
        .filter((r) => String(r.USER_ID ?? "").toLowerCase() !== excludeUserId.toLowerCase())
        .map((r) => ({
          code: String(r.USER_ID ?? ""),
          name: [r.USER_NM, r.DEPT_NM || r.DEPT_CD].filter(Boolean).join(" · "),
        }));
      return { rows: all.slice(page * size, page * size + size), totalElements: all.length };
    },
    [excludeUserId],
  );
  return (
    <>
      <div style={FIELD_ROW_STYLE}>
        <div style={{ flex: 1 }}>
          <Input
            type="text"
            readOnly
            value={value ? `${value.name} (${value.code})` : ""}
            placeholder="활성 사용자 중에서 고르세요"
            aria-label="받을 사람"
          />
        </div>
        <Button disabled={disabled} onClick={() => setOpen(true)}>
          찾기
        </Button>
      </div>
      <LookupModal
        gridId="modal-receiver"
        open={open}
        title="받을 사람 검색"
        placeholder="ID / 사번 / 이름"
        fetchFn={fetchFn}
        searchOnOpen
        onSelect={(row) => onChange(row)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// 퇴직 처리
// ────────────────────────────────────────────────────────────────

export interface RetireSubmit {
  reason: string;
  receiver: LookupRow | null;
  /** 팝업이 열릴 때 남은 담당 데이터가 있었는가(결과 안내용). */
  hadOwned: boolean;
}

export function RetireModal({
  userId,
  userNm,
  roleGroups,
  canSeeOwned,
  busy,
  onSubmit,
  onClose,
}: {
  userId: string;
  userNm: string;
  /** 지금 가진 역할그룹 이름(저장된 것) — 회수 대상. */
  roleGroups: string[];
  canSeeOwned: boolean;
  busy: boolean;
  onSubmit: (v: RetireSubmit) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [memo, setMemo] = useState("");
  const [receiver, setReceiver] = useState<LookupRow | null>(null);
  const [later, setLater] = useState(false);
  const owned = useOwned(userId, canSeeOwned);
  const total = ownedTotal(owned.rows);
  const needPick = !owned.loading && !owned.error && total > 0;
  const reasonOk = !!reason && (reason !== "기타" || memo.trim().length > 0);
  const canSave = reasonOk && !owned.loading && (!needPick || !!receiver || later) && !busy;

  const lines: ImpactLine[] = [
    { kind: "do", text: "로그인을 막고, 쓰던 세션을 바로 끊습니다.", sub: `유효기한일을 오늘(${fmtYmd(todayYmd())})로 바꿉니다.` },
  ];
  if (roleGroups.length > 0) {
    lines.push({
      kind: "do",
      text: (
        <>
          역할그룹 <b>{roleGroups.length}개</b>를 회수합니다.
        </>
      ),
      sub: `${roleGroups.join(", ")} · 역할 이력에 남습니다`,
    });
  }
  lines.push({ kind: "do", text: "ERD 편집 점유와 사용자 쿼리 배정을 풉니다." });
  lines.push(ownedLine(owned, "넘깁니다"));
  lines.push({ kind: "keep", text: "그대로 둡니다: 감사 기록, 처리 이력, 개인 설정. 계정 행은 지우지 않습니다." });

  return (
    <Modal
      open
      title={`퇴직 처리 · ${userNm || userId}`}
      size="md"
      onClose={guardClose(busy, onClose)}
      footer={
        <>
          <Button onClick={guardClose(busy, onClose)} disabled={busy}>
            취소
          </Button>
          <Button
            variant="danger"
            disabled={!canSave}
            onClick={() => onSubmit({ reason: joinReason(reason, memo), receiver: later ? null : receiver, hadOwned: total > 0 })}
            data-testid="retire-ok"
          >
            퇴직 처리
          </Button>
        </>
      }
    >
      <p style={LEAD_STYLE}>저장 전에 바뀌는 내용을 확인하세요.</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="retireReason" meta={false} label="사유" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                value={reason}
                onChange={setReason}
                placeholder="고르세요"
                options={RETIRE_REASONS.map((r) => ({ value: r, label: r === "기타" ? "기타(직접 입력)" : r }))}
                aria-label="퇴직 사유"
              />
            </td>
          </tr>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="retireMemo" meta={false} label={reason === "기타" ? "사유 입력" : "메모"} required={reason === "기타"} />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <Textarea
                value={memo}
                onChange={setMemo}
                rows={2}
                maxLength={100}
                placeholder="예: 인사팀 통보 2026-11-28 · 이력에 남습니다"
                aria-label="퇴직 메모"
              />
            </td>
          </tr>
          {needPick && (
            <tr>
              <th style={DETAIL_LABEL_CELL}>
                <MdmFieldLabel name="toUserId" meta={false} label="받을 사람" />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <ReceiverPicker excludeUserId={userId} value={receiver} onChange={setReceiver} disabled={later || busy} />
                <div style={{ marginTop: 6 }}>
                  <Checkbox
                    checked={later}
                    onChange={setLater}
                    label="나중에 인계 · 「퇴직자가 담당인 데이터」 목록에 남깁니다"
                  />
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ImpactList lines={lines} />
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────
// 비활성화
// ────────────────────────────────────────────────────────────────

export function SuspendModal({
  userId,
  userNm,
  roleGroupCnt,
  busy,
  onSubmit,
  onClose,
}: {
  userId: string;
  userNm: string;
  roleGroupCnt: number;
  busy: boolean;
  onSubmit: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [etc, setEtc] = useState("");
  const value = reason === "기타" ? etc.trim() : reason;
  const lines: ImpactLine[] = [
    { kind: "do", text: "로그인을 막고, 쓰던 세션을 바로 끊습니다." },
    { kind: "do", text: "ERD 편집 점유를 풉니다." },
    { kind: "keep", text: `역할그룹 ${roleGroupCnt}개와 담당 데이터를 그대로 둡니다.`, sub: "담당자 옆에 「비활성」이 보입니다." },
    { kind: "keep", text: "관리자가 「다시 사용」을 누를 때까지 막혀 있습니다. 날짜로 저절로 풀리지 않습니다." },
  ];
  return (
    <Modal
      open
      title={`비활성화 · ${userNm || userId}`}
      size="md"
      onClose={guardClose(busy, onClose)}
      footer={
        <>
          <Button onClick={guardClose(busy, onClose)} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" disabled={!value || busy} onClick={() => onSubmit(value)} data-testid="suspend-ok">
            비활성화
          </Button>
        </>
      }
    >
      <p style={LEAD_STYLE}>돌아올 사람에게 씁니다. 휴직은 ERP 인사에서 받으므로 여기서 고르지 않습니다.</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="suspendReason" meta={false} label="사유" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <Select
                value={reason}
                onChange={setReason}
                placeholder="고르세요"
                options={SUSPEND_REASONS.map((r) => ({ value: r, label: r === "기타" ? "기타(직접 입력)" : r }))}
                aria-label="비활성 사유"
              />
            </td>
          </tr>
          {reason === "기타" && (
            <tr>
              <th style={DETAIL_LABEL_CELL}>
                <MdmFieldLabel name="suspendReasonEtc" meta={false} label="사유 입력" required />
              </th>
              <td style={DETAIL_VALUE_CELL}>
                <Input type="text" value={etc} onChange={setEtc} maxLength={100} aria-label="비활성 사유 입력" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ImpactList lines={lines} />
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────
// 담당 데이터 인계 (퇴직자)
// ────────────────────────────────────────────────────────────────

export function HandoverModal({
  userId,
  userNm,
  canSeeOwned,
  busy,
  onSubmit,
  onClose,
}: {
  userId: string;
  userNm: string;
  canSeeOwned: boolean;
  busy: boolean;
  onSubmit: (receiver: LookupRow) => void;
  onClose: () => void;
}) {
  const [receiver, setReceiver] = useState<LookupRow | null>(null);
  const owned = useOwned(userId, canSeeOwned);
  const lines = useMemo(() => [ownedLine(owned, "받을 사람에게 넘깁니다")], [owned]);
  return (
    <Modal
      open
      title={`담당 데이터 인계 · ${userNm || userId}`}
      size="md"
      onClose={guardClose(busy, onClose)}
      footer={
        <>
          <Button onClick={guardClose(busy, onClose)} disabled={busy}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!receiver || busy}
            onClick={() => receiver && onSubmit(receiver)}
            data-testid="handover-ok"
          >
            인계
          </Button>
        </>
      }
    >
      <p style={LEAD_STYLE}>MDM 코드·용어·룰·ERD 모델의 담당자를 받을 사람으로 바꿉니다.</p>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <tr>
            <th style={DETAIL_LABEL_CELL}>
              <MdmFieldLabel name="toUserId" meta={false} label="받을 사람" required />
            </th>
            <td style={DETAIL_VALUE_CELL}>
              <ReceiverPicker excludeUserId={userId} value={receiver} onChange={setReceiver} disabled={busy} />
            </td>
          </tr>
        </tbody>
      </table>
      <ImpactList lines={lines} />
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────────
// 확인 팝업 — 잠금 해제 · 다시 사용 · 계정 재생성
// ────────────────────────────────────────────────────────────────

export function ConfirmImpactModal({
  title,
  lead,
  lines,
  okLabel,
  busy,
  onConfirm,
  onClose,
  testId,
}: {
  title: string;
  lead: string;
  lines: ImpactLine[];
  okLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
  testId?: string;
}) {
  return (
    <Modal
      open
      title={title}
      size="md"
      onClose={guardClose(busy, onClose)}
      footer={
        <>
          <Button onClick={guardClose(busy, onClose)} disabled={busy}>
            취소
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm} data-testid={testId}>
            {okLabel}
          </Button>
        </>
      }
    >
      <p style={LEAD_STYLE}>{lead}</p>
      <ImpactList lines={lines} />
    </Modal>
  );
}

/** 잠금 해제 확인 문구(시안). */
export const UNLOCK_LINES: ImpactLine[] = [
  { kind: "keep", text: "실패 횟수를 0으로 돌리고 잠금을 풉니다." },
  { kind: "keep", text: "본인은 지금 비밀번호로 바로 로그인합니다." },
];

/** 다시 사용 확인 문구(시안). 인사 휴직이 함께 걸려 있으면 남는다고 알린다. */
export function resumeLines(roleGroupCnt: number, hrLeave: boolean): ImpactLine[] {
  const lines: ImpactLine[] = [
    { kind: "keep", text: `역할그룹 ${roleGroupCnt}개와 담당 데이터가 그대로 살아 있습니다.` },
    { kind: "keep", text: "비밀번호는 바꾸지 않습니다." },
  ];
  if (hrLeave) lines.push({ kind: "ask", text: "ERP 인사 휴직은 남습니다. 인사 복직 정보가 올 때까지 로그인할 수 없습니다." });
  return lines;
}

/** 계정 재생성 확인 문구(시안 D7). */
export const REREG_LINES: ImpactLine[] = [
  { kind: "do", text: "비밀번호를 임시 비밀번호로 바꿉니다. 첫 로그인 때 바꾸게 합니다.", sub: "임시 비밀번호는 7일 뒤 23:59까지 쓸 수 있습니다." },
  { kind: "ask", text: "역할그룹 없이 활성이 됩니다. 필요한 역할그룹을 다시 붙이세요." },
  { kind: "keep", text: "유효 기간을 오늘부터 다시 시작합니다." },
];
