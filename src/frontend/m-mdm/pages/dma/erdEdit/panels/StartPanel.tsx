"use client";

/**
 * 빈 상태 시작 화면(UX 1차 U45) — 캔버스 자리에 할 일을 단추로 보인다.
 * (a) 모델이 없음 → [새 모델 등록], (b) 모델을 안 고름 → 모델 카드 + [새 모델 등록], (c) 고른 모델에 표가 없음 → [DB 에서 가져오기].
 * 권한이 없거나 막힌 단추는 끄고 감싼 span 의 title 로 이유를 보인다(꺼진 단추는 마우스 이벤트를 받지 않는다).
 */
import { Button } from "@dk-oasis/shared/form";

import type { ErdModelRow } from "../types";

export interface StartPanelProps {
  models: ErdModelRow[];
  modelId: string | null;
  loading: boolean;
  error: string | null;
  /** 고른 모델에 표가 없다. */
  empty: boolean;
  canReg: boolean;
  canImport: boolean;
  /** 읽기 전용·연결 끊김·처리 중 — 가져오기를 막는다. */
  importLocked: boolean;
  onPick(modelId: string): void;
  onRegister(): void;
  onImport(): void;
}

const NO_RIGHT = "권한 없음";
const IMPORT_LOCKED = "지금은 가져올 수 없습니다(읽기 전용이거나 처리 중)";

export function StartPanel(p: StartPanelProps) {
  const reg = (
    <span title={p.canReg ? undefined : NO_RIGHT}>
      <Button data-testid="erd-start-reg" disabled={!p.canReg} onClick={p.onRegister}>
        새 모델 등록
      </Button>
    </span>
  );
  let body;
  if (p.modelId === null) {
    body = p.models.length === 0 ? (
      <>
        <div className="erd-start__text">등록된 모델이 없습니다.</div>
        <div className="erd-start__actions">{reg}</div>
      </>
    ) : (
      <>
        <div className="erd-start__text">열 모델을 고르세요.</div>
        <div className="erd-start__cards">
          {p.models.map((m) => (
            <Button key={m.modelId} className="erd-start__card" data-testid={`erd-start-model-${m.modelId}`} onClick={() => p.onPick(m.modelId)}>
              {`${m.modelName} · ${m.moduleId} · ${m.schemaName}`}
            </Button>
          ))}
        </div>
        <div className="erd-start__actions">{reg}</div>
      </>
    );
  } else if (p.error) {
    body = <div className="erd-start__text">{p.error}</div>;
  } else if (p.loading) {
    body = <div className="erd-start__text">모델을 읽는 중입니다.</div>;
  } else if (p.empty) {
    const off = !p.canImport || p.importLocked;
    body = (
      <>
        <div className="erd-start__text">표가 없습니다. DB 스키마를 가져오면 표·관계를 만듭니다.</div>
        <div className="erd-start__actions">
          <span title={!p.canImport ? NO_RIGHT : p.importLocked ? IMPORT_LOCKED : undefined}>
            <Button variant="primary" data-testid="erd-start-import" disabled={off} onClick={p.onImport}>
              DB 에서 가져오기
            </Button>
          </span>
        </div>
      </>
    );
  } else {
    body = <div className="erd-start__text">다이어그램이 없습니다.</div>;
  }
  return (
    <div className="erd-empty erd-start" data-testid="erd-start">
      <div className="erd-start__box">{body}</div>
    </div>
  );
}
