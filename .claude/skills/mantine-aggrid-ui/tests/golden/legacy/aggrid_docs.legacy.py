#!/usr/bin/env python3
"""ag-grid-community 버전 맞춤 문서 조회 + 사용법 점검 도구.

ag-grid.com 의 llms.txt · `.md` 는 **최신 메이저**만 제공한다. 설치 버전 문서는
`/archive/{x.y.z}/{framework}-data-grid/{slug}/` HTML 로만 열리므로 텍스트로 바꿔 캐시한다.
슬러그 색인과 권장사항은 공식 스킬 ag-grid/skills(ag-dev) 의 references 를 쓴다.

  python3 aggrid_docs.py version                    # 설치된 ag-grid-community / react 버전
  python3 aggrid_docs.py search <단어...>            # 공식 슬러그 색인 검색
  python3 aggrid_docs.py get <slug> [--section 제목] [--version x.y.z] [--latest]
  python3 aggrid_docs.py types <이름>                # 설치 .d.ts 에서 옵션·인터페이스 정의 찾기
  python3 aggrid_docs.py recommendations            # 공식 ag-dev 권장사항(LLM 흔한 실수)
  python3 aggrid_docs.py audit <경로...>             # deprecated 옵션·금지 import 점검 + 화면 성능 정적 점검(P-*)
  python3 aggrid_docs.py refresh                    # 캐시 비우기
"""
from __future__ import annotations

import argparse
import functools
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SITE = "https://www.ag-grid.com"
AGDEV_RAW = "https://raw.githubusercontent.com/ag-grid/skills/HEAD/skills/ag-dev/references/grid"
CACHE = Path(os.environ.get("AGGRID_DOCS_CACHE", Path.home() / ".cache" / "aggrid-docs"))
TTL_SECONDS = 7 * 24 * 3600
# ag-grid.com 은 기본 urllib UA 를 403 으로 막는다
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/128 Safari/537.36"


def fetch(url: str, dest: Path, ttl: int = TTL_SECONDS) -> str | None:
    """성공하면 본문, 404 면 None. 네트워크 오류는 오래된 캐시로 대체한다."""
    if dest.exists() and time.time() - dest.stat().st_mtime < ttl:
        return dest.read_text(encoding="utf-8")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as res:
            body = res.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        if dest.exists():
            return dest.read_text(encoding="utf-8")
        sys.exit(f"[error] {url} 조회 실패: HTTP {exc.code}")
    except Exception as exc:
        if dest.exists():
            print(f"[warn] {url} 조회 실패({exc}) — 오래된 캐시 사용", file=sys.stderr)
            return dest.read_text(encoding="utf-8")
        sys.exit(f"[error] {url} 조회 실패: {exc}")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(body, encoding="utf-8")
    return body


def find_package(name: str) -> Path | None:
    """cwd 에서 위로 올라가며 node_modules/<name> 을 찾고, 없으면 pnpm 저장소(.pnpm)를 본다."""
    here = Path.cwd().resolve()
    bases = [b for a in [here, *here.parents] for b in (a, a / "src" / "frontend")]
    for base in bases:
        direct = base / "node_modules" / name / "package.json"
        if direct.exists():
            return direct.parent
        pnpm = base / "node_modules" / ".pnpm"
        if pnpm.is_dir():
            hits = sorted(pnpm.glob(f"{name}@*/node_modules/{name}/package.json"))
            if hits:
                return hits[-1].parent
    return None


def installed_version() -> str:
    pkg = find_package("ag-grid-community")
    if not pkg:
        sys.exit("[error] ag-grid-community 설치본을 찾지 못했다. src/frontend 안에서 실행하거나 --version 을 준다.")
    return json.loads((pkg / "package.json").read_text())["version"]


def cmd_version(_: argparse.Namespace) -> None:
    for name in ("ag-grid-community", "ag-grid-react", "ag-grid-enterprise"):
        pkg = find_package(name)
        print(f"{name}: {json.loads((pkg / 'package.json').read_text())['version'] if pkg else '(없음)'}"
              + (f"  [{pkg}]" if pkg else ""))


def load_index() -> list[tuple[str, str]]:
    """ag-dev documentation-index.md 의 `- 설명 `slug`` 줄을 (slug, 설명) 으로 읽는다."""
    text = fetch(f"{AGDEV_RAW}/documentation-index.md", CACHE / "agdev" / "documentation-index.md") or ""
    rows = []
    for line in text.splitlines():
        m = re.match(r"^\s*-\s*(.*?)`([a-z0-9-]+)`\s*$", line)
        if m:
            rows.append((m[2], m[1].strip()))
    return rows


def cmd_search(args: argparse.Namespace) -> None:
    terms = [t.lower() for t in args.terms]
    scored = []
    for slug, desc in load_index():
        hay = f"{slug} {desc}".lower()
        score = sum(t in hay for t in terms)
        if score:
            scored.append((-score, slug, desc))
    for neg, slug, desc in sorted(scored)[: args.limit]:
        mark = "" if -neg == len(terms) else f"  ({-neg}/{len(terms)} 단어)"
        print(f"{slug:<40} {desc}{mark}")
    if not scored:
        print("일치 없음. 단어를 바꾸거나 `types` 로 설치 타입에서 찾는다.")


def enterprise_flag(slug: str, fw: str) -> str:
    """최신 .md 머리말의 enterprise 표시. 기능의 Enterprise 여부는 버전이 바뀌어도 거의 유지된다."""
    md = fetch(f"{SITE}/{fw}-data-grid/{slug}.md", CACHE / "latest" / fw / f"{slug}.md")
    if md is None:
        return "Enterprise: 판별 불가(최신 문서에 없음)"
    head = md.split("\n---", 1)[0] if md.startswith("---") else ""
    return "Enterprise: **예** — DMES 사용 불가(ADR-0001)" if re.search(r"^enterprise:\s*true", head, re.M) \
        else "Enterprise: 아니오(community)"


def html_to_text(page: str) -> str:
    m = re.search(r"<main.*?</main>", page, re.S)
    s = m.group(0) if m else page
    s = re.sub(r"<(script|style|svg|nav|button)[^>]*>.*?</\1>", "", s, flags=re.S)
    s = re.sub(r"<pre[^>]*>", "\n```\n", s).replace("</pre>", "\n```\n")
    s = re.sub(r"<h([1-6])[^>]*>", lambda h: "\n" + "#" * int(h[1]) + " ", s)
    s = re.sub(r"<code[^>]*>", "`", s).replace("</code>", "`")
    s = re.sub(r"<br\s*/?>|</p>|</li>|</h[1-6]>|</tr>|</div>", "\n", s)
    s = re.sub(r"<li[^>]*>", "- ", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace("Copy Link", "")
    # <pre> 안의 `code` 표시는 되돌린다
    s = re.sub(r"```\n`(.*?)`\n```", lambda c: f"```\n{c[1]}\n```", s, flags=re.S)
    s = re.sub(r"\n\s*\n+", "\n\n", s).strip()
    h1 = re.search(r"^# ", s, re.M)
    return s[h1.start():] if h1 else s


def cmd_get(args: argparse.Namespace) -> None:
    fw = args.framework
    if args.latest:
        text = fetch(f"{SITE}/{fw}-data-grid/{args.slug}.md", CACHE / "latest" / fw / f"{args.slug}.md")
        if text is None:
            sys.exit(f"[error] 최신 문서에도 '{args.slug}' 가 없다. `search` 로 slug 를 확인한다.")
        label = "최신(llms .md)"
    else:
        ver = args.version or installed_version()
        cache = CACHE / "archive" / ver / fw / f"{args.slug}.txt"
        if cache.exists():
            text = cache.read_text(encoding="utf-8")
        else:
            page = fetch(f"{SITE}/archive/{ver}/{fw}-data-grid/{args.slug}/", CACHE / "raw.html", ttl=0)
            if page is None:
                sys.exit(f"[error] {ver} 문서에 '{args.slug}' 가 없다. 이 버전에 없는 기능일 가능성이 크다.\n"
                         f"        `get {args.slug} --latest` 로 도입 버전을 확인하되, 설치 버전 API 로만 구현한다.")
            text = html_to_text(page)
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(text, encoding="utf-8")
        label = f"archive {ver}"
    print(f"<!-- source: {label} / {fw} / {args.slug} | {enterprise_flag(args.slug, fw)} -->")
    if not args.section:
        print(text)
        return
    out, depth = [], None
    for line in text.splitlines():
        h = re.match(r"^(#{1,6})\s+(.*)", line)
        if h and depth is not None and len(h[1]) <= depth:
            depth = None
        if h and depth is None and args.section.lower() in h[2].lower():
            depth = len(h[1])
        if depth is not None:
            out.append(line)
    print("\n".join(out) if out else f"'{args.section}' 제목 없음. 제목 목록:\n"
          + "\n".join(l for l in text.splitlines() if l.startswith("#")))


def types_dir() -> Path:
    pkg = find_package("ag-grid-community")
    if not pkg:
        sys.exit("[error] ag-grid-community 설치본을 찾지 못했다.")
    return pkg / "dist" / "types" / "src"


def cmd_types(args: argparse.Namespace) -> None:
    """옵션·인터페이스 이름으로 .d.ts 정의와 바로 위 JSDoc 을 보여 준다."""
    pat = re.compile(rf"^\s*(?:export\s+)?(?:declare\s+)?(?:interface|type|class|const|function|abstract\s+class)?\s*{re.escape(args.name)}\b\??\s*[:<={{(]")
    shown = 0
    for f in sorted(types_dir().rglob("*.d.ts")):
        lines = f.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            if pat.match(line):
                start = i
                while start > 0 and re.match(r"^\s*(\*|/\*\*)", lines[start - 1]):
                    start -= 1
                print(f"--- {f.relative_to(types_dir())}:{i + 1}")
                print("\n".join(lines[start: i + args.after + 1]))
                shown += 1
                if shown >= args.limit:
                    return
    if not shown:
        print(f"'{args.name}' 정의 없음 — 이 버전에 없는 API 일 수 있다.")


def cmd_recommendations(_: argparse.Namespace) -> None:
    print(fetch(f"{AGDEV_RAW}/recommendations.md", CACHE / "agdev" / "recommendations.md"))


def deprecated_props() -> dict[str, str]:
    """설치 버전 GridOptions·ColDef 의 @deprecated 속성 → 안내문."""
    out: dict[str, str] = {}
    for name in ("entities/gridOptions.d.ts", "entities/colDef.d.ts"):
        f = types_dir() / name
        if not f.exists():
            continue
        note = None  # 직전 JSDoc 블록의 @deprecated 문구
        for line in f.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("/**"):
                note = None
            d = re.search(r"@deprecated\s+(.*)", line)
            if d:
                note = d[1].replace("*/", "").strip()
                continue
            p = re.match(r"^\s*([a-zA-Z]+)\??\s*:", line)
            if p:
                if note:
                    out[p[1]] = note
                note = None
    return out


FIXED_RULES: list[tuple[str, str]] = [
    (r"from ['\"]ag-grid-enterprise['\"]|['\"]ag-grid-enterprise['\"]\s*:", "ag-grid-enterprise 금지 (DMES ADR-0001: community/MIT 만)"),
    (r"from ['\"]@ag-grid-(?:community|enterprise)/", "@ag-grid-community/* 스코프 패키지는 v32 에서 끊김 → ag-grid-community 단일 패키지"),
    (r"ag-grid-community/styles/ag-grid\.css|ag-theme-\w+\.css['\"]", "레거시 CSS 테마 import → v33 Theming API(DMES 는 grid.css 의 --ag-* 변수)"),
    (r"\bcolumnApi\b|\bgridOptions\.api\b|new Grid\(", "v31 이전 API(columnApi/new Grid) → GridApi · createGrid"),
    (r"rowSelection=\{?['\"](?:single|multiple)['\"]", "rowSelection 문자열은 v32.2 deprecated → { mode: 'singleRow'|'multiRow' }"),
]
SCREEN_IMPORT = re.compile(r"from ['\"](?:ag-grid-react|ag-grid-community)['\"]")
# 데이터 목록은 공용 AgDataGrid 하나로 그린다(Part B §6). 머리행(<thead>)이 있는 원시 표는 데이터 목록이다.
# 라벨-값 폼 배치 표는 <thead> 가 없어 걸리지 않는다.
SCREEN_TABLE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"<thead\b"), "화면에서 원시 <table> 데이터 목록 금지 → AgDataGrid (작은 목록은 height=\"auto\", Part B §6)"),
]


# ── 화면 성능 정적 점검 (docs/guide/FrontEnd/Screen-Performance-Guide.md) ─────────────────────────────
# 정규식·괄호 짝 수준의 점검이다. 확실히 잡히는 것만 오류(종료 코드 1)로 두고, 화면 설계에 따라 정상일 수 있는 것은
# 경고(종료 코드 영향 없음)로 둔다. 메시지 앞의 [P-…] 코드로 항목을 가른다.
PERF_GUIDE = "Screen-Performance-Guide"
# 사용자 확인 공용 캐시 모듈 — 여기만 /api/auth/me 를 직접 부른다(K3, 75e84a2b).
AUTH_ME_CACHE = ("portal-shell", "current-user.ts")
_PAIRS = {"(": ")", "[": "]", "{": "}"}


def _skip_quote(s: str, j: int) -> int:
    """'…' / "…" 끝 다음 위치. 줄이 끝나도 안 닫히면 JSX 글자(아포스트로피)로 보고 따옴표 하나만 건너뛴다."""
    q, k = s[j], j + 1
    while k < len(s):
        c = s[k]
        if c == "\\":
            k += 2
            continue
        if c == q:
            return k + 1
        if c == "\n":
            return j + 1
        k += 1
    return j + 1


def _skip_template(s: str, j: int) -> int:
    """`…${…}…` 끝 다음 위치."""
    k = j + 1
    while k < len(s):
        c = s[k]
        if c == "\\":
            k += 2
            continue
        if c == "`":
            return k + 1
        if c == "$" and s.startswith("${", k):
            end = match_close(s, k + 1)
            if end < 0:
                return len(s)
            k = end + 1
            continue
        k += 1
    return len(s)


def match_close(s: str, i: int) -> int:
    """s[i] 의 ( [ { 에 짝인 닫는 괄호 위치(문자열·템플릿 안은 건너뜀). 못 찾으면 -1."""
    stack = [_PAIRS[s[i]]]
    j = i + 1
    while j < len(s):
        c = s[j]
        if c in "'\"":
            j = _skip_quote(s, j)
            continue
        if c == "`":
            j = _skip_template(s, j)
            continue
        if c in _PAIRS:
            stack.append(_PAIRS[c])
        elif c in ")]}":
            stack.pop()
            if not stack:
                return j
        j += 1
    return -1


def mask_comments(s: str) -> str:
    """// 와 /* */ 주석을 같은 길이의 공백으로 바꾼다(줄 번호 유지). 문자열·템플릿 안은 그대로 둔다."""
    out = list(s)
    j = 0
    while j < len(s):
        c = s[j]
        if c in "'\"":
            j = _skip_quote(s, j)
        elif c == "`":
            j = _skip_template(s, j)
        elif s.startswith("//", j):
            end = s.find("\n", j)
            end = len(s) if end < 0 else end
            out[j:end] = " " * (end - j)
            j = end
        elif s.startswith("/*", j):
            end = s.find("*/", j + 2)
            end = len(s) if end < 0 else end + 2
            out[j:end] = ["\n" if ch == "\n" else " " for ch in s[j:end]]
            j = end
        else:
            j += 1
    return "".join(out)


def _top_level_brackets(s: str) -> list[tuple[int, int]]:
    """s 의 최상위 [ … ] 구간들."""
    found: list[tuple[int, int]] = []
    j = 0
    while j < len(s):
        c = s[j]
        if c in "'\"":
            j = _skip_quote(s, j)
            continue
        if c == "`":
            j = _skip_template(s, j)
            continue
        if c in _PAIRS:
            end = match_close(s, j)
            if end < 0:
                break
            if c == "[":
                found.append((j, end))
            j = end + 1
            continue
        j += 1
    return found


FORM_STATE = re.compile(r"const\s*\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState\b(\s*<[^>(]*>)?")
GRID_MEMO = re.compile(r"const\s+(\w+)\s*(:[^=]+)?=\s*useMemo\b")
GRID_MEMO_NAME = re.compile(r"(?i)(columns|columndefs|coldefs|rows|rowdata|griddata)$")
INPUT_TAG = re.compile(r"<(Input|Textarea|TextInput|NumberInput|InputNumber|SelectOrInput)\b")
API_SEARCH_CALL = re.compile(r"(?<![\w.$])(search[A-Z]\w*)\s*\(")
AUTH_ME_FETCH = re.compile(r"\bfetch\s*\(\s*[`'\"][^`'\"\n]*/auth/me\b")
WIDGET_TIMER = re.compile(r"(?<![\w.$])(?:window\.)?(setInterval)\s*\(|(?<![\w.$])(?:window\.)?(setTimeout)\s*\(")
# P-R8: 행 클릭·선택 처리 함수 이름(handleRowClick·chooseDetail·selectRow·pickXxx 등)과 행 이벤트 props
ROW_HANDLER_NAME = re.compile(r"(?i)^(?:handle|on)?(?:row(?:click|select)\w*|choose\w*|select(?:row|item)\w*)$")
ROW_EVENT_PROP = re.compile(r"\bon(?:RowClicked|RowSelected|SelectionChanged|RowClick|RowSelect)\s*=\s*\{")
FN_DEF = re.compile(
    r"\bconst\s+(\w+)\s*(?::[^=\n]+)?=\s*(?:async\s+)?(?:(?:React\.)?useCallback\s*(?:<[^\n]*?>)?\s*\(|\([^)]*\)\s*(?::[^=\n]+)?=>|\w+\s*=>)"
    r"|\bfunction\s+(\w+)\s*\(")
VISIBILITY_TRACE = re.compile(r"visibilityState|visibilitychange|IntersectionObserver|useTabPage|\bisActive\b")
SYNC_STORE = re.compile(r"useSyncExternalStore\s*\(\s*[\w.$]+\s*,\s*(\(\s*\)\s*=>\s*[\w.$()]+|[\w$]+)")
TAB_ACTIVATED = re.compile(r"addEventListener\s*\(\s*[`'\"]portal-tab-activated")
EMPTY_TERNARY = re.compile(r"\.length\s*(===?\s*0|<\s*1|>\s*0|!==?\s*0)[^?;{}]*?\?\s*\(")
# {rows.length > 0 && (<AgDataGrid …/>)} — 0건이면 그리드를 내리는 && 조건부 렌더(빈 상태 <p> 는 형제로 따로 둔다)
EMPTY_AND = re.compile(r"\.length\s*(?:>\s*0|>=\s*1|!==?\s*0)?\s*&&\s*(?:!?[\w.$?]+\s*&&\s*)*")
EMPTY_SIBLING = re.compile(r"\.length\s*(?:===?\s*0|<\s*1)[^;{}]*?&&\s*\(?\s*<p\b")
# 목록 행 타입에 본문·긴 글 열이 있는지 — types.ts 의 `CONTENT: string`, `body?: string` 류
BIG_TEXT_FIELD = re.compile(r"^\s*(?:readonly\s+)?[\"']?(\w*(?:content|body|cntn|clob)\w*)[\"']?\??\s*:\s*string\b(?!\s*\[)", re.I | re.M)
BIG_TEXT_SKIP = re.compile(r"(?i)format|type|kind|length|size|status")
# 호출 결과를 쥐는 setter 이름 — 콤보 옵션용(옵션·LoV·역할)인지, 그리드 데이터용인지 가른다
OPTION_SETTER = re.compile(r"(?i)options?|lov|roles?|choices")
# 피커 검색 래퍼 — `async function searchXxxPicks(kw): Promise<IdPickRow[]>`
PICKER_WRAPPER = re.compile(r"(?:async\s+function\s+\w+|const\s+\w+\s*=\s*async)\s*\([^)]*\)\s*:\s*Promise<\w*PickRows?\[\]>\s*(?:=>\s*)?\{")
# 사람이 판정해 둔 예외 — 파일·호출·사유·level(exempt=숨김, info=정보성 출력). 정적 분석이 못 보는 서버 상태·규모 근거를 적는다
EXCEPTIONS_FILE = Path(__file__).with_name("audit-exceptions.json")


def _is_form_state(name: str, generic: str | None) -> bool:
    return bool(re.search(r"(?:^form|Form)$", name)) or bool(generic and re.search(r"Form\b", generic))


def _root_component_body(t: str) -> tuple[str, int, int] | None:
    """export default 함수 컴포넌트의 (이름, 본문 { 위치, } 위치)."""
    m = re.search(r"export\s+default\s+function\s*(\w*)\s*\(", t)
    if not m:
        d = re.search(r"export\s+default\s+(\w+)\s*;", t)
        if not d:
            return None
        m = re.search(rf"function\s+({d[1]})\s*\(", t) or re.search(rf"const\s+({d[1]})\s*=\s*(?:\w+\()?\s*\(", t)
        if not m:
            return None
    params_end = match_close(t, m.end() - 1)
    if params_end < 0:
        return None
    b = t.find("{", params_end)
    e = match_close(t, b) if b >= 0 else -1
    return (m[1] or "default", b, e) if e > 0 else None


def _decl_segments(body: str) -> dict[str, str]:
    """본문의 `const H = …` / `function H(…)` 선언 → 선언 텍스트(괄호 짝 기준)."""
    segs: dict[str, str] = {}
    for m in re.finditer(r"(?:const\s+(\w+)\s*(?::[^=]+)?=|function\s+(\w+)\s*\()", body):
        name = m[1] or m[2]
        # 선언 첫 여는 괄호부터 짝 맞춤을 이어 가며 `;`·줄 끝 최상위까지를 선언으로 본다
        j, end = m.end(), len(body)
        while j < len(body):
            c = body[j]
            if c in _PAIRS:
                k = match_close(body, j)
                if k < 0:
                    break
                j = k + 1
                continue
            if c in "'\"":
                j = _skip_quote(body, j)
                continue
            if c == "`":
                j = _skip_template(body, j)
                continue
            if c == ";" or (c == "\n" and m[2]):
                end = j
                break
            if c == "\n" and re.match(r"\n\s*(const|let|function|return|useEffect|useLayoutEffect)\b", body[j:]):
                end = j
                break
            j += 1
        segs[name] = body[m.start():end]
    return segs


def _tag_attrs(t: str, start: int) -> str:
    """`<Tag` 부터 태그 끝(최상위 `>`)까지의 속성 텍스트."""
    j = start + 1
    while j < len(t):
        c = t[j]
        if c == "{":
            k = match_close(t, j)
            if k < 0:
                break
            j = k + 1
            continue
        if c in "'\"":
            j = _skip_quote(t, j)
            continue
        if c == ">":
            return t[start:j]
        j += 1
    return t[start:j]


def _is_widget_file(f: Path) -> bool:
    return bool({"widgets", "widget-types"} & set(f.parts)) or bool(re.search(r"widget|^renderer\.", f.name, re.I))


def _recursive_timeouts(t: str):
    """setTimeout 의 첫 인자가 부르는 함수가, 그 함수 자신의 본문 안에서 setTimeout 을 다시 거는 위치(재귀 타이머)."""
    for m in WIDGET_TIMER.finditer(t):
        if not m[2]:
            continue
        cb = re.match(r"\s*(?:\(\s*\)\s*=>\s*)?([A-Za-z_$][\w$]*)\s*(?:\(|,|\))", t[m.end():])
        if not cb:
            continue
        name = re.escape(cb[1])
        for d in re.finditer(rf"(?:function\s+{name}\s*\(|const\s+{name}\s*(?::[^=]+)?=\s*(?:async\s*)?\()", t):
            pe = match_close(t, d.end() - 1)
            bs = t.find("{", pe) if pe > 0 else -1
            be = match_close(t, bs) if bs >= 0 else -1
            if be > 0 and bs < m.start() < be:
                yield m.start()
                break


def _whole_state_getters(t: str) -> tuple[list[tuple[int, str]], int]:
    """useSyncExternalStore 호출 중 getSnapshot 이 상태 객체 전체인 것 [(pos, 이름)] 과 필드 단위 호출 수."""
    whole: list[tuple[int, str]] = []
    fields = 0
    for m in SYNC_STORE.finditer(t):
        g = m[1].strip()
        body = None
        if g.startswith("("):
            body = re.sub(r"^\(\s*\)\s*=>\s*", "", g)
        else:
            d = (re.search(rf"const\s+{re.escape(g)}\s*(?::[^=]+)?=\s*\(\s*\)\s*(?::[^=>]+)?=>\s*([^;\n]+)", t)
                 or re.search(rf"function\s+{re.escape(g)}\s*\(\s*\)[^{{]*\{{\s*return\s+([^;}}\n]+)", t))
            body = d[1].strip() if d else None
        if body is None:
            fields += 1
            continue
        ident = re.fullmatch(r"[A-Za-z_$][\w$]*", body)
        if ident and re.search(rf"(?:let|const|var)\s+{re.escape(body)}\b\s*(?::[^=;]+)?=\s*\{{|"
                               rf"(?:let|const|var)\s+{re.escape(body)}\s*:\s*\w*(?:State|Snapshot|Store)\b", t):
            whole.append((m.start(), g))
        else:
            fields += 1
    return whole, fields


@functools.lru_cache(maxsize=1)
def load_exceptions() -> list[dict]:
    try:
        return json.loads(EXCEPTIONS_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []


def _exception_level(f: Path, rule: str, call: str | None = None) -> str | None:
    """audit-exceptions.json 에 이 파일·규칙(·호출)이 있으면 그 level(exempt|info), 없으면 None."""
    posix = f.resolve().as_posix()
    for e in load_exceptions():
        if e.get("rule") == rule and posix.endswith("/" + e.get("path", "\0")) and e.get("call") in (None, call):
            return e.get("level", "exempt")
    return None


def _enclosing_block(t: str, pos: int, opener: re.Pattern) -> str | None:
    """opener 로 시작해 닫히는 블록(`{…}`) 중 pos 를 감싸는 것의 본문. 없으면 None."""
    for m in opener.finditer(t):
        bs = m.end() - 1
        be = match_close(t, bs)
        if be > pos > bs:
            return t[bs:be]
    return None


BODY_EXCLUDE_PARAM = re.compile(r"(?:include|with)(?:content|body)[\"']?\s*:\s*false|exclude(?:content|body)[\"']?\s*:\s*true", re.I)


def _list_call_drops_body(f: Path, t: str, call: re.Match) -> bool:
    """P-R1b 오탐 제거: 목록 조회가 본문 제외 파라미터(includeContent:false 등)를 넘기면 True.
    호출 인자에 있거나, 같은 폴더 api.ts 의 해당 search* 함수 본문에 있으면 인정한다."""
    end = match_close(t, call.end() - 1)
    if end > 0 and BODY_EXCLUDE_PARAM.search(t[call.end():end]):
        return True
    api = f.with_name("api.ts")
    if api.exists() and api != f:
        a = mask_comments(api.read_text(encoding="utf-8", errors="ignore"))
        m = re.search(r"function\s+" + re.escape(call[1]) + r"\b", a)
        if m:
            nxt = re.search(r"\n(?:export\s|/\*\*)", a[m.end():])
            return bool(BODY_EXCLUDE_PARAM.search(a[m.end():m.end() + (nxt.start() if nxt else 3000)]))
    return False


def _p_r1_exclusion(t: str, pos: int, end: int, name: str, call_args: str) -> str | None:
    """P-R1 에서 조건 있는 조회·옵션 조회로 볼 수 있는 호출의 사유. 없으면 None. 'info:' 로 시작하면 정보성만 남긴다."""
    # 피커 검색 래퍼(IdPicker·DomainField 의 search prop) — 입력값이 조건이다. 클라이언트에서 자르면 서버 무제한이 남을 수 있어 정보성
    body = _enclosing_block(t, pos, PICKER_WRAPPER)
    if body is not None:
        return "info:피커 검색 래퍼, 클라이언트 상한(서버 응답 한도 확인)" if re.search(r"\.slice\(|_LIMIT\b", body) else "피커 검색 래퍼"
    # makeXxxSearch(...) 에 콜백으로 넘기는 검색 — DomainField 부모 후보 찾기 등
    for m in re.finditer(r"(?<![\w.$])make\w*Search\s*\(", t):
        c = match_close(t, m.end() - 1)
        if c > pos > m.end():
            return "makeXxxSearch 콜백"
    # 첫 인자가 비면 일찍 반환한 뒤 부르는 조건 검색(typeahead·onChange 핸들러)
    tok = re.match(r"\s*([A-Za-z_$][\w$]*)\s*(?:,|$)", call_args)
    if tok:
        window = t[max(0, pos - 800):pos]
        n = re.escape(tok[1])
        g = re.compile(rf"^([ \t]*)if\s*\(\s*(?:!\s*{n}|{n}\s*===?\s*[\"']{{2}})\s*\)\s*\{{?[\s\S]{{0,300}}?\breturn\b", re.M)
        last = None
        for gm in g.finditer(window):
            last = gm
        if last:
            # 가드와 호출 사이에 가드보다 얕은 들여쓰기 줄(다른 함수 선언)이 있으면 같은 함수가 아니다
            ind = len(last[1].expandtabs(2))
            between = window[last.start():].split("\n")[1:]
            if all(not ln.strip() or len(ln) - len(ln.lstrip()) >= ind for ln in between):
                return "빈 값이면 일찍 반환하는 조건 검색"
    # 결과를 콤보 옵션 상태에만 담는다(그리드 data 로 가지 않음)
    setters = [x for x in re.findall(r"\bset([A-Z]\w*)\s*\(", t[end:end + 400])
               if not re.search(r"(?i)error|busy|loading|searching|failed|message|open", x)]  # 상태 표시용 setter 는 뺀다
    if setters and all(OPTION_SETTER.search(x) for x in setters):
        # 옵션 이름이어도 그 상태가 그리드 data 로 가면 목록 조회다
        if not any(re.search(rf"data\s*=\s*\{{[^}}]*\b{x[0].lower() + x[1:]}\b", t) for x in setters):
            return "콤보 옵션 전용 조회"
    return None


def _row_snapshot_write(t: str):
    """행 클릭·선택 처리 함수(이름 규칙 또는 행 이벤트 props)에서 onSnapshotChange 로 이어지는 위치. 없으면 None.
    onSnapshotChange 를 부르는 함수를 불러 내려가며(헬퍼 → 처리 함수, 최대 4단) 찾는다."""
    bodies: dict[str, tuple[int, str]] = {}
    for m in FN_DEF.finditer(t):
        name = m[1] or m[2]
        text = m.group(0)
        if text.rstrip().endswith("(") and (m[2] or "useCallback" in text):
            p = m.end() - 1
            end = match_close(t, p)
            if end < 0:
                continue
            body = t[p:end]
            if m[2]:  # function 선언: 매개변수 뒤의 { } 가 본문
                q = t.find("{", end)
                qe = match_close(t, q) if q >= 0 else -1
                if qe < 0:
                    continue
                body = t[q:qe]
            else:  # useCallback: 끝의 의존성 배열은 본문이 아니다
                body = re.sub(r",\s*\[[^\[\]]*\]\s*$", "", body)
        else:  # 화살표 함수
            q = m.end()
            while q < len(t) and t[q].isspace():
                q += 1
            if q < len(t) and t[q] == "{":
                qe = match_close(t, q)
                body = t[q:qe] if qe > 0 else ""
            else:
                semi = t.find(";", q)
                body = t[q:semi if semi > 0 else q + 400]
        bodies[name] = (m.start(), body)
    touching = {n for n, (_, b) in bodies.items() if "onSnapshotChange" in b}
    for _ in range(4):
        grown = {n for n, (_, b) in bodies.items() if n not in touching
                 and any(re.search(rf"\b{re.escape(x)}\b", b) for x in touching)}
        if not grown:
            break
        touching |= grown
    for n in sorted(touching):
        if ROW_HANDLER_NAME.match(n):
            return bodies[n][0]
    for m in ROW_EVENT_PROP.finditer(t):
        end = match_close(t, m.end() - 1)
        body = t[m.end():end] if end > 0 else ""
        if "onSnapshotChange" in body or any(re.search(rf"\b{re.escape(x)}\b", body) for x in touching):
            return m.start()
    return None


def perf_audit(f: Path, raw: str, in_shared: bool, error, warn, info=None) -> None:
    """화면 성능 가이드에서 정적으로 잡히는 항목. error(pos, msg)·warn(pos, msg)·info(pos, msg) 로 낸다."""
    info = info or warn
    parts = set(f.parts)
    if {"tests", "__tests__", "e2e"} & parts or re.search(r"\.(test|spec)\.[jt]sx?$", f.name):
        return
    t = mask_comments(raw)

    # P-K: /api/auth/me 직접 호출 — 공용 캐시(getCurrentUser) 를 거치지 않으면 진입마다 요청이 는다(R9·K3)
    if f.parts[-2:] != AUTH_ME_CACHE:
        for m in AUTH_ME_FETCH.finditer(t):
            error(m.start(), f"[P-K] /api/auth/me 직접 호출 → getCurrentUser()·useCurrentUserId() "
                             f"(@dk-oasis/shared/portal-shell) 를 쓴다 ({PERF_GUIDE} R9·K3)")

    # P-R10: 전역 탭 활성화 이벤트로 다시 읽으면서 자기 탭인지 보지 않는다
    if TAB_ACTIVATED.search(t) and "tabId" not in t:
        m = TAB_ACTIVATED.search(t)
        warn(m.start(), f"[P-R10 경고] portal-tab-activated 를 받으며 tabId 비교가 없다 → 어느 탭이 활성화돼도 다시 조회한다. "
                        f"useTabPage().tabId 와 detail.tabId 를 비교한다 ({PERF_GUIDE} R10·K5)")

    # P-R14: 위젯의 타이머가 탭 활성·표시 여부를 보지 않는다 — 숨은 탭에서도 계속 조회한다(R14)
    if _is_widget_file(f) and not VISIBILITY_TRACE.search(t):
        hit = next((m for m in WIDGET_TIMER.finditer(t) if m[1]), None)
        pos = hit.start() if hit else next(_recursive_timeouts(t), None)
        if pos is not None:
            lvl = _exception_level(f, "P-R14")
            if lvl != "exempt":
                (info if lvl == "info" else warn)(pos, f"[P-R14 {'정보' if lvl == 'info' else '경고'}] 위젯 파일에 setInterval·재귀 setTimeout 이 있는데 표시 확인(visibilityState·visibilitychange·"
                          f"IntersectionObserver·useTabPage·isActive)이 없다 → 숨은 탭·접힌 위젯도 계속 조회한다. "
                          f"자동 새로 고침은 틀(refreshSec)에 맡기거나 표시 여부와 연동한다 ({PERF_GUIDE} R14)")

    # P-R16: 외부 스토어를 통째 상태로만 구독 — 필드 훅이 없으면 한 필드만 바뀌어도 모든 구독자가 다시 그려진다(R16)
    whole, fields = _whole_state_getters(t)
    if whole and not fields and re.search(r"export\s+(?:function|const)\s+use\w+", t):
        warn(whole[0][0], f"[P-R16 경고] useSyncExternalStore 가 상태 객체 전체(`{whole[0][1]}`)만 돌려주고 필드 단위 훅이 없다 "
                          f"→ 한 필드만 바뀌어도 구독자가 모두 다시 그려진다. 필드별 훅(getSnapshot 이 그 필드만 돌려줌)을 내보낸다 ({PERF_GUIDE} R16)")

    # P-R8: 행 클릭·선택 처리가 onSnapshotChange 를 부른다 — 선택 행은 snapshot 에 넣지 않는다(R8, 2026-10-05 사용자 결정)
    if "onSnapshotChange" in t:
        pos = _row_snapshot_write(t)
        if pos is not None:
            error(pos, f"[P-R8] 행 클릭·선택 처리에서 onSnapshotChange 를 부른다 → 클릭마다 포털 셸이 다시 렌더된다. "
                       f"선택 행은 탭 snapshot 에 넣지 않는다(조회 조건이 바뀔 때만 부른다) ({PERF_GUIDE} R8)")

    if in_shared:
        return
    states = [(m, m[1], m[2]) for m in FORM_STATE.finditer(t) if _is_form_state(m[1], m[3])]

    # P-R12: 그리드 열·행 useMemo deps 에 폼 객체 전체
    for m in GRID_MEMO.finditer(t):
        name, annot = m[1], m[2] or ""
        k = m.end()
        generic = ""
        if t.startswith("<", k):  # useMemo<GridColumn[]>(
            depth, j = 0, k
            while j < len(t):
                depth += {"<": 1, ">": -1}.get(t[j], 0)
                if depth == 0:
                    break
                j += 1
            generic, k = t[k:j + 1], j + 1
        p = t.find("(", k)
        if p < 0 or not (GRID_MEMO_NAME.search(name) or re.search(r"GridColumn|ColDef", annot + generic)):
            continue
        end = match_close(t, p)
        if end < 0:
            continue
        inner = t[p + 1:end]
        brackets = _top_level_brackets(inner)
        if not brackets:
            continue
        deps = inner[brackets[-1][0]:brackets[-1][1] + 1]
        for _, sname, _ in states:
            if re.search(rf"(?<![\w.$]){sname}(?![\w$]|\s*\??\.)", deps):
                error(m.start(), f"[P-R12] 그리드 useMemo `{name}` deps 에 폼 상태 `{sname}` 전체 → 입력 한 글자마다 그리드 참조가 "
                                 f"새로 생겨 셀이 다시 그려진다. 쓰는 값만 deps 에 두거나 셀 렌더러가 ref 로 읽는다 ({PERF_GUIDE} R12)")

    # P-R12b: 화면 루트의 폼 state 를 입력 onChange 가 매 글자 바꾼다
    root = _root_component_body(t) if f.suffix in (".tsx", ".jsx") else None
    if root:
        rname, b, e = root
        body = t[b:e]
        segs = None
        for m, sname, setter in states:
            if not (b < m.start() < e):
                continue
            segs = segs if segs is not None else _decl_segments(body)
            via = {setter} | {h for h, seg in segs.items() if h != setter and re.search(rf"\b{setter}\b", seg)}
            via_rx = re.compile(r"\b(" + "|".join(map(re.escape, sorted(via))) + r")\b")
            for tag in INPUT_TAG.finditer(body):
                attrs = _tag_attrs(body, tag.start())
                oc = re.search(r"\bonChange\s*=\s*\{", attrs)
                if oc and via_rx.search(attrs[oc.end() - 1:match_close(attrs, oc.end() - 1) + 1]):
                    warn(m.start(), f"[P-R12b 경고] 화면 루트 `{rname}` 의 폼 상태 `{sname}` 를 <{tag[1]}> onChange 가 매 글자 바꾼다 "
                                    f"→ 글자마다 화면 루트 전체가 다시 렌더된다. 상세 폼을 별도 컴포넌트로 나누고 state 를 그 안에 둔다 ({PERF_GUIDE} R12)")
                    break

    # P-R1: import 한 목록 조회 API 에 첫 조회 상한이 없고 GridLimitNotice 도 없다.
    # 목록을 그리는 파일(page.tsx 또는 AgDataGrid·GridPanel 을 쓰는 파일)만 본다 — 입력 자동완성·Lookup 피커는 입력값이
    # 조건이라 대상이 아니다. 인자에 limit·size·max·page(상한·페이징)가 있으면 통과.
    lists_rows = f.name == "page.tsx" or re.search(r"<(AgDataGrid|GridPanel)\b", t)
    if f.name != "api.ts" and lists_rows and "GridLimitNotice" not in t:
        imported = {n for imp in re.finditer(r"import\s*(?:type\s*)?\{([^}]*)\}\s*from", t)
                    for n in re.findall(r"\b(search[A-Z]\w*)\b", imp[1])}
        for m in API_SEARCH_CALL.finditer(t):
            if m[1] not in imported or re.search(r"(function|import|as)\s*$", t[max(0, m.start() - 20):m.start()]):
                continue
            end = match_close(t, m.end() - 1)
            call_args = t[m.end():end] if end > 0 else ""
            # 상위 키(…Id·…Code·key)로 묶인 조회(마스터-디테일 하위·단건·중복 확인)는 조건이 있는 조회다. 검색 조건 객체의
            # 칸(filters.unitCode 등)은 비어 있을 수 있으므로 키로 치지 않는다.
            keyed = any(re.search(r"(?i)(id|code|key)$|^token$", tok.split(".")[-1])
                        and not re.match(r"(filters?|f|cond|conditions?|query|params)\.", tok)
                        for tok in re.findall(r"[A-Za-z_$][\w$.]*", call_args))
            if end > 0 and not keyed and not re.search(r"(?i)limit|size|max|\bpage\b", call_args):
                lvl = _exception_level(f, "P-R1", m[1])
                if lvl == "exempt":
                    continue
                why = _p_r1_exclusion(t, m.start(), end, m[1], call_args) if lvl is None else None
                if why and not why.startswith("info:"):
                    continue
                if lvl == "info" or why:
                    info(m.start(), f"[P-R1 정보] 목록 조회 `{m[1]}(…)` 에 첫 조회 상한이 없다"
                                    + (f" — {why[5:]}" if why else " — 예외 목록(audit-exceptions.json)에 정보성으로 올라 있다"))
                    continue
                warn(m.start(), f"[P-R1 경고] 목록 조회 `{m[1]}(…)` 에 첫 조회 상한(limit)이 없고 화면에 GridLimitNotice 가 없다 "
                                f"→ 조건 없는 조회면 전체 행을 받는다. 필수 조건을 두거나 FIRST_SEARCH_LIMIT 를 넘기고 잘리면 "
                                f"GridLimitNotice 를 보인다 ({PERF_GUIDE} R1)")

    # P-R1b: 목록을 그리는 파일이 search* 를 부르는데 같은 폴더 types.ts 의 행 타입에 본문 열이 있다 — 행마다 본문을 실어 보낼 수 있다
    if lists_rows and f.name != "api.ts" and f.suffix in (".tsx", ".ts") and _exception_level(f, "P-R1b") != "exempt":
        tf = f.with_name("types.ts")
        call = next((m for m in API_SEARCH_CALL.finditer(t) if not re.search(r"(function|import|as)\s*$", t[max(0, m.start() - 20):m.start()])), None)
        if call and tf.exists() and tf != f:
            cols = sorted({n for n in BIG_TEXT_FIELD.findall(tf.read_text(encoding="utf-8", errors="ignore")) if not BIG_TEXT_SKIP.search(n)})
            if cols and not _list_call_drops_body(f, t, call):
                (info if _exception_level(f, "P-R1b") == "info" else warn)(call.start(), f"[P-R1b 경고] 목록 조회 `{call[1]}(…)` 를 쓰는 화면의 types.ts 에 본문·긴 글 열({', '.join(cols)})이 있다 "
                                   f"→ 목록 응답이 행마다 본문을 실으면 누적될 때 수 MB 가 된다. 목록에는 그리드에 보이는 열만 싣고 "
                                   f"본문은 행 선택 때 상세 조회로 받는다 ({PERF_GUIDE} R1)")

    # P-R6: 0건이면 AgDataGrid 를 언마운트하는 3항
    if f.suffix in (".tsx", ".jsx"):
        for m in EMPTY_TERNARY.finditer(t):
            a_end = match_close(t, m.end() - 1)
            if a_end < 0:
                continue
            rest = re.match(r"\s*:\s*\(", t[a_end + 1:])
            if not rest:
                continue
            b_start = a_end + 1 + rest.end() - 1
            b_end = match_close(t, b_start)
            then_b, else_b = t[m.end():a_end], t[b_start:b_end]
            empty_first = not m[1].lstrip().startswith((">", "!"))
            grid_b, other_b = (else_b, then_b) if empty_first else (then_b, else_b)
            if "<AgDataGrid" in grid_b and "<AgDataGrid" not in other_b:
                warn(m.start(), f"[P-R6 경고] 0건이면 AgDataGrid 를 내린다 → 조회마다 그리드를 새로 만든다. "
                                f"그리드를 늘 두고 빈 상태는 emptyMessage 로 보인다 ({PERF_GUIDE} R6)")
        # && 조건부 렌더: {rows.length > 0 && (<AgDataGrid/>)} — 3항과 같은 언마운트
        for m in EMPTY_AND.finditer(t):
            k = m.end()
            if t.startswith("(", k):
                e = match_close(t, k)
                grid = e > 0 and "<AgDataGrid" in t[k:e]
            else:
                grid = t.startswith("<AgDataGrid", k)
            # 빈 상태 <p> 가 형제로 따로 있는 쌍만 본다 — 0건 안내를 그리드 밖에 두는 구조라 0↔N 전환에 그리드가 내려간다
            sibling = grid and EMPTY_SIBLING.search(t[max(0, m.start() - 900):m.start()] + t[k:k + 1200])
            if grid and sibling:
                warn(m.start(), f"[P-R6 경고] 행이 있을 때만(`&&`) AgDataGrid 를 그린다 → 0건이면 그리드를 내리고 조회마다 새로 만든다. "
                                f"그리드를 늘 두고 빈 상태는 emptyMessage 로 보인다 ({PERF_GUIDE} R6)")


def cmd_audit(args: argparse.Namespace) -> None:
    files: list[Path] = []
    for p in map(Path, args.paths):
        if p.is_dir():
            files += [f for f in p.rglob("*") if f.suffix in (".tsx", ".ts", ".jsx")
                      and not {"node_modules", ".next", "dist", "build"} & set(f.parts)]
        elif p.exists():
            files.append(p)
    deprecated = deprecated_props()
    dep_rx = re.compile(r"\b(" + "|".join(sorted(deprecated, key=len, reverse=True)) + r")\b\s*[:=]") if deprecated else None
    fixed = [(re.compile(rx), msg) for rx, msg in FIXED_RULES]
    issues = 0
    warnings = 0
    infos = 0

    def report(f: Path, text: str, pos: int, msg: str) -> None:
        nonlocal issues
        print(f"{f}:{text.count(chr(10), 0, pos) + 1}: {msg}")
        issues += 1

    def report_warn(f: Path, text: str, pos: int, msg: str) -> None:
        nonlocal warnings
        print(f"{f}:{text.count(chr(10), 0, pos) + 1}: {msg}")
        warnings += 1

    def report_info(f: Path, text: str, pos: int, msg: str) -> None:
        nonlocal infos
        print(f"{f}:{text.count(chr(10), 0, pos) + 1}: {msg}")
        infos += 1

    for f in files:
        text = f.read_text(encoding="utf-8", errors="ignore")
        uses_grid = "ag-grid" in text or "AgGridReact" in text or "ColDef" in text
        in_shared = "shared" in f.parts and "src" in f.parts
        for rx, msg in fixed:
            for m in rx.finditer(text):
                report(f, text, m.start(), msg)
        if not in_shared:
            for m in SCREEN_IMPORT.finditer(text):
                report(f, text, m.start(), "화면에서 ag-grid 직접 import 금지 → @dk-oasis/shared/grid (Part B §6)")
            if f.suffix in (".tsx", ".jsx"):
                for rx, msg in SCREEN_TABLE_RULES:
                    for m in rx.finditer(text):
                        report(f, text, m.start(), msg)
        if dep_rx and uses_grid:
            for m in dep_rx.finditer(text):
                name, note = m[1], deprecated[m[1]]
                # `rowSelection.isRowSelectable` 처럼 같은 이름으로 옮겨 간 속성은 객체 키(`name:`)로 쓰면 정상이다
                moved_same_name = re.search(rf"`\w+\.{name}\b", note)
                if moved_same_name and m.group(0).rstrip().endswith(":"):
                    continue
                report(f, text, m.start(), f"`{name}` deprecated: {note}")
        perf_audit(f, text, in_shared,
                   lambda pos, msg, f=f, text=text: report(f, text, pos, msg),
                   lambda pos, msg, f=f, text=text: report_warn(f, text, pos, msg),
                   lambda pos, msg, f=f, text=text: report_info(f, text, pos, msg))
    print(f"\n{len(files)}개 파일 점검, 의심 {issues}건 (deprecated 기준: 설치본 {len(deprecated)}개 속성)"
          + (f", 성능 경고 {warnings}건(종료 코드 무관)" if warnings else "")
          + (f", 정보 {infos}건" if infos else "")
          + ("" if issues else " — 통과"))
    sys.exit(1 if issues else 0)


def cmd_refresh(_: argparse.Namespace) -> None:
    shutil.rmtree(CACHE, ignore_errors=True)
    print(f"캐시 삭제: {CACHE}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("version").set_defaults(fn=cmd_version)
    s = sub.add_parser("search"); s.add_argument("terms", nargs="+"); s.add_argument("--limit", type=int, default=30)
    s.set_defaults(fn=cmd_search)
    g = sub.add_parser("get"); g.add_argument("slug"); g.add_argument("--section"); g.add_argument("--version")
    g.add_argument("--framework", default="react", choices=["react", "javascript", "angular", "vue"])
    g.add_argument("--latest", action="store_true"); g.set_defaults(fn=cmd_get)
    t = sub.add_parser("types"); t.add_argument("name"); t.add_argument("--after", type=int, default=3)
    t.add_argument("--limit", type=int, default=5); t.set_defaults(fn=cmd_types)
    sub.add_parser("recommendations").set_defaults(fn=cmd_recommendations)
    a = sub.add_parser("audit"); a.add_argument("paths", nargs="+"); a.set_defaults(fn=cmd_audit)
    sub.add_parser("refresh").set_defaults(fn=cmd_refresh)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
