# 성능 비교 기록 — tooltip-shared 레인

지시 tooltip-shared-1 A7·tooltip-shared-3. 측정은 조정 세션의 「측정 시작」 뒤에 한다.

## 준비 (2026-10-05, 측정 전)

- 기준 워크트리: `/Users/jji/project/dmes-standard-wt/tooltip-perf-base` (detached `dffe0f95`, tooltip-shared 머지 직전 dev)
- 변경 워크트리: `/Users/jji/project/dmes-standard-wt/tooltip-perf-head` (detached `f36820bd`, tooltip-shared A1~A6 머지)
- 각 워크트리 `src/frontend` 에서 `pnpm install --frozen-lockfile --prefer-offline` 를 따로 돌렸다(둘 다 node_modules 가 없던 새 폴더라 메인 체크아웃 링크를 건드리지 않음). `m-mcm/node_modules/@dk-oasis/shared` → `../../../shared`(자기 워크트리 안), 메인 `node_modules/.modules.yaml` 수정 시각 10-03 02:32 그대로.
- shared·형제 tsup(m-analog·mdm·mls·mpn·mpp·mqc)은 미리 빌드해 둔다. 측정 창에서는 m-mcm `next build` 만 돌린다.

## 측정 절차

1. 워크트리마다(번갈아 기준 → 변경 → 기준 → 변경 → 기준 → 변경) heavy.sh 로 한 번씩:
   ```
   cd <워크트리>/src/frontend/m-mcm
   uptime
   /usr/bin/time -p ../../../.claude/skills/dflow-dev/scripts/heavy.sh npx next build
   ```
   빌드 시간(real)과 `uptime` load(1분)를 회차마다 적는다.
2. 청크 크기(입력이 같으면 같으므로 1회): 아래 스크립트를 두 워크트리 루트로 돌린다.
   ```
   python3 perf-chunks.py /Users/jji/project/dmes-standard-wt/tooltip-perf-base /Users/jji/project/dmes-standard-wt/tooltip-perf-head
   ```
   - 지표: 전체 JS 청크 바이트·gzip, SearchField 코드(`search-field__label`)가 든 청크의 바이트·gzip, 그 청크와 전체의 DOMPurify(`ALLOWED_URI_REGEXP`)·메타 store(`__dkOasisMdmMetaStore__`) 사본 수.
3. 탭당 mdmMeta 요청 묶음 수(columns·domains 횟수)와 그리드 열 정의 재생성 여부는 shared 시험으로 확인한다(브라우저 측정이 필요하면 조정 세션에 요청).
4. 화면 성능 audit(P-R8 등)를 이 레인이 바꾼 파일만 넘겨 돌린다(변경 워크트리 루트에서):
   ```
   python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit src/frontend/shared/src/components/grid src/frontend/shared/src/layout/SearchField.tsx src/frontend/shared/src/mdm-meta/context.tsx src/frontend/shared/src/portal-shell/portal-shell.tsx
   python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit src/frontend/shared/src/layout/SearchField.tsx
   ```

### perf-chunks.py

```python
#!/usr/bin/env python3
"""tooltip-shared A7 — m-mcm next build 산출 청크 크기 비교.

사용: python3 perf-chunks.py <워크트리 루트> [<워크트리 루트> ...]
"""
import gzip
import pathlib
import sys

MARK_SEARCH = b"search-field__label"
MARK_STORE = b"__dkOasisMdmMetaStore__"
MARK_PURIFY = b"ALLOWED_URI_REGEXP"


def gz(b: bytes) -> int:
    return len(gzip.compress(b, 9))


def measure(root: str) -> None:
    chunks = sorted(pathlib.Path(root, "src/frontend/m-mcm/.next/static/chunks").rglob("*.js"))
    if not chunks:
        print(f"== {root}: 청크 없음(next build 먼저)")
        return
    total = total_gz = purify = store = 0
    search = []
    for p in chunks:
        b = p.read_bytes()
        total += len(b)
        total_gz += gz(b)
        purify += b.count(MARK_PURIFY)
        store += b.count(MARK_STORE)
        if MARK_SEARCH in b:
            search.append((p, b))
    print(f"== {root}")
    print(f"청크 {len(chunks)}개, {total:,} B, gzip {total_gz:,} B, DOMPurify 표식 {purify}, 메타 store 표식 {store}")
    for p, b in search:
        print(
            f"  SearchField 청크 {p.name}: {len(b):,} B, gzip {gz(b):,} B, "
            f"store 표식 {b.count(MARK_STORE)}, DOMPurify 표식 {b.count(MARK_PURIFY)}"
        )


if __name__ == "__main__":
    for r in sys.argv[1:]:
        measure(r)
```

## 측정 전 참고값 (esbuild metafile, shared `src/layout/index.ts` 축소 묶음)

- `layout` 묶음 67,565 B(gzip 25,461 B). SearchField → MdmFieldLabel 로만 들어온 코드 38,724 B: DOMPurify 21,956 · MdmMetaCard 5,202 · store 2,554 · http 2,494 · useHoverTip 2,430 · context 1,542 · 기타 2,546.
- shared dist(tsup splitting:false)에서 DOMPurify 사본이 든 묶음 10개, 메타 store 사본이 든 묶음 6개(grid·form·mdm-meta·lookup·index·layout).

## P1. SearchField 메타 라벨이 화면 청크에 더한 크기
- 관련 구조 변경: S3
- 지표(단위): m-mcm next build 청크 바이트·gzip(B), 빌드 시간(초)
- 측정 절차: 위 「측정 절차」 1·2
- 기준 커밋: dffe0f95 / 변경 커밋: f36820bd
- 측정 환경: (측정 때 적음)

| 회차 | 기준 | 변경 | load(1분) |
|---|---|---|---|
| 1 | | | |

- 중앙값: (측정 뒤)
- 판정: (측정 뒤)

## 사용자 결정 안건(마감 보고에 올림)
- A. shared tsup `splitting: true` — 진입점 사이 공통 코드(DOMPurify·메타 store·MdmMetaCard)를 한 청크로 모아 사본을 줄인다. 근거 수치는 P1 실측으로 채운다.
