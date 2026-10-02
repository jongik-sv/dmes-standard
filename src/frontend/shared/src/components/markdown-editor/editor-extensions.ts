/**
 * 서식 편집기에만 더하는 확장 — 마크다운 변환(markdown.ts)에는 영향이 없다.
 * - `[글](https://…)` 를 치면(닫는 `)` 에서) 링크로 바꾼다. http/https 가 아니면 그대로 글자다.
 * - Ctrl/Cmd+Z: 입력 규칙이 막 바꾼 직후면 기호 상태로 돌린다(undoInputRule). 아니면 보통 되돌리기로 넘긴다.
 *   되돌리기 기록은 입력을 묶어 두므로 그냥 undo 하면 친 `## ` 까지 함께 사라진다.
 */
import { Extension, InputRule } from "@tiptap/react";

import { isSafeHref } from "./md-ops";

const LINK_RULE = /\[([^[\]\n]+)\]\(([^()\s]+)\)$/;

export const MarkdownEditorKeys = Extension.create({
  name: "markdownEditorKeys",
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      "Mod-z": () => this.editor.commands.undoInputRule(),
    };
  },
  addInputRules() {
    const linkType = this.editor.schema.marks.link;
    if (!linkType) return [];
    return [
      new InputRule({
        find: LINK_RULE,
        handler: ({ state, range, match }) => {
          const text = match[1];
          const href = (match[2] ?? "").trim();
          if (!text || !isSafeHref(href)) return null;
          const { tr } = state;
          tr.insertText(text, range.from, range.to);
          tr.addMark(range.from, range.from + text.length, linkType.create({ href }));
          tr.removeStoredMark(linkType);
        },
      }),
    ];
  },
});
