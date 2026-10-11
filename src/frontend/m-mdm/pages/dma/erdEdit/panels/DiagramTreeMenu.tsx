"use client";

/**
 * 다이어그램 목록 오른쪽 클릭 메뉴(2차 p1) — 이름 바꾸기 · 지우기 · 복사.
 * - 이름 바꾸기 = updateDiagram, 지우기 = 확인 창 + deleteDiagram 뒤 알림의 [되돌리기](기존 restore), 복사 = copyDiagram(서버 b2 뒤).
 * - 다이어그램 명령이라 rights.diagram 을 본다(S2-20). 거절은 ctx.apply 가 알린다.
 * - 메뉴는 shared react-flow 의 ContextMenu 를 그대로 쓴다(Esc·바깥 누르기·스크롤로 닫힘).
 */
import { useEffect, useRef, useState } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";
import { ContextMenu, type MenuItem } from "@dk-oasis/shared/react-flow";

import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "../canvas/erd-edit-styles";
import { newElementId } from "../canvas/erd-commands";
import type { ErdCommandJson, ErdDiagram } from "../types";
import type { ErdEditContext } from "../edit-context";
import { shortReason } from "../state/permissions";

/** 서버 copyDiagram(erd2-be b2, dev ea092909f)이 머지돼 있는가. 거짓이면 메뉴에서 복사를 감춘다. */
export const DIAGRAM_COPY_ENABLED = true;

export const renameDiagramCommand = (id: string, diagramName: string): ErdCommandJson => ({ op: "updateDiagram", id, set: { diagramName } });
export const deleteDiagramCommand = (id: string): ErdCommandJson => ({ op: "deleteDiagram", id });
export const copyDiagramCommand = (from: string, id: string, areaName: string, diagramName: string): ErdCommandJson =>
  ({ op: "copyDiagram", from, id, areaName, diagramName });

/** 같은 업무영역에서 이름이 겹치는지(자기 자신은 뺀다). 문제가 없으면 null. */
export function diagramNameError(diagrams: Readonly<Record<string, ErdDiagram>>, areaName: string, name: string, selfId: string | null): string | null {
  const n = name.trim();
  if (n === "") return "이름을 넣으세요.";
  const dup = Object.values(diagrams).some((d) => d.id !== selfId && d.areaName === areaName && d.diagramName === n);
  return dup ? "같은 업무영역에 같은 이름의 다이어그램이 있습니다." : null;
}

/** 복사 기본 이름 — 「<이름> 복사」, 겹치면 「<이름> 복사 2」… */
export function copyDefaultName(diagrams: Readonly<Record<string, ErdDiagram>>, areaName: string, name: string): string {
  const taken = new Set(Object.values(diagrams).filter((d) => d.areaName === areaName).map((d) => d.diagramName));
  const base = `${name} 복사`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const c = `${base} ${i}`;
    if (!taken.has(c)) return c;
  }
}

export interface DiagramMenuTarget { id: string; x: number; y: number }
export interface UndoOffer { rev: number; text: string }

export interface DiagramMenuProps {
  ctx: ErdEditContext;
  target: DiagramMenuTarget | null;
  onClose(): void;
  /** 지운 뒤 알림 [되돌리기] 를 제안한다. */
  onDeleted(offer: UndoOffer): void;
  /** 복사해 만든 다이어그램을 연다. */
  onCopied(diagramId: string): void;
}

type Dialog = { kind: "rename" | "delete" | "copy"; id: string } | null;

export function DiagramMenu({ ctx, target, onClose, onDeleted, onCopied }: DiagramMenuProps) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const diagram = dialog ? ctx.state.diagrams[dialog.id] : undefined;

  // 창을 여는 순간의 기본 이름을 넣는다.
  useEffect(() => {
    if (!dialog) return;
    const d = ctxRef.current.state.diagrams[dialog.id];
    if (!d) return;
    setBusy(false);
    setName(dialog.kind === "copy" ? copyDefaultName(ctxRef.current.state.diagrams, d.areaName, d.diagramName) : d.diagramName);
  }, [dialog]);

  const rights = ctx.rights.diagram;
  const off = !rights.ok;
  const offTitle = off ? shortReason(rights.reason) || undefined : undefined;
  const items: MenuItem[] = target
    ? [
        { id: "rename", label: "이름 바꾸기", disabled: off, title: offTitle, run: () => setDialog({ kind: "rename", id: target.id }) },
        ...(DIAGRAM_COPY_ENABLED ? [{ id: "copy", label: "복사", disabled: off, title: offTitle, run: () => setDialog({ kind: "copy", id: target.id }) }] : []),
        { id: "delete", label: "지우기", danger: true, disabled: off, title: offTitle, run: () => setDialog({ kind: "delete", id: target.id }) },
      ]
    : [];

  const close = () => setDialog(null);
  const nameError = dialog && diagram && dialog.kind !== "delete"
    ? diagramNameError(ctx.state.diagrams, diagram.areaName, name, dialog.kind === "rename" ? diagram.id : null)
    : null;
  const unchanged = dialog?.kind === "rename" && diagram !== undefined && name.trim() === diagram.diagramName;

  const submit = async () => {
    if (!dialog || !diagram || busy) return;
    const start = ctxRef.current.modelId;
    const n = name.trim();
    setBusy(true);
    try {
      if (dialog.kind === "rename") {
        if (nameError || unchanged) return;
        const out = await ctx.apply([renameDiagramCommand(diagram.id, n)], "다이어그램 이름 바꾸기");
        if (out.ok) close();
      } else if (dialog.kind === "copy") {
        if (nameError) return;
        const id = newElementId("d");
        const out = await ctx.apply([copyDiagramCommand(diagram.id, id, diagram.areaName, n)], "다이어그램 복사");
        if (ctxRef.current.modelId !== start) return;
        if (out.ok) {
          close();
          onCopied(id);
        }
      } else {
        const out = await ctx.apply([deleteDiagramCommand(diagram.id)], "다이어그램 지우기");
        if (out.ok) {
          close();
          onDeleted({ rev: out.rev, text: `다이어그램 「${diagram.diagramName}」 을 지웠습니다.` });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const title = dialog?.kind === "rename" ? "다이어그램 이름 바꾸기" : dialog?.kind === "copy" ? "다이어그램 복사" : "다이어그램 지우기";
  const footer = (
    <div className="erd-dialog__actions">
      <Button data-testid="erd-diagram-dialog-cancel" onClick={close}>취소</Button>
      <Button variant={dialog?.kind === "delete" ? "danger" : "primary"} data-testid="erd-diagram-dialog-ok"
        disabled={busy || !rights.ok || (dialog?.kind !== "delete" && (nameError !== null || unchanged))} onClick={() => void submit()}>
        {dialog?.kind === "delete" ? "지우기" : dialog?.kind === "copy" ? "복사" : "바꾸기"}
      </Button>
    </div>
  );

  return (
    <>
      <ContextMenu items={items} at={target ? { x: target.x, y: target.y } : null} onClose={onClose} testId="erd-diagram-menu" />
      {dialog && diagram && (
        <Modal open title={title} size="sm" onClose={close} footer={footer}>
          <style href={ERD_EDIT_STYLE_HREF} precedence="default">
            {ERD_EDIT_CSS}
          </style>
          {!rights.ok && <div className="erd-dialog__error" role="alert">{rights.reason ?? "지금은 고칠 수 없습니다."}</div>}
          {dialog.kind === "delete" ? (
            <div data-testid="erd-diagram-delete-text">
              <p>다이어그램 「{diagram.diagramName}」 을 지울까요?</p>
              <p className="erd-dialog__note">표·관계는 그대로 남고, 이 다이어그램의 배치와 관계선 꺾임점만 사라집니다. 지운 뒤 알림의 [되돌리기] 로 돌릴 수 있습니다.</p>
            </div>
          ) : (
            <div className="erd-dialog__row">
              <label htmlFor="erd-diagram-dialog-name">{dialog.kind === "copy" ? "새 다이어그램 이름" : "다이어그램 이름"}</label>
              <Input id="erd-diagram-dialog-name" data-testid="erd-diagram-dialog-name" value={name} onChange={setName} autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    void submit();
                  }
                }} />
              {nameError && name.trim() !== "" && <div className="erd-dialog__error" data-testid="erd-diagram-dialog-error">{nameError}</div>}
              <span className="erd-dialog__note">업무영역: {diagram.areaName}</span>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
