"use client";

/**
 * 확정 대화상자(스펙 4.7, D19, S2-28). 열면 validate 로 확정 전 검사를 읽는다. 늦은 응답은 버린다(§37).
 * 오류가 있으면 막고, 오류·경고는 코드별로 묶어 수와 처음 50건만 보인다(첫 확정은 약 700건이다).
 * 경고가 있으면 [경고를 확인했습니다] 를 고른 뒤에만 확정한다(MDM014 를 미리 막는다). 남은 추정 관계 수를 함께 보인다.
 * 적용 시작 시각(applyFrom)은 연 때의 지금 시각이 기본이다(조정자 판정). 미래 시각이면 그때까지 새 버전(copy)이 MDM006 으로 막힌다.
 * shared Checkbox 는 data-testid 를 받지 않아 감싼 span 에 둔다(ruleConfirm 선례).
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { confirmVersion, validateConfirm } from "../api";
import type { ErdEditContext } from "../edit-context";
import type { ErdCheckIssue, ErdConfirmCheck } from "../types";

export const ISSUE_LIMIT = 50;

export interface IssueGroup { code: string; count: number; items: ErdCheckIssue[] }

/** 코드별 묶음 — 많은 것부터, 같으면 코드 순. 묶음마다 처음 limit 건만 싣는다. */
export function groupIssues(issues: readonly ErdCheckIssue[], limit = ISSUE_LIMIT): IssueGroup[] {
  const by = new Map<string, IssueGroup>();
  for (const i of issues) {
    const g = by.get(i.code) ?? { code: i.code, count: 0, items: [] };
    g.count += 1;
    if (g.items.length < limit) g.items.push(i);
    by.set(i.code, g);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** 로컬 시각 → `yyyy-MM-dd HH:mm:ss`(RuleConfirmService.parseApplyFrom 형식). */
export function applyFromText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 형식이 맞고 실제 있는 시각이어야 한다(`2026-13-45 99:99:99` 는 Date 가 넘겨 계산하므로 되돌려 써서 같은지 본다). */
export function isValidApplyFrom(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return applyFromText(new Date(y, mo - 1, d, h, mi, s)) === text;
}

function IssueList({ title, groups, testId }: { title: string; groups: IssueGroup[]; testId: string }) {
  return (
    <div data-testid={testId}>
      <div className="erd-confirm__summary">{title}</div>
      {groups.map((g) => (
        <div key={g.code} className="erd-confirm__group" data-testid={`${testId}-${g.code}`}>
          <div className="erd-confirm__code">{g.code} · {g.count}건</div>
          <ul className="erd-confirm__list">
            {g.items.map((i, n) => (
              <li key={`${i.itemKey ?? ""}:${n}`}>{i.itemKey ? `${i.itemKey} — ${i.message}` : i.message}</li>
            ))}
          </ul>
          {g.count > g.items.length && <div className="erd-confirm__more">… {g.count - g.items.length}건 더 있습니다.</div>}
        </div>
      ))}
    </div>
  );
}

export interface ConfirmDialogProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onConfirmed(): void }

export function ConfirmDialog({ ctx, opened, onClose, onConfirmed }: ConfirmDialogProps) {
  const [check, setCheck] = useState<ErdConfirmCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const [applyFrom, setApplyFrom] = useState("");
  const [sending, setSending] = useState(false);
  const { modelId } = ctx;
  // 열 때마다 새 토큰을 받는다. 확정 응답이 늦게 와도 지금 열린 대화상자가 아니면 상태를 건드리지 않는다(§37).
  const tokenRef = useRef(0);
  const openedRef = useRef(opened);
  openedRef.current = opened;
  const sendingRef = useRef(false);

  useEffect(() => {
    tokenRef.current += 1; // 열 때와 닫을 때 모두 이전 요청을 낡게 만든다
    if (!opened) return;
    let alive = true;
    setCheck(null);
    setError(null);
    setAck(false);
    setApplyFrom(applyFromText(new Date()));
    validateConfirm(modelId)
      .then((c) => {
        if (alive) setCheck(c);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, [opened, modelId]);

  const errors = useMemo(() => groupIssues(check?.errors ?? []), [check]);
  const warnings = useMemo(() => groupIssues(check?.warnings ?? []), [check]);
  const inferred = useMemo(() => Object.values(ctx.state.model.relations).filter((r) => r.state === "INFERRED").length, [ctx.state.model.relations]);
  const nErr = check?.errors.length ?? 0;
  const nWarn = check?.warnings.length ?? 0;
  const applyOk = isValidApplyFrom(applyFrom);
  const future = applyOk && applyFrom > applyFromText(new Date());
  const canSend = !!check && nErr === 0 && (nWarn === 0 || ack) && applyOk && !sending && ctx.rights.confirm.ok;

  const send = async () => {
    if (sendingRef.current) return; // 두 번 눌러도 한 번만 보낸다
    sendingRef.current = true;
    const token = tokenRef.current;
    const ver = ctx.state.ver;
    setSending(true);
    setError(null);
    try {
      await confirmVersion(modelId, ver, ctx.state.rowVersion, nWarn > 0, applyFrom);
      ctx.notify(`버전 ${ver} 를 확정했습니다.`);
      // 낡은 응답이 다시 연 대화상자를 닫지 않게 한다. 닫혀 있으면 다시 읽기만 시킨다.
      if (token === tokenRef.current || !openedRef.current) onConfirmed();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (token === tokenRef.current) setError(message);
      else ctx.notify(`확정: ${message}`, "error"); // 대화상자가 닫혔거나 다시 열렸다 — 화면 알림으로 알린다
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // 보내는 동안은 닫지 않는다(Esc·바깥 누름 포함).
  const close = () => {
    if (!sendingRef.current) onClose();
  };
  return (
    <Modal open={opened} title={`버전 ${ctx.state.ver} 확정`} size="lg" onClose={close}
      footer={(
        <>
          <Button data-testid="erd-confirm-cancel" disabled={sending} onClick={close}>닫기</Button>
          <Button variant="primary" data-testid="erd-confirm-send" disabled={!canSend} onClick={() => void send()}>확정</Button>
        </>
      )}>
      <div data-testid="erd-confirm-dialog">
        {!check && !error && <div className="erd-confirm__summary">확정 전 검사를 하는 중입니다.</div>}
        {check && (
          <div className="erd-confirm__summary" data-testid="erd-confirm-summary">
            오류 {nErr}건 · 경고 {nWarn}건 · 남은 추정 관계 {inferred}건(확정을 막지 않습니다)
          </div>
        )}
        {nErr > 0 && (
          <IssueList title="새로 넣거나 바꾼 컬럼이 표준에 맞지 않아 확정할 수 없습니다. 고친 뒤 다시 확정하세요." groups={errors} testId="erd-confirm-errors" />
        )}
        {nWarn > 0 && (
          <IssueList title="기존 위반입니다. 확인했으면 아래를 고르고 확정하세요." groups={warnings} testId="erd-confirm-warnings" />
        )}
        {nWarn > 0 && nErr === 0 && (
          <span data-testid="erd-confirm-ack">
            <Checkbox checked={ack} onChange={setAck} label={`경고 ${nWarn}건을 확인했습니다`} />
          </span>
        )}
        <div className="erd-editors__row">
          <span>적용 시작</span>
          <Input aria-label="적용 시작 시각" value={applyFrom} onChange={setApplyFrom} data-testid="erd-confirm-apply-from"
            error={applyOk ? undefined : "yyyy-MM-dd HH:mm:ss 형식으로 넣으세요."} />
        </div>
        {future && (
          <div className="erd-confirm__more" data-testid="erd-confirm-future">
            미래 시각입니다. 그 시각 전까지는 이 모델의 새 버전을 만들 수 없습니다(MDM006).
          </div>
        )}
        {error && <div className="erd-confirm__error" role="alert" data-testid="erd-confirm-error">{error}</div>}
      </div>
    </Modal>
  );
}
