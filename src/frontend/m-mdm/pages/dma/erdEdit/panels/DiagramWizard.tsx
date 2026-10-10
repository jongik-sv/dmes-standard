"use client";

/**
 * 다이어그램 만들기 마법사(스펙 8절 "다이어그램 생성 마법사", 단계 1 README 의 단계 2 할 일) — 1) 업무영역·이름 2) 표 고르기 3) 배치 방식.
 * 한 묶음 [addDiagram, placeTables] 로 보낸다(같은 묶음의 뒤 명령이 앞 명령이 만든 id 를 쓴다, 단계 0 Review Focus 1).
 * 다이어그램 명령이라 rights.diagram 을 본다(S2-20). 거절은 ctx.apply 가 알리고 창은 열어 둔다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Checkbox, Input, Radio } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import { newElementId, nextSortSeq, wizardCommands } from "../canvas/erd-commands";
import { ERD_EDIT_CSS, ERD_EDIT_STYLE_HREF } from "../canvas/erd-edit-styles";
import { wizardPlacement, type WizardLayout } from "../canvas/erd-layout";
import type { ErdEditContext } from "../edit-context";

type Step = 1 | 2 | 3;

const STEPS: readonly { step: Step; label: string }[] = [
  { step: 1, label: "1. 이름" },
  { step: 2, label: "2. 표 고르기" },
  { step: 3, label: "3. 배치" },
];

const LAYOUTS = [
  { value: "auto", label: "자동 배치 — 관계를 따라 부모를 왼쪽에 둔다" },
  { value: "grid", label: "격자 — 물리명 순으로 줄지어 둔다" },
];

export interface DiagramWizardProps {
  open: boolean;
  ctx: ErdEditContext;
  onClose(): void;
  /** 만든 뒤 그 다이어그램을 연다. */
  onCreated(diagramId: string): void;
}

export function DiagramWizard({ open, ctx, onClose, onCreated }: DiagramWizardProps) {
  const [step, setStep] = useState<Step>(1);
  const [area, setArea] = useState("");
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyUnplaced, setOnlyUnplaced] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [layout, setLayout] = useState<WizardLayout>("auto");
  const [busy, setBusy] = useState(false);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const model = ctx.state.model;
  const currentArea = ctx.diagramId ? ctx.state.diagrams[ctx.diagramId]?.areaName ?? "" : "";

  // 열 때마다 처음부터. 업무영역은 지금 보는 다이어그램의 것을 미리 넣는다.
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setArea(currentArea);
    setName("");
    setFilter("");
    setOnlyUnplaced(false);
    setPicked(new Set());
    setLayout("auto");
    setBusy(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- 여는 순간의 업무영역만 쓴다

  const placed = useMemo(() => new Set(Object.values(ctx.state.nodes).map((n) => n.table)), [ctx.state.nodes]);
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return Object.entries(model.tables)
      .filter(([id, t]) => (!onlyUnplaced || !placed.has(id)) && (!q || t.phys.toLowerCase().includes(q) || t.logical.toLowerCase().includes(q)))
      .sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  }, [model.tables, filter, onlyUnplaced, placed]);

  const a = area.trim();
  const n = name.trim();
  const nameError = !a || !n
    ? "업무영역과 이름을 넣으세요."
    : Object.values(ctx.state.diagrams).some((d) => d.areaName === a && d.diagramName === n)
      ? "같은 업무영역에 같은 이름의 다이어그램이 있습니다."
      : null;
  const rightError = ctx.rights.diagram.ok ? null : ctx.rights.diagram.reason ?? "지금은 고칠 수 없습니다.";

  const toggle = (id: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const create = async () => {
    if (busy || nameError || rightError) return;
    setBusy(true);
    const start = ctx.modelId;
    try {
      const id = newElementId("d");
      const nodes = wizardPlacement(model, [...picked], layout, ctx.audit.show);
      const out = await ctx.apply(wizardCommands({ id, areaName: a, diagramName: n, sortSeq: nextSortSeq(ctx.state.diagrams), nodes }), "다이어그램 만들기");
      // 응답을 기다리는 동안 모델이 바뀌었으면 그 모델의 다이어그램을 열지 않는다(Local-Rules §37).
      if (ctxRef.current.modelId !== start) return;
      if (out.ok) {
        onCreated(id);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const footer = (
    <div className="erd-dialog__actions">
      {step === 1 ? (
        <Button data-testid="erd-wiz-cancel" onClick={onClose}>취소</Button>
      ) : (
        <Button data-testid="erd-wiz-prev" onClick={() => setStep((s) => (s - 1) as Step)}>이전</Button>
      )}
      {step < 3 ? (
        <Button variant="primary" data-testid="erd-wiz-next" disabled={nameError !== null} onClick={() => setStep((s) => (s + 1) as Step)}>다음</Button>
      ) : (
        <Button variant="primary" data-testid="erd-wiz-create" disabled={busy || rightError !== null} onClick={() => void create()}>만들기</Button>
      )}
    </div>
  );

  return (
    <Modal open={open} title="새 다이어그램" size="lg" onClose={onClose} footer={footer}>
      <style href={ERD_EDIT_STYLE_HREF} precedence="default">
        {ERD_EDIT_CSS}
      </style>
      <div className="erd-wizard__steps" data-testid="erd-wiz">
        {STEPS.map((s) => (
          <span key={s.step} data-current={s.step === step ? "" : undefined}>{s.label}</span>
        ))}
      </div>
      {rightError && <div className="erd-dialog__error" role="alert">{rightError}</div>}
      {step === 1 && (
        <>
          <div className="erd-dialog__row">
            <label htmlFor="erd-wiz-area">업무영역</label>
            <Input id="erd-wiz-area" data-testid="erd-wiz-area" value={area} onChange={setArea} autoFocus />
          </div>
          <div className="erd-dialog__row">
            <label htmlFor="erd-wiz-name">다이어그램 이름</label>
            <Input id="erd-wiz-name" data-testid="erd-wiz-name" value={name} onChange={setName} />
          </div>
          {nameError && (a || n) && <div className="erd-dialog__error" data-testid="erd-wiz-error">{nameError}</div>}
        </>
      )}
      {step === 2 && (
        <>
          <div className="erd-wizard__tools">
            <Input data-testid="erd-wiz-filter" placeholder="물리명·논리명으로 거르기" value={filter} onChange={setFilter} />
            <Checkbox aria-label="다이어그램에 없는 표만" label="다이어그램에 없는 표만" checked={onlyUnplaced} onChange={setOnlyUnplaced} />
            <Button size="sm" data-testid="erd-wiz-all" onClick={() => setPicked((cur) => new Set([...cur, ...rows.map(([id]) => id)]))}>보이는 표 모두 고르기</Button>
            <Button size="sm" data-testid="erd-wiz-none" onClick={() => setPicked(new Set())}>모두 풀기</Button>
            <span data-testid="erd-wiz-count">고른 표 {picked.size}개</span>
          </div>
          <div className="erd-wizard__list">
            {rows.map(([id, t]) => (
              <div key={id} className="erd-wizard__row" data-testid="erd-wiz-row" data-table={id}>
                <Checkbox aria-label={t.phys} label={t.phys} checked={picked.has(id)} onChange={(on) => toggle(id, on)} />
                <span className="erd-wizard__logical">{t.logical}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <>
          <Radio name="erd-wiz-layout" aria-label="배치 방식" value={layout} options={LAYOUTS} onChange={(v) => setLayout(v as WizardLayout)} />
          <p className="erd-dialog__note">
            {a} / {n} 에 표 {picked.size}개를 놓습니다. 만든 뒤에도 끌어서 옮기거나 [자동 배치]로 다시 놓을 수 있습니다.
          </p>
        </>
      )}
    </Modal>
  );
}
