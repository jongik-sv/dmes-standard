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

## 측정 전 참고값 (esbuild metafile, shared `src/layout/index.ts` 축소 묶음) — 정정
- `layout` 묶음 67,565 B 는 DOMPurify(21,956 B)를 함께 묶은 값이다. 실제 tsup dist 는 `dompurify` 를 외부 모듈로 import 하므로(package.json dependencies 는 tsup 기본 external) 앱 번들러가 한 벌로 합친다.
- 그래서 SearchField → MdmFieldLabel 로 layout 에 실제로 더해진 shared 내부 코드는 약 16.8K(축소): MdmMetaCard 5,202 · store 2,554 · http 2,494 · useHoverTip 2,430 · context 1,542 · 기타 2,546.
- 처음 보고한 「DOMPurify 사본 10곳」 은 dist 의 `DOMPurify` import 이름을 grep 으로 센 잘못된 값이다. 묶음마다 따로 들어가는 것은 shared 내부 코드(메타 store 등 — `__dkOasisMdmMetaStore__` 가 grid·form·mdm-meta·lookup·index·layout 묶음에 각각 있음)다.

## P1. SearchField 메타 라벨이 m-mcm 클라이언트 청크에 준 영향
- 관련 구조 변경: S3
- 지표(단위): m-mcm `next build`(Turbopack) `.next/static/chunks/**/*.js` 바이트·gzip(B, gzip -9)
- 측정 절차: 위 「측정 절차」 2. `next build` 는 heavy.sh 로 기준·변경 각 1회. 두 쪽 모두 클라이언트 컴파일 성공 뒤 페이지 데이터 수집 단계에서 `AUTH_SECRET 환경 변수가 필요합니다` 로 멈췄다(같은 조건이고 정적 청크는 컴파일 단계에서 이미 다 나온다). 변경 쪽은 `.next` 를 옮겨 두고 한 번 더 빌드해 바이트 단위로 같음을 확인했다(크기 재현).
- 기준 커밋: dffe0f95 / 변경 커밋: f36820bd
- 측정 환경: 2026-10-05 12:53~13:00, load(1분) 기준 18.49·변경 14.51(Spotlight 색인). 빌드 시간은 부하로 생략.

| 지표 | 기준 | 변경 | 증감 |
|---|---|---|---|
| JS 청크 수 | 315 | 313 | −2 |
| JS 전체 바이트 | 24,456,553 | 23,970,072 | −486,481 (−1.99%) |
| JS 전체 gzip | 6,840,131 | 6,667,490 | −172,641 (−2.52%) |
| SearchField 코드가 든 청크 | 3개 · 104,479 B · gzip 38,172 | 1개 · 41,460 B · gzip 15,161 | −63,019 B · gzip −23,011 |
| DOMPurify 라이브러리 | SearchField 청크(48,916 B) 안 | 별도 청크 23,222 B 하나 | — |
| 메타 store 가 든 청크 | 46개 · 4,588,473 B | 41개 · 4,131,078 B | −5개 · −457,395 B |
| 바뀐(해시가 다른) 청크 | 79개 · 5,685,513 B | 77개 · 5,199,032 B | −486,481 B |

- 판정: 클라이언트 JS 는 늘지 않고 오히려 2.0%(gzip 2.5%) 줄었다(재빌드로 같은 값 확인). 기준에서는 layout 모듈이 SearchField 를 쓰는 청크 3개에 따로 들어갔고, 변경에서는 1개 청크로 모이고 DOMPurify 가 별도 공용 청크로 빠졌다. 줄어든 원인은 Turbopack 이 바뀐 import 관계에 맞춰 청크를 다시 나눈 결과로 보인다(모듈별 귀속은 따로 분석하지 않았다 — 추정). 이번 레인 변경이 화면 청크를 키우지 않았다는 결론은 실측으로 확인된다.
- audit(변경 워크트리): `aggrid_docs.py audit`(grid·SearchField·context·portal-shell 19파일) 의심 0, `mantine_docs.py audit`(SearchField) 의심 0.
- 탭당 mdmMeta 요청 묶음·그리드 열 정의 재생성: shared 시험으로 확인 — `search-field-mdm-meta`(이름 있는 칸은 columns 1회, 이름 없는 칸 0회), `portal-shell-mdm-meta`(탭당 columns→domains 순서 묶음), `grid-mdm-html-header-label` refreshHeader 시험(데이터만 바꾼 다시 렌더에서 머리글 재생성 없음), columnDefs useMemo deps 변경 없음.

## 사용자 결정 안건(마감 보고에 올림)
- A. shared tsup `splitting: true` — 진입점 사이 공통 shared 내부 코드(메타 store·MdmMetaCard·useHoverTip 등)를 한 청크로 모은다. 근거: 메타 store 를 담은 청크가 변경 뒤에도 41개(4.13MB)다. 다만 DOMPurify 같은 npm 의존성은 이미 외부라 한 벌이고, 이번 레인으로 화면 청크가 커지지 않았으므로 급하지 않다. 효과 크기는 splitting 을 켠 빌드로 따로 재야 한다.
