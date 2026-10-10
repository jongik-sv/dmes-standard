"use client";

/**
 * 공동 편집자 관리(D15, R7). 누구나 목록을 보고, 더하기·빼기는 DRAFT 소유자만 한다(rights.manageEditors, 서버도 판정).
 * 사용자 ID 는 서버가 있는지 보지 않는다. Claude 세션은 그 세션의 ERD_USER 값을 넣는다(README 마감 3).
 * 성공하면 편집자 목록을 version 이벤트 모양으로 곧바로 바꾼다(편집자 행은 ROW_VERSION 을 바꾸지 않는다).
 */
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { addEditor, removeEditor } from "../api";
import type { ErdEditContext } from "../edit-context";
import { localVersionEvent } from "../state/model-delta";
import type { ErdVersionEvent } from "../types";

export interface EditorsModalProps { ctx: ErdEditContext; opened: boolean; onClose(): void; onVersion(ev: ErdVersionEvent): void }

export function EditorsModal({ ctx, opened, onClose, onVersion }: EditorsModalProps) {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = ctx.state;
  const can = ctx.rights.manageEditors;
  // 응답이 늦게 오는 사이 SSE 로 rowVersion 이 바뀔 수 있다. 눌렀을 때의 state 가 아니라 응답 때의 최신 state 로 이벤트를 만든다.
  const stateRef = useRef(ctx.state);
  stateRef.current = ctx.state;

  // 열 때마다 입력·오류를 비운다(닫았다 다시 열면 지난 값이 남지 않게).
  useEffect(() => {
    if (!opened) return;
    setUserId("");
    setError(null);
  }, [opened]);

  const change = async (kind: "ADD" | "REMOVE", raw: string) => {
    const target = raw.trim();
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "ADD") await addEditor(ctx.modelId, target);
      else await removeEditor(ctx.modelId, target);
      const cur = stateRef.current;
      const editors = kind === "REMOVE" ? cur.editors.filter((x) => x !== target)
        : cur.editors.includes(target) || target === cur.ownerId ? cur.editors : [...cur.editors, target];
      onVersion(localVersionEvent(cur, ctx.me, kind === "ADD" ? "ADD_EDITOR" : "REMOVE_EDITOR", { editors }));
      if (kind === "ADD") setUserId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={opened} title="공동 편집자" size="md" onClose={onClose}
      footer={<Button data-testid="erd-editors-close" onClick={onClose}>닫기</Button>}>
      <div data-testid="erd-editors">
        <div className="erd-confirm__summary">
          소유자: {s.ownerId ?? "없음"}. {can.ok ? "사용자 ID 를 넣어 더하거나 뺍니다. Claude 세션은 ERD_USER 값을 넣습니다." : can.reason}
        </div>
        {s.editors.length === 0 && <div className="erd-confirm__more">공동 편집자가 없습니다.</div>}
        {s.editors.map((e) => (
          <div key={e} className="erd-editors__row" data-testid={`erd-editor-${e}`}>
            <span className="erd-mono">{e}</span>
            <Button size="mini" variant="danger" data-testid={`erd-editor-remove-${e}`} disabled={!can.ok || busy} onClick={() => void change("REMOVE", e)}>
              빼기
            </Button>
          </div>
        ))}
        <div className="erd-editors__row">
          <Input aria-label="공동 편집자 사용자 ID" placeholder="사용자 ID" value={userId} maxLength={50} disabled={!can.ok || busy}
            data-testid="erd-editor-input" onChange={setUserId} />
          <Button size="sm" variant="primary" data-testid="erd-editor-add" disabled={!can.ok || busy || !userId.trim()}
            onClick={() => void change("ADD", userId)}>
            더하기
          </Button>
        </div>
        {error && <div className="erd-confirm__error" role="alert" data-testid="erd-editors-error">{error}</div>}
      </div>
    </Modal>
  );
}
