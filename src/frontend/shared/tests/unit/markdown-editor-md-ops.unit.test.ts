// 마크다운 편집기(shared markdown-editor) MD 모드 원문 편집 — 도구 막대 단추가 마크다운 원문에 기호를 넣고 빼는 순수 함수(applyMdCommand),
// 눌린 단추 표시(activeMdCommands), 링크 주소 검사(isSafeHref).
// 표기: ⟨ ⟩ 는 고른 범위, | 는 커서(빈 선택). sel() 로 MdEdit 을 만들고 show() 로 다시 같은 표기로 찍는다.
import { describe, expect, it } from "vitest";

import {
  activeMdCommands,
  applyMdCommand,
  isSafeHref,
  type MdCommand,
  type MdEdit,
} from "../../src/components/markdown-editor/md-ops";

function sel(marked: string): MdEdit {
  const caret = marked.indexOf("|");
  if (caret >= 0) {
    const text = marked.slice(0, caret) + marked.slice(caret + 1);
    return { text, selStart: caret, selEnd: caret };
  }
  const s = marked.indexOf("⟨");
  const e = marked.indexOf("⟩");
  if (s < 0 || e < s) throw new Error(`표기 오류: ${marked}`);
  const text = marked.slice(0, s) + marked.slice(s + 1, e) + marked.slice(e + 1);
  return { text, selStart: s, selEnd: e - 1 };
}

function show(edit: MdEdit): string {
  const { text, selStart, selEnd } = edit;
  if (selStart === selEnd) return text.slice(0, selStart) + "|" + text.slice(selStart);
  return text.slice(0, selStart) + "⟨" + text.slice(selStart, selEnd) + "⟩" + text.slice(selEnd);
}

const run = (marked: string, cmd: MdCommand) => show(applyMdCommand(sel(marked), cmd));
const active = (marked: string) => [...activeMdCommands(sel(marked))].sort();

describe("줄 단위 — 제목 h1·h2·h3", () => {
  it("넣는다 — 커서는 같은 글자 앞에 머문다", () => {
    expect(run("|abc", "h1")).toBe("# |abc");
    expect(run("ab|c", "h2")).toBe("## ab|c");
    expect(run("⟨abc⟩", "h3")).toBe("### ⟨abc⟩");
  });
  it("같은 제목이면 뺀다", () => {
    expect(run("## ab|c", "h2")).toBe("ab|c");
    expect(run("# ⟨abc⟩", "h1")).toBe("⟨abc⟩");
  });
  it("다른 제목·목록 기호는 바꾼다", () => {
    expect(run("## a|bc", "h1")).toBe("# a|bc");
    expect(run("# a|bc", "h3")).toBe("### a|bc");
    expect(run("- a|bc", "h2")).toBe("## a|bc");
    expect(run("1. a|bc", "h1")).toBe("# a|bc");
  });
  it("기호 안에 있던 커서는 새 기호 뒤 글 첫머리로 간다", () => {
    expect(run("#|# abc", "h1")).toBe("# |abc");
    expect(run("|## abc", "h2")).toBe("|abc");
  });
  it("띄어쓰기 없는 # 은 제목이 아니다 — 앞에 기호를 더한다", () => {
    expect(run("#태|그", "h1")).toBe("# #태|그");
  });
  it("앞쪽 다른 줄은 그대로, 커서가 있는 줄만 바꾼다", () => {
    expect(run("first\nse|cond\nthird", "h2")).toBe("first\n## se|cond\nthird");
  });
});

describe("줄 단위 — 목록·인용·문단", () => {
  it("글머리 목록을 넣고 뺀다, * 글머리도 같은 것으로 본다", () => {
    expect(run("a|bc", "bulletList")).toBe("- a|bc");
    expect(run("- a|bc", "bulletList")).toBe("a|bc");
    expect(run("* a|bc", "bulletList")).toBe("a|bc");
  });
  it("번호 목록을 넣고 빼며, 다른 목록은 번호로 바꾼다", () => {
    expect(run("a|bc", "orderedList")).toBe("1. a|bc");
    expect(run("3. a|bc", "orderedList")).toBe("a|bc");
    expect(run("- a|bc", "orderedList")).toBe("1. a|bc");
  });
  it("할 일 목록은 - [ ] 이고, 빈·체크 모두 끌 수 있다", () => {
    expect(run("a|bc", "taskList")).toBe("- [ ] a|bc");
    expect(run("- [ ] a|bc", "taskList")).toBe("a|bc");
    expect(run("- [x] a|bc", "taskList")).toBe("a|bc");
    expect(run("- [x] a|bc", "bulletList")).toBe("- a|bc");
    expect(run("- a|bc", "taskList")).toBe("- [ ] a|bc");
  });
  it("인용은 다른 기호와 겹쳐 둔다 — 목록을 지우지 않는다", () => {
    expect(run("a|bc", "blockquote")).toBe("> a|bc");
    expect(run("> a|bc", "blockquote")).toBe("a|bc");
    expect(run("- a|bc", "blockquote")).toBe("> - a|bc");
    expect(run("> - a|bc", "blockquote")).toBe("- a|bc");
    expect(run("> a|bc", "h2")).toBe("> ## a|bc");
  });
  it("문단은 줄 앞 기호를 모두 뺀다", () => {
    expect(run("## a|bc", "paragraph")).toBe("a|bc");
    expect(run("> - [x] a|bc", "paragraph")).toBe("a|bc");
    expect(run("a|bc", "paragraph")).toBe("a|bc");
  });
  it("들여쓰기는 남긴다", () => {
    expect(run("  a|bc", "bulletList")).toBe("  - a|bc");
    expect(run("  - a|bc", "orderedList")).toBe("  1. a|bc");
  });
  it("빈 줄에 커서만 있으면 기호를 넣는다", () => {
    expect(run("|", "bulletList")).toBe("- |");
    expect(run("a\n|", "h1")).toBe("a\n# |");
  });
});

describe("줄 단위 — 여러 줄", () => {
  it("선택이 걸친 모든 줄에 넣는다", () => {
    expect(run("a⟨a\nbb\ncc⟩c", "bulletList")).toBe("- a⟨a\n- bb\n- cc⟩c");
  });
  it("번호 목록은 1. 2. 3. 순번을 매긴다", () => {
    expect(run("⟨a\nb\nc⟩", "orderedList")).toBe("1. ⟨a\n2. b\n3. c⟩");
    // 첫 줄 첫머리에서 시작한 선택은 바뀐 기호까지 그대로 감싼다
    expect(run("⟨5. a\n- b\nc⟩", "orderedList")).toBe("⟨1. a\n2. b\n3. c⟩");
  });
  it("모든 줄에 이미 켜져 있으면 모두 끈다", () => {
    expect(run("⟨- a\n- b⟩", "bulletList")).toBe("⟨a\nb⟩");
    expect(run("⟨1. a\n2. b⟩", "orderedList")).toBe("⟨a\nb⟩");
  });
  it("일부 줄만 켜져 있으면 모두 켠다", () => {
    expect(run("⟨- a\nb⟩", "bulletList")).toBe("⟨- a\n- b⟩");
    expect(run("⟨## a\nb⟩", "h2")).toBe("⟨## a\n## b⟩");
    expect(run("- ⟨a\nb⟩", "bulletList")).toBe("- ⟨a\n- b⟩");
  });
  it("여러 줄 사이 빈 줄은 건너뛰고 번호도 세지 않는다", () => {
    expect(run("⟨a\n\nb⟩", "orderedList")).toBe("1. ⟨a\n\n2. b⟩");
    expect(run("⟨- a\n\n- b⟩", "bulletList")).toBe("⟨a\n\nb⟩");
  });
  it("선택 끝이 다음 줄 첫머리면 그 줄은 넣지 않는다", () => {
    expect(run("⟨a\n⟩b", "h1")).toBe("# ⟨a\n⟩b");
  });
  it("선택 밖 줄은 그대로 둔다", () => {
    expect(run("x\n⟨a\nb⟩\ny", "blockquote")).toBe("x\n> ⟨a\n> b⟩\ny");
  });
  it("문단은 여러 줄의 기호를 모두 뺀다", () => {
    expect(run("⟨# a\n- b\n> c⟩", "paragraph")).toBe("⟨a\nb\nc⟩");
  });
});

describe("글 단위 — 굵게·기울임·취소선", () => {
  it("고른 글 양쪽에 기호를 넣는다 — 선택은 같은 글을 가리킨다", () => {
    expect(run("a ⟨bc⟩ d", "bold")).toBe("a **⟨bc⟩** d");
    expect(run("a ⟨bc⟩ d", "italic")).toBe("a *⟨bc⟩* d");
    expect(run("a ⟨bc⟩ d", "strike")).toBe("a ~~⟨bc⟩~~ d");
  });
  it("양쪽 바깥에 기호가 있으면 뺀다", () => {
    expect(run("a **⟨bc⟩** d", "bold")).toBe("a ⟨bc⟩ d");
    expect(run("a *⟨bc⟩* d", "italic")).toBe("a ⟨bc⟩ d");
    expect(run("a ~~⟨bc⟩~~ d", "strike")).toBe("a ⟨bc⟩ d");
  });
  it("기호까지 고른 경우에도 뺀다", () => {
    expect(run("a ⟨**bc**⟩ d", "bold")).toBe("a ⟨bc⟩ d");
    expect(run("a ⟨~~bc~~⟩ d", "strike")).toBe("a ⟨bc⟩ d");
    expect(run("a ⟨*bc*⟩ d", "italic")).toBe("a ⟨bc⟩ d");
  });
  it("굵게와 기울임은 별 개수로 겹친다", () => {
    expect(run("**⟨bc⟩**", "italic")).toBe("***⟨bc⟩***");
    expect(run("*⟨bc⟩*", "bold")).toBe("***⟨bc⟩***");
    expect(run("***⟨bc⟩***", "italic")).toBe("**⟨bc⟩**");
    expect(run("***⟨bc⟩***", "bold")).toBe("*⟨bc⟩*");
    expect(run("**⟨bc⟩**", "strike")).toBe("**~~⟨bc⟩~~**");
  });
  it("빈 선택이면 기호 쌍을 넣고 커서를 가운데에 둔다", () => {
    expect(run("a |b", "bold")).toBe("a **|**b");
    expect(run("|", "italic")).toBe("*|*");
    expect(run("|", "strike")).toBe("~~|~~");
  });
  it("빈 기호 쌍 가운데 커서면 쌍을 지운다", () => {
    expect(run("a **|**b", "bold")).toBe("a |b");
    expect(run("~~|~~", "strike")).toBe("|");
  });
  it("양 끝 띄어쓰기는 기호 밖에 둔다", () => {
    expect(run("a⟨ bc ⟩d", "bold")).toBe("a⟨ **bc** ⟩d");
  });
  it("줄 앞 기호(목록·제목·인용)는 감싸지 않는다 — 줄 전체를 골라도 블록이 깨지지 않는다", () => {
    expect(run("⟨- ab\n- cd⟩", "bold")).toBe("⟨- **ab**\n- **cd⟩**");
    expect(run("⟨## Title⟩", "bold")).toBe("⟨## **Title⟩**");
    expect(run("⟨> - [ ] ab⟩", "strike")).toBe("⟨> - [ ] ~~ab⟩~~");
    expect(run("⟨* *ab*⟩", "italic")).toBe("⟨* ab⟩");
    expect(run("⟨- **ab**\n- **cd**⟩", "bold")).toBe("⟨- ab\n- cd⟩");
  });
  it("여러 줄을 고르면 줄마다 따로 감싼다", () => {
    expect(run("⟨ab\ncd⟩", "bold")).toBe("**⟨ab**\n**cd⟩**");
    expect(run("⟨**ab**\n**cd**⟩", "bold")).toBe("⟨ab\ncd⟩");
  });
});

describe("링크", () => {
  const link = (href: string): MdCommand => ({ type: "link", href });
  it("고른 글이 있으면 [글](주소) — 선택은 글을 가리킨다", () => {
    expect(run("see ⟨docs⟩ now", link("https://ex.com/a"))).toBe(
      "see [⟨docs⟩](https://ex.com/a) now"
    );
  });
  it("고른 글이 없으면 [주소](주소) 를 넣고 커서는 그 뒤", () => {
    expect(run("go |", link("http://ex.com"))).toBe("go [http://ex.com](http://ex.com)|");
  });
  it("주소 앞뒤 공백은 지우고, 안쪽 공백·괄호는 부호화한다", () => {
    expect(run("⟨x⟩", link("  https://ex.com/a b(1)  "))).toBe(
      "[⟨x⟩](https://ex.com/a%20b%281%29)"
    );
  });
  it("한 줄 선택의 줄 앞 기호는 링크 글에서 뺀다", () => {
    expect(run("⟨- item⟩", link("https://ex.com"))).toBe("- [⟨item⟩](https://ex.com)");
  });
  it("위험한 주소는 글을 바꾸지 않는다", () => {
    for (const href of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,x",
      "/relative",
      "",
      "ftp://ex.com",
    ]) {
      expect(run("⟨x⟩", link(href))).toBe("⟨x⟩");
    }
  });
});

describe("isSafeHref", () => {
  it("http·https 만 참", () => {
    expect(isSafeHref("https://ex.com")).toBe(true);
    expect(isSafeHref("http://ex.com/a?b=1#c")).toBe(true);
    expect(isSafeHref("  HTTPS://EX.COM  ")).toBe(true);
  });
  it("javascript·data·상대 경로·빈 값·다른 프로토콜은 거짓", () => {
    for (const href of [
      "javascript:alert(1)",
      " javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,x",
      "vbscript:x",
      "mailto:a@b.c",
      "ftp://ex.com",
      "/a",
      "ex.com",
      "",
      "   ",
    ]) {
      expect(isSafeHref(href), href).toBe(false);
    }
  });
});

describe("activeMdCommands — 커서 위치에서 켜진 명령", () => {
  it("줄 앞 기호가 없으면 문단", () => {
    expect(active("ab|c")).toEqual(["paragraph"]);
  });
  it("제목·목록·할 일", () => {
    expect(active("## ab|c")).toEqual(["h2"]);
    expect(active("# |")).toEqual(["h1"]);
    expect(active("- ab|c")).toEqual(["bulletList"]);
    expect(active("12. ab|c")).toEqual(["orderedList"]);
    expect(active("- [x] ab|c")).toEqual(["taskList"]);
    expect(active("#태|그")).toEqual(["paragraph"]);
  });
  it("인용은 다른 기호와 같이 켜진다", () => {
    expect(active("> ab|c")).toEqual(["blockquote"]);
    expect(active("> - ab|c")).toEqual(["blockquote", "bulletList"]);
  });
  it("여러 줄은 모든 줄에 켜진 것만 (빈 줄 무시)", () => {
    expect(active("⟨- a\n\n- b⟩")).toEqual(["bulletList"]);
    expect(active("⟨- a\nb⟩")).toEqual([]);
    expect(active("⟨a\nb⟩")).toEqual(["paragraph"]);
  });
  it("커서가 굵게·기울임·취소선 안에 있으면 켜진다", () => {
    expect(active("a **b|c** d")).toEqual(["bold", "paragraph"]);
    expect(active("a *b|c* d")).toEqual(["italic", "paragraph"]);
    expect(active("a ***b|c*** d")).toEqual(["bold", "italic", "paragraph"]);
    expect(active("a ~~b|c~~ d")).toEqual(["paragraph", "strike"]);
    expect(active("a **bc** |d")).toEqual(["paragraph"]);
    expect(active("2 * 3 * |4")).toEqual(["paragraph"]);
  });
  it("고른 글은 단추를 누르면 빠지는 경우에만 켜진다 — applyMdCommand 와 같은 기준", () => {
    expect(active("a **⟨bc⟩** d")).toEqual(["bold", "paragraph"]);
    expect(active("a ⟨**bc**⟩ d")).toEqual(["bold", "paragraph"]);
    expect(active("***⟨bc⟩***")).toEqual(["bold", "italic", "paragraph"]);
    expect(active("a ⟨bc⟩ d")).toEqual(["paragraph"]);
    expect(active("⟨- **ab**\n- **cd**⟩")).toEqual(["bold", "bulletList"]);
    expect(active("⟨* *ab*⟩")).toEqual(["bulletList", "italic"]);
  });
});

describe("검토 고침 — 커서가 서식 안이면 눌린 단추를 누를 때 그 서식이 빠진다", () => {
  it("굵게·기울임·취소선 안 커서 → 감싼 기호를 뺀다(빈 쌍을 넣지 않는다)", () => {
    expect(run("**a|b**", "bold")).toBe("a|b");
    expect(run("x **b|c** d", "bold")).toBe("x b|c d");
    expect(run("*a|b*", "italic")).toBe("a|b");
    expect(run("~~a|b~~", "strike")).toBe("a|b");
    expect(run("**a ~~b|c~~ d**", "strike")).toBe("**a b|c d**");
  });
  it("굵게+기울임(***) 에서 한쪽만 뺀다", () => {
    expect(run("***a|b***", "bold")).toBe("*a|b*");
    expect(run("***a|b***", "italic")).toBe("**a|b**");
  });
  it("서식 글 첫머리·끝 경계의 커서도 같다", () => {
    expect(run("**|ab**", "bold")).toBe("|ab");
    expect(run("**ab|**", "bold")).toBe("ab|");
  });
  it("눌린 상태(activeMdCommands)와 누른 결과가 맞다 — 켜져 보이면 빠지고, 꺼져 보이면 쌍을 넣는다", () => {
    for (const [src, cmd] of [
      ["**a|b** c", "bold"],
      ["*a|b*", "italic"],
      ["~~a|b~~", "strike"],
      ["a|b", "bold"],
    ] as const) {
      const on = active(src).includes(cmd);
      const out = run(src, cmd);
      if (on) expect(out.replace("|", "")).not.toContain(cmd === "strike" ? "~~" : "*");
      else expect(out).toContain(cmd === "strike" ? "~~|~~" : "**|**");
    }
  });
});

describe("검토 고침 — 링크 글 안의 [ ] \\ 는 지킨다", () => {
  const link = { type: "link", href: "https://x.com" } as const;
  it("고른 글 안의 ] ( 가 링크 구조를 깨지 않는다", () => {
    expect(
      applyMdCommand({ text: "a](javascript:alert(1)) [b", selStart: 0, selEnd: 26 }, link).text
    ).toBe("[a\\](javascript:alert(1)) \\[b](https://x.com)");
  });
  it("이미 지킨 기호(\\[ · \\*)는 그대로, 끝의 홀수 \\ 는 하나 더해 닫는 ] 를 지킨다", () => {
    expect(applyMdCommand({ text: "\\[a\\*", selStart: 0, selEnd: 5 }, link).text).toBe(
      "[\\[a\\*](https://x.com)"
    );
    expect(applyMdCommand({ text: "a\\", selStart: 0, selEnd: 2 }, link).text).toBe(
      "[a\\\\](https://x.com)"
    );
    expect(applyMdCommand({ text: "a\\\\", selStart: 0, selEnd: 3 }, link).text).toBe(
      "[a\\\\](https://x.com)"
    );
  });
});
