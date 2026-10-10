"use client";

/**
 * 관계 이름 겹침 선택 창(스펙 4.1 addRelation onNameClash, 조사 A E6). 서버가 NEEDS_CHOICE 로 겹친 컬럼을 주면 띄운다.
 * 고르는 단위는 관계 전체다(컬럼별로 따로 고르지 못한다 — 서버 규칙). REUSE 는 그 컬럼을 자식 컬럼으로 쓰고, RENAME 은 부모 접두를 붙여 새로 만든다.
 */
import { Button } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { ClashChoice } from "./erd-commands";

export interface RelationClashModalProps {
  open: boolean;
  /** 부모·자식 표 물리명. */
  parent: string;
  child: string;
  choices: readonly ClashChoice[];
  /** 고른 방식으로 다시 보내는 중 — 두 번 눌러 관계가 둘 생기지 않게 단추를 끈다. */
  busy?: boolean;
  onPick(mode: "REUSE" | "RENAME"): void;
  onClose(): void;
}

export function RelationClashModal({ open, parent, child, choices, busy = false, onPick, onClose }: RelationClashModalProps) {
  return (
    <Modal
      open={open}
      title="같은 이름의 컬럼"
      size="md"
      onClose={onClose}
      footer={
        <div className="erd-dialog__actions">
          <Button data-testid="erd-clash-cancel" onClick={onClose}>취소</Button>
          <Button data-testid="erd-clash-rename" disabled={busy} onClick={() => onPick("RENAME")}>새 컬럼 만들기</Button>
          <Button variant="primary" data-testid="erd-clash-reuse" disabled={busy} onClick={() => onPick("REUSE")}>있는 컬럼 쓰기</Button>
        </div>
      }
    >
      <div data-testid="erd-clash">
        <p>
          자식 표 <span className="erd-mono">{child}</span> 에 부모 표 <span className="erd-mono">{parent}</span> 의 기본키와 같은 이름의 컬럼이 있습니다.
        </p>
        <ul className="erd-dialog__list">
          {choices.map((c) => (
            <li key={c.childColumn}>{c.phys}</li>
          ))}
        </ul>
        <p className="erd-dialog__note">
          [있는 컬럼 쓰기]는 그 컬럼을 관계의 자식 컬럼으로 씁니다. [새 컬럼 만들기]는 부모 표 접두를 붙인 컬럼을 새로 만듭니다. 고른 방식은 이 관계의 모든 컬럼에 같이 쓰입니다.
        </p>
      </div>
    </Modal>
  );
}
