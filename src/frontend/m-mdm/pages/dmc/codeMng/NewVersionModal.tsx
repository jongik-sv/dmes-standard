"use client";

/**
 * 새 버전 대화상자(TSK-06-02 design.md §6.12) — 스크린이 아니다(page.tsx·메뉴·OBJECT 없음).
 *
 * 종류(major/minor, 불가한 쪽 비활성), 새 번호(서버 nextMajor/nextMinor), 내용(빈 버전 / RELEASED 버전 복원)을 고른다.
 * 번호는 화면이 계산하지 않고 서버 값을 보인다 — 저장 때 서버가 다시 채번한다(I1~I4).
 * shared Radio 는 옵션별 비활성을 받지 않아 옵션마다 단일 선택 Radio 를 둔다.
 */
import { useEffect, useState } from "react";

import { Button, Radio } from "@dk-oasis/shared/form";
import { Modal } from "@dk-oasis/shared/modal";

import type { CodeEditFlags } from "./edit-types";

export type VerKind = "MAJOR" | "MINOR";

export interface NewVersionModalProps {
  open: boolean;
  initialKind: VerKind;
  flags: CodeEditFlags;
  restoreSources: string[];
  busy?: boolean;
  onClose: () => void;
  onSubmit: (kind: VerKind, sourceVer: string | null) => void;
}

const EMPTY = "EMPTY";
const hintStyle = { color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" } as const;
const rowStyle = { display: "flex", alignItems: "center", gap: "var(--spacing-md)", padding: "var(--spacing-xs) 0" } as const;

export function NewVersionModal({ open, initialKind, flags, restoreSources, busy, onClose, onSubmit }: NewVersionModalProps) {
  const [kind, setKind] = useState<VerKind>(initialKind);
  const [content, setContent] = useState<string>(EMPTY);

  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setContent(EMPTY);
    }
  }, [open, initialKind]);

  const number = kind === "MAJOR" ? flags.nextMajor : flags.nextMinor;
  const canSubmit = kind === "MAJOR" ? flags.canNewMajor : flags.canNewMinor;

  return (
    <Modal
      open={open}
      title="새 버전"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            data-testid="newver-ok"
            variant="primary"
            disabled={busy || !canSubmit}
            onClick={() => onSubmit(kind, content === EMPTY ? null : content)}
          >
            확인
          </Button>
        </>
      }
    >
      <div style={rowStyle}>
        <strong>종류</strong>
        <span data-testid="newver-kind-major">
          <Radio
            name="newver-kind-major"
            value={kind === "MAJOR" ? "MAJOR" : ""}
            options={[{ value: "MAJOR", label: "major" }]}
            disabled={!flags.canNewMajor}
            onChange={() => setKind("MAJOR")}
          />
        </span>
        <span data-testid="newver-kind-minor">
          <Radio
            name="newver-kind-minor"
            value={kind === "MINOR" ? "MINOR" : ""}
            options={[{ value: "MINOR", label: "minor" }]}
            disabled={!flags.canNewMinor}
            onChange={() => setKind("MINOR")}
          />
        </span>
        {flags.minorLimit ? <span style={hintStyle}>major 를 올리십시오</span> : null}
      </div>
      <div style={rowStyle}>
        <strong>새 번호</strong>
        <span data-testid="newver-number">{number ? `v${number}` : "—"}</span>
      </div>
      <div style={{ padding: "var(--spacing-xs) 0" }}>
        <strong>내용</strong>
        <div data-testid="newver-content-empty">
          <Radio
            name="newver-content-empty"
            value={content === EMPTY ? EMPTY : ""}
            options={[{ value: EMPTY, label: "빈 버전" }]}
            onChange={() => setContent(EMPTY)}
          />
        </div>
        {restoreSources.map((ver) => (
          <div key={ver} data-testid={`newver-content-restore-${ver}`}>
            <Radio
              name={`newver-content-restore-${ver}`}
              value={content === ver ? ver : ""}
              options={[{ value: ver, label: `v${ver} 내용으로 채우기(복원)` }]}
              onChange={() => setContent(ver)}
            />
          </div>
        ))}
      </div>
      <p style={hintStyle}>
        가장 큰 번호는 확정 취소된 버전과 작성 중 버전을 포함한다. 복원은 원본과 현재의 차이를 DRAFT 에 채운다
      </p>
    </Modal>
  );
}
