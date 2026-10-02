"use client";

/**
 * 마크다운 편집 도구 막대 — ¶ H1 H2 H3 │ B I S │ 글머리·번호·할 일 │ 인용·링크 │ 오른쪽 끝 「MD | 서식」.
 * 단추는 명령(MdCommand)만 올린다. 서식 모드는 MarkdownEditor 가 Tiptap 명령으로, MD 모드는 applyMdCommand 로 바꾼다.
 *
 * - shared `Button`·`Input`(form 래퍼)과 Tabler 아이콘으로 만든다 — 모습이 다른 입력 칸·단추와 같다.
 * - 커서 위치에서 켜진 서식은 aria-pressed="true". 단추 mousedown 기본 동작(초점 이동)을 막아 편집기 초점·고른 범위를 지킨다.
 * - 링크는 단추 아래 작은 입력 칸(창 아님, window.prompt 금지)으로 주소를 받는다. http/https 만 넣는다.
 */
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  IconBold,
  IconH1,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconPilcrow,
  IconQuote,
  IconStrikethrough,
} from "@tabler/icons-react";
import { Button, Input } from "../form";

import { isSafeHref, type MdCommand } from "./md-ops";
import type { MarkdownEditMode } from "./edit-mode";

type SimpleCommand = Exclude<MdCommand, { type: "link" }>;

interface ToolDef {
  cmd: SimpleCommand;
  label: string;
  icon: ReactNode;
}

const ICON = { size: 14, stroke: 1.8 } as const;

/** 단추 묶음(묶음 사이에 구분선). */
const GROUPS: ToolDef[][] = [
  [
    { cmd: "paragraph", label: "문단", icon: <IconPilcrow {...ICON} /> },
    { cmd: "h1", label: "제목 1", icon: <IconH1 {...ICON} /> },
    { cmd: "h2", label: "제목 2", icon: <IconH2 {...ICON} /> },
    { cmd: "h3", label: "제목 3", icon: <IconH3 {...ICON} /> },
  ],
  [
    { cmd: "bold", label: "굵게", icon: <IconBold {...ICON} /> },
    { cmd: "italic", label: "기울임", icon: <IconItalic {...ICON} /> },
    { cmd: "strike", label: "취소선", icon: <IconStrikethrough {...ICON} /> },
  ],
  [
    { cmd: "bulletList", label: "글머리 목록", icon: <IconList {...ICON} /> },
    {
      cmd: "orderedList",
      label: "번호 목록",
      icon: <IconListNumbers {...ICON} />,
    },
    { cmd: "taskList", label: "할 일 목록", icon: <IconListCheck {...ICON} /> },
  ],
  [{ cmd: "blockquote", label: "인용", icon: <IconQuote {...ICON} /> }],
];

export interface MarkdownToolbarProps {
  mode: MarkdownEditMode;
  onModeChange(mode: MarkdownEditMode): void;
  /** 커서 위치에서 켜진 명령 이름(activeMdCommands 와 같은 이름, 링크는 "link"). */
  active: ReadonlySet<string>;
  onCommand(cmd: MdCommand): void;
  /** 링크 입력 칸을 열 때 넣어 둘 지금 링크 주소. */
  currentHref?: string;
  /** 링크 입력 칸이 닫힐 때(넣기·취소) — 편집기에 초점을 돌린다. */
  onLinkClose?(): void;
  /** 도구 막대 접근성 이름(기본 "서식"). */
  ariaLabel?: string;
}

/** mousedown 기본 동작(초점 이동)을 막는다 — 편집기 초점·고른 범위를 지킨다(키보드 Tab·Enter 는 그대로). */
const keepFocus = (e: MouseEvent) => e.preventDefault();

export function MarkdownToolbar({
  mode,
  onModeChange,
  active,
  onCommand,
  currentHref,
  onLinkClose,
  ariaLabel = "서식",
}: MarkdownToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [error, setError] = useState("");

  const openLink = () => {
    setHref(currentHref ?? "");
    setError("");
    setLinkOpen(true);
  };
  const closeLink = () => {
    setLinkOpen(false);
    setError("");
    onLinkClose?.();
  };
  const applyLink = () => {
    const h = href.trim();
    if (!isSafeHref(h)) {
      setError("http:// 또는 https:// 로 시작하는 주소만 넣을 수 있습니다.");
      return;
    }
    onCommand({ type: "link", href: h });
    closeLink();
  };
  const onLinkKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applyLink();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeLink();
    }
  };

  const tool = (t: ToolDef) => (
    <Button
      key={t.cmd}
      className="cm-md-btn"
      ariaLabel={t.label}
      title={t.label}
      aria-pressed={active.has(t.cmd)}
      data-testid={`md-tb-${t.cmd}`}
      onMouseDown={keepFocus}
      onClick={() => onCommand(t.cmd)}
    >
      {t.icon}
    </Button>
  );

  return (
    <div className="cm-md-toolbar" role="toolbar" aria-label={ariaLabel} data-testid="md-toolbar">
      {GROUPS.map((g, i) => (
        <span key={i} className="cm-md-group">
          {g.map(tool)}
          {i === GROUPS.length - 1 && (
            <Button
              className="cm-md-btn"
              ariaLabel="링크"
              title="링크"
              aria-pressed={active.has("link")}
              aria-expanded={linkOpen}
              data-testid="md-tb-link"
              onMouseDown={keepFocus}
              onClick={() => (linkOpen ? closeLink() : openLink())}
            >
              <IconLink {...ICON} />
            </Button>
          )}
        </span>
      ))}
      <span className="cm-md-mode" role="group" aria-label="편집 방식" data-testid="md-mode-toggle">
        <Button
          className="cm-md-mode-btn"
          ariaLabel="마크다운 원문으로 편집"
          title="마크다운 원문으로 편집"
          aria-pressed={mode === "markdown"}
          data-testid="md-mode-md"
          onMouseDown={keepFocus}
          onClick={() => onModeChange("markdown")}
        >
          MD
        </Button>
        <Button
          className="cm-md-mode-btn"
          ariaLabel="서식으로 편집"
          title="서식으로 편집"
          aria-pressed={mode === "wysiwyg"}
          data-testid="md-mode-wysiwyg"
          onMouseDown={keepFocus}
          onClick={() => onModeChange("wysiwyg")}
        >
          서식
        </Button>
      </span>
      {linkOpen && (
        <div className="cm-md-link-pop" data-testid="md-link-pop">
          <Input
            value={href}
            onChange={(v) => {
              setHref(v);
              if (error) setError("");
            }}
            onKeyDown={onLinkKey}
            placeholder="https://"
            aria-label="링크 주소"
            data-testid="md-link-input"
            autoFocus
            aria-invalid={error ? true : undefined}
          />
          <Button size="sm" variant="primary" data-testid="md-link-apply" onClick={applyLink}>
            넣기
          </Button>
          {error && (
            <span className="cm-md-link-error" data-testid="md-link-error" role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
