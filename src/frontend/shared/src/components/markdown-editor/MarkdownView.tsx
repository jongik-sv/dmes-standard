"use client";

/**
 * 마크다운 읽기 전용 모습 — 마크다운을 편집기와 같은 변환(markdown.ts)으로 읽어 React 요소로 그린다(HTML 문자열을 넣지 않는다).
 * 글마다 ProseMirror 편집기를 띄우지 않으려고 따로 그린다. 링크는 http/https 만 새 탭으로 열고, 누름이 바깥(고르기·편집 열기)으로
 * 올라가지 않는다. 할 일 체크박스는 바꿀 수 없다(편집 중에만 바꾼다). 스타일은 컴포넌트가 직접 넣는다(styles.tsx).
 * GFM 표는 `<table>` 로 그린다(머리글 thead·본문 tbody, `:---:` 정렬, 칸 안 인라인 서식). 표는 이 읽기 전용 경로에서만 읽힌다 — 편집 화면은 표를 글자로 둔다(markdown.ts).
 * ```mermaid 코드 블록은 도식(MermaidDiagram)으로 그린다 — 있을 때만 mermaid 를 동적으로 불러오고, 그리기에 실패하면 코드 블록으로 남는다.
 * 편집 화면(MarkdownEditor 의 tiptap)은 이 부품이 아니라 코드 블록 그대로다. 끄려면 `mermaid={false}`.
 */
import { Fragment, useMemo, type ReactNode, type SyntheticEvent } from "react";
import type { JSONContent } from "@tiptap/react";

import { parseMarkdownView } from "./markdown";
import { splitMermaidBlocks } from "./mermaid-blocks";
import { MermaidDiagram } from "./MermaidDiagram";
import { isSafeHref } from "./md-ops";
import { MarkdownEditorStyle } from "./styles";

export interface MarkdownViewProps {
  /** 글(마크다운 문자열). */
  value: string;
  /** 뿌리에 더할 클래스(`cm-md-view` 는 늘 붙는다). */
  className?: string;
  /** 링크(a)에 더할 클래스(예: React Flow 노드 안이면 "nodrag nopan" — 링크를 눌러도 노드가 끌리지 않게). */
  linkClassName?: string;
  /** 뿌리 data-testid(기본 "md-view"). */
  testId?: string;
  /** ```mermaid 블록을 도식으로 그린다(기본 true). */
  mermaid?: boolean;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

function renderText(node: JSONContent, key: number, linkClass: string | undefined): ReactNode {
  let out: ReactNode = node.text ?? "";
  const marks = node.marks ?? [];
  // 안쪽부터 감싼다: 코드 → 굵게 → 기울임 → 취소선 → 링크(바깥).
  const has = (t: string) => marks.find((m) => m.type === t);
  if (has("code")) out = <code>{out}</code>;
  if (has("bold")) out = <strong>{out}</strong>;
  if (has("italic")) out = <em>{out}</em>;
  if (has("strike")) out = <s>{out}</s>;
  const link = has("link");
  if (link) {
    const href = String(link.attrs?.href ?? "").trim();
    out = isSafeHref(href) ? (
      <a
        className={linkClass}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onPointerDown={stop}
        onMouseDown={stop}
        onClick={stop}
        onDoubleClick={stop}
      >
        {out}
      </a>
    ) : (
      <span>{out}</span>
    );
  }
  return <span key={key}>{out}</span>;
}

function renderChildren(node: JSONContent, linkClass: string | undefined): ReactNode[] {
  return (node.content ?? []).map((c, i) => renderNode(c, i, linkClass));
}

function renderNode(node: JSONContent, key: number, linkClass: string | undefined): ReactNode {
  const kids = () => renderChildren(node, linkClass);
  switch (node.type) {
    case "text":
      return renderText(node, key, linkClass);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph": {
      const inner = kids();
      // 빈 문단 = 빈 줄 하나(markdown.ts 빈 줄 규칙) — 위 간격 없이 한 줄 높이로 그린다(styles.tsx).
      return inner.length ? (
        <p key={key}>{inner}</p>
      ) : (
        <p key={key} className="cm-md-blank">
          <br />
        </p>
      );
    }
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const Tag = `h${level}` as "h1";
      return <Tag key={key}>{kids()}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{kids()}</ul>;
    case "orderedList": {
      const start = Number(node.attrs?.start ?? 1);
      return (
        <ol key={key} start={start !== 1 ? start : undefined}>
          {kids()}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{kids()}</li>;
    case "taskList":
      return (
        <ul key={key} data-type="taskList">
          {kids()}
        </ul>
      );
    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li key={key} data-checked={checked ? "true" : "false"}>
          <label contentEditable={false}>
            <input
              type="checkbox"
              checked={checked}
              disabled
              readOnly
              aria-label={checked ? "끝난 일" : "할 일"}
            />
          </label>
          <div>{kids()}</div>
        </li>
      );
    }
    case "blockquote":
      return <blockquote key={key}>{kids()}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "table": {
      // 머리글 행(tableHeader 로만 된 첫 행)은 thead, 나머지는 tbody. 넘치면 감싸는 틀 안에서 가로로 스크롤한다(styles.tsx .cm-md-table).
      const rows = node.content ?? [];
      const isHead = (r: JSONContent | undefined) =>
        !!r?.content?.length && r.content.every((c) => c.type === "tableHeader");
      const head = isHead(rows[0]) ? rows[0] : undefined;
      const body = head ? rows.slice(1) : rows;
      return (
        <div key={key} className="cm-md-table">
          <table>
            {head ? <thead>{renderNode(head, 0, linkClass)}</thead> : null}
            {body.length ? <tbody>{body.map((r, i) => renderNode(r, i, linkClass))}</tbody> : null}
          </table>
        </div>
      );
    }
    case "tableRow":
      return <tr key={key}>{kids()}</tr>;
    case "tableHeader":
    case "tableCell": {
      const align = node.attrs?.align;
      const style = align === "left" || align === "center" || align === "right" ? { textAlign: align } : undefined;
      return node.type === "tableHeader" ? (
        <th key={key} scope="col" style={style}>
          {kids()}
        </th>
      ) : (
        <td key={key} style={style}>
          {kids()}
        </td>
      );
    }
    default:
      // 모르는 종류 — 안쪽이 있으면 안쪽을, 글자면 글자를 그린다(내용을 잃지 않는다).
      if (node.content) return <span key={key}>{kids()}</span>;
      return node.text ? <span key={key}>{node.text}</span> : null;
  }
}

export function MarkdownView({
  value,
  className,
  linkClassName,
  testId = "md-view",
  mermaid = true,
}: MarkdownViewProps) {
  // mermaid 블록이 없으면 조각 하나(전체)라 기존 그리기와 같다.
  const pieces = useMemo(() => {
    const text = value ?? "";
    const split = mermaid ? splitMermaidBlocks(text) : [];
    if (!split.some((p) => p.kind === "mermaid")) return [{ kind: "md" as const, text }];
    return split;
  }, [value, mermaid]);
  const docs = useMemo(() => pieces.map((p) => (p.kind === "md" ? parseMarkdownView(p.text) : null)), [pieces]);
  return (
    <div className={className ? `cm-md-view ${className}` : "cm-md-view"} data-testid={testId}>
      <MarkdownEditorStyle />
      {pieces.map((p, i) =>
        p.kind === "mermaid" ? (
          <MermaidDiagram key={i} code={p.code} testId={`${testId}-mermaid-${i}`} />
        ) : (
          <Fragment key={i}>{renderChildren(docs[i]!, linkClassName)}</Fragment>
        )
      )}
    </div>
  );
}
