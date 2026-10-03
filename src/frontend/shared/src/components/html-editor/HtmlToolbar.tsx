"use client";

/**
 * HTML 편집 도구 막대 — B I U S │ H2 H3 │ 글머리·번호 │ 인용·코드·링크·구분선 │ 되돌리기·다시하기 │ 오른쪽 끝 [미리보기](원문 모드) [HTML].
 * markdown-editor 도구 막대와 같은 모습이다(shared `Button`·`Input` + Tabler 아이콘).
 *
 * - 단추는 명령(HtmlCommand)만 올린다. 서식 모드에서 HtmlEditor 가 Tiptap 명령으로 바꾼다. 원문 모드(onCommand 없음)에서는 서식 단추가 꺼진다.
 * - 커서 위치에서 켜진 서식은 aria-pressed="true". 단추 mousedown 기본 동작(초점 이동)을 막아 편집기 초점·고른 범위를 지킨다.
 * - 링크는 단추 아래 작은 입력 칸(창 아님, window.prompt 금지)으로 주소를 받는다. http/https 만 넣는다. 링크 위에서 빈 주소로 넣으면 링크를 뺀다.
 * - data-testid 는 편집기 testId 를 앞에 붙인다(`<testId>-tb-bold`) — 한 화면에 편집기가 둘 이상이어도 겹치지 않는다.
 */
import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconCode,
  IconH2,
  IconH3,
  IconItalic,
  IconLink,
  IconList,
  IconListNumbers,
  IconQuote,
  IconSeparatorHorizontal,
  IconStrikethrough,
  IconUnderline,
} from "@tabler/icons-react";
import { Button, Input } from "../form";

import { isSafeHref } from "../markdown-editor/md-ops";

export type HtmlSimpleCommand =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "code"
  | "hr"
  | "undo"
  | "redo";

export type HtmlCommand = HtmlSimpleCommand | { type: "link"; href: string } | { type: "unlink" };

/** 편집 방식 — rich: 서식(Tiptap), source: HTML 원문. */
export type HtmlEditMode = "rich" | "source";

interface ToolDef {
  cmd: HtmlSimpleCommand | "link";
  label: string;
  icon: ReactNode;
}

const ICON = { size: 14, stroke: 1.8 } as const;

/** 단추 묶음(묶음 사이에 구분선). 링크는 입력 칸을 여는 단추라 따로 그린다. */
const GROUPS: ToolDef[][] = [
  [
    { cmd: "bold", label: "굵게", icon: <IconBold {...ICON} /> },
    { cmd: "italic", label: "기울임", icon: <IconItalic {...ICON} /> },
    { cmd: "underline", label: "밑줄", icon: <IconUnderline {...ICON} /> },
    { cmd: "strike", label: "취소선", icon: <IconStrikethrough {...ICON} /> },
  ],
  [
    { cmd: "h2", label: "제목 2", icon: <IconH2 {...ICON} /> },
    { cmd: "h3", label: "제목 3", icon: <IconH3 {...ICON} /> },
  ],
  [
    { cmd: "bulletList", label: "글머리 목록", icon: <IconList {...ICON} /> },
    { cmd: "orderedList", label: "번호 목록", icon: <IconListNumbers {...ICON} /> },
  ],
  [
    { cmd: "blockquote", label: "인용", icon: <IconQuote {...ICON} /> },
    { cmd: "code", label: "코드", icon: <IconCode {...ICON} /> },
    { cmd: "link", label: "링크", icon: <IconLink {...ICON} /> },
    { cmd: "hr", label: "구분선", icon: <IconSeparatorHorizontal {...ICON} /> },
  ],
  [
    { cmd: "undo", label: "되돌리기", icon: <IconArrowBackUp {...ICON} /> },
    { cmd: "redo", label: "다시하기", icon: <IconArrowForwardUp {...ICON} /> },
  ],
];

export interface HtmlToolbarProps {
  /** data-testid 앞머리(편집기 testId). */
  testId: string;
  /** 도구 막대 접근성 이름. */
  ariaLabel: string;
  mode: HtmlEditMode;
  /** [HTML] 단추 — 서식 ↔ 원문. */
  onToggleSource(): void;
  /** 원문 모드의 [미리보기] 켜짐. */
  preview?: boolean;
  /** [미리보기] 단추(원문 모드에서만 보인다). */
  onTogglePreview?(): void;
  /** 서식 명령. 없으면 서식 단추를 끈다(원문 모드). */
  onCommand?(cmd: HtmlCommand): void;
  /** 커서 위치에서 켜진 명령 이름(링크는 "link"). */
  active?: ReadonlySet<string>;
  canUndo?: boolean;
  canRedo?: boolean;
  /** 링크 입력 칸을 열 때 넣어 둘 지금 링크 주소. */
  currentHref?: string;
  /** 링크 입력 칸이 닫힐 때(넣기·취소) — 편집기에 초점을 돌린다. */
  onLinkClose?(): void;
}

const NONE: ReadonlySet<string> = new Set();

/** mousedown 기본 동작(초점 이동)을 막는다 — 편집기 초점·고른 범위를 지킨다(키보드 Tab·Enter 는 그대로). */
const keepFocus = (e: MouseEvent) => e.preventDefault();

export function HtmlToolbar({
  testId,
  ariaLabel,
  mode,
  onToggleSource,
  preview = false,
  onTogglePreview,
  onCommand,
  active = NONE,
  canUndo = false,
  canRedo = false,
  currentHref,
  onLinkClose,
}: HtmlToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState("");
  const [error, setError] = useState("");
  const off = !onCommand;

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
    if (!h && active.has("link")) {
      onCommand?.({ type: "unlink" });
      closeLink();
      return;
    }
    if (!isSafeHref(h)) {
      setError("http:// 또는 https:// 로 시작하는 주소만 넣을 수 있습니다.");
      return;
    }
    onCommand?.({ type: "link", href: h });
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

  const disabledOf = (cmd: ToolDef["cmd"]) =>
    off || (cmd === "undo" && !canUndo) || (cmd === "redo" && !canRedo);

  const tool = (t: ToolDef) => (
    <Button
      key={t.cmd}
      className="cm-he-btn"
      ariaLabel={t.label}
      title={t.label}
      disabled={disabledOf(t.cmd)}
      aria-pressed={
        t.cmd === "undo" || t.cmd === "redo" || t.cmd === "hr" ? undefined : active.has(t.cmd)
      }
      aria-expanded={t.cmd === "link" ? linkOpen : undefined}
      data-testid={`${testId}-tb-${t.cmd}`}
      onMouseDown={keepFocus}
      onClick={() => {
        if (t.cmd === "link") {
          if (linkOpen) closeLink();
          else openLink();
          return;
        }
        onCommand?.(t.cmd);
      }}
    >
      {t.icon}
    </Button>
  );

  return (
    <div
      className="cm-he-toolbar"
      role="toolbar"
      aria-label={ariaLabel}
      data-testid={`${testId}-toolbar`}
    >
      {GROUPS.map((g, i) => (
        <span key={i} className="cm-he-group">
          {g.map(tool)}
        </span>
      ))}
      <span className="cm-he-mode" role="group" aria-label="편집 방식">
        {mode === "source" && (
          <Button
            className="cm-he-mode-btn"
            ariaLabel="미리보기"
            title="소독한 HTML 미리보기"
            aria-pressed={preview}
            data-testid={`${testId}-preview-toggle`}
            onMouseDown={keepFocus}
            onClick={() => onTogglePreview?.()}
          >
            미리보기
          </Button>
        )}
        <Button
          className="cm-he-mode-btn"
          ariaLabel="HTML 원문으로 편집"
          title={mode === "source" ? "서식으로 편집" : "HTML 원문으로 편집"}
          aria-pressed={mode === "source"}
          data-testid={`${testId}-mode-html`}
          onMouseDown={keepFocus}
          onClick={onToggleSource}
        >
          HTML
        </Button>
      </span>
      {linkOpen && !off && (
        <div className="cm-he-link-pop" data-testid={`${testId}-link-pop`}>
          <Input
            value={href}
            onChange={(v) => {
              setHref(v);
              if (error) setError("");
            }}
            onKeyDown={onLinkKey}
            placeholder="https://"
            aria-label="링크 주소"
            data-testid={`${testId}-link-input`}
            autoFocus
            aria-invalid={error ? true : undefined}
          />
          <Button
            size="sm"
            variant="primary"
            data-testid={`${testId}-link-apply`}
            onClick={applyLink}
          >
            넣기
          </Button>
          {error && (
            <span className="cm-he-link-error" data-testid={`${testId}-link-error`} role="alert">
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
