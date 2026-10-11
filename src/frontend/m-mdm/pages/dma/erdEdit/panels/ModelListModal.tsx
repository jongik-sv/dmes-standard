"use client";

/**
 * 모델 목록 관리 창(2차 p2) — 위 막대 [모델 관리]·시작 화면에서 연다.
 * - 칸: 이름·모듈·스키마·상태·소유자·rev·확정본. 행을 고르고 [열기]·[삭제]. 행을 두 번 누르면 연다.
 * - [삭제]는 확인 창에서 모델 ID 를 입력해야 켜진다. 완전 삭제이며 되돌릴 수 없다(§7.2). 거절(권한)은 서버 문구를 그대로 보인다.
 * - 삭제 요청·목록 다시 읽기·지금 연 모델이면 시작 화면으로 가기는 부르는 쪽(ErdViewer)이 한다. 이 창은 onDelete 의 결과만 본다.
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Modal } from "@dk-oasis/shared/modal";

import type { ErdModelRow } from "../types";

export interface ModelListRow extends Record<string, unknown> {
  id: string; name: string; moduleId: string; schemaName: string; status: string; ownerId: string; rev: number; released: string;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  DRAFT: "작성 중", REQUESTED: "확정 요청", APPROVED: "승인", RELEASED: "확정",
};

/** 옛 서버는 status·releasedVer·createdBy 가 없다 — 빈 칸으로 보인다. 소유자 = 작성 중 소유자, 없으면 만든 사람. */
export function modelListRows(models: readonly ErdModelRow[]): ModelListRow[] {
  return models.map((m) => ({
    id: m.modelId,
    name: m.modelName,
    moduleId: m.moduleId,
    schemaName: m.schemaName,
    status: m.status ? STATUS_LABEL[m.status] ?? m.status : "",
    ownerId: m.ownerId ?? m.createdBy ?? "",
    rev: m.rev,
    released: m.releasedVer ?? "",
  }));
}

export const MODEL_LIST_COLUMNS: GridColumn[] = [
  { key: "name", header: "이름", width: 160, minWidth: 90, align: "left" },
  { key: "moduleId", header: "모듈", width: 70, minWidth: 50, align: "left" },
  { key: "schemaName", header: "스키마", width: 120, minWidth: 70, align: "left" },
  { key: "status", header: "상태", width: 80, minWidth: 50, align: "center" },
  { key: "ownerId", header: "소유자", width: 100, minWidth: 60, align: "left" },
  { key: "rev", header: "rev", width: 60, minWidth: 40, align: "right" },
  { key: "released", header: "확정본", width: 80, minWidth: 50, align: "center" },
];

export type DeleteOutcome = { ok: true } | { ok: false; message: string };

export interface ModelListModalProps {
  opened: boolean;
  models: readonly ErdModelRow[];
  /** 지금 연 모델(지우면 시작 화면으로 간다는 안내를 보인다). */
  currentModelId: string | null;
  onClose(): void;
  onOpenModel(modelId: string): void;
  /** 완전 삭제를 보내고 결과를 돌려준다. 던지지 않는다. */
  onDelete(modelId: string): Promise<DeleteOutcome>;
}

const GRID_BOX: CSSProperties = { position: "relative", height: 320 };
const FILL: CSSProperties = { position: "absolute", inset: 0 };

export function ModelListModal({ opened, models, currentModelId, onClose, onOpenModel, onDelete }: ModelListModalProps) {
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = useMemo(() => modelListRows(models), [models]);
  const target = sel !== null ? models.find((m) => m.modelId === sel) ?? null : null;

  // 열 때마다 고름·확인 창을 비운다. 목록에서 사라진 모델(삭제 뒤)은 고름도 푼다.
  useEffect(() => {
    if (opened) return;
    setSel(null);
    setConfirm(false);
    setTyped("");
    setError(null);
  }, [opened]);
  useEffect(() => {
    if (sel !== null && !models.some((m) => m.modelId === sel)) setSel(null);
  }, [models, sel]);

  const onRow = useCallback((row: Record<string, unknown>) => setSel(String(row.id)), []);
  const onRowDouble = useCallback((row: Record<string, unknown>) => {
    onOpenModel(String(row.id));
    onClose();
  }, [onOpenModel, onClose]);
  const open = () => {
    if (!target) return;
    onOpenModel(target.modelId);
    onClose();
  };
  const startDelete = () => {
    setTyped("");
    setError(null);
    setConfirm(true);
  };
  const cancelDelete = () => {
    if (busy) return;
    setConfirm(false);
    setTyped("");
    setError(null);
  };
  const doDelete = async () => {
    if (!target || busy || typed !== target.modelId) return;
    setBusy(true);
    setError(null);
    try {
      const out = await onDelete(target.modelId);
      if (out.ok) {
        setConfirm(false);
        setTyped("");
        setSel(null);
      } else {
        setError(out.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={opened} title="모델 관리" size="lg" onClose={onClose}
        footer={(
          <>
            <Button data-testid="erd-models-open" variant="primary" disabled={!target} onClick={open}>열기</Button>
            <Button data-testid="erd-models-delete" variant="danger" disabled={!target} onClick={startDelete}>삭제</Button>
            <Button data-testid="erd-models-close" onClick={onClose}>닫기</Button>
          </>
        )}>
        <div data-testid="erd-models">
          <div style={GRID_BOX}>
            <div style={FILL}>
              <AgDataGrid gridId="erdModels" columnSizing="fit" columns={MODEL_LIST_COLUMNS} data={rows} rowKey="id"
                highlightedRowKey={sel} onRowClick={onRow} onRowDoubleClick={onRowDouble}
                emptyMessage="등록된 모델이 없습니다." emptyTestId="erd-models-empty" />
            </div>
          </div>
        </div>
      </Modal>
      <Modal open={opened && confirm && target !== null} title="모델 삭제" size="sm" onClose={cancelDelete}
        footer={(
          <>
            <Button data-testid="erd-model-delete-cancel" disabled={busy} onClick={cancelDelete}>취소</Button>
            <Button data-testid="erd-model-delete-ok" variant="danger" disabled={busy || !target || typed !== target.modelId}
              onClick={() => void doDelete()}>
              삭제
            </Button>
          </>
        )}>
        {target && (
          <div data-testid="erd-model-delete">
            <p>모델 「{target.modelName}」({target.modelId}) 을 완전히 지웁니다.</p>
            <p>표·관계·다이어그램·버전·변경 기록이 모두 사라지며 되돌릴 수 없습니다.{target.modelId === currentModelId ? " 지금 연 모델이라 시작 화면으로 돌아갑니다." : ""}</p>
            <label htmlFor="erd-model-delete-input">계속하려면 모델 ID <b>{target.modelId}</b> 를 입력하세요.</label>
            <Input id="erd-model-delete-input" data-testid="erd-model-delete-input" value={typed} autoFocus disabled={busy}
              onChange={setTyped} />
            {error && <div className="erd-dialog__error" role="alert" data-testid="erd-model-delete-error">{error}</div>}
          </div>
        )}
      </Modal>
    </>
  );
}
