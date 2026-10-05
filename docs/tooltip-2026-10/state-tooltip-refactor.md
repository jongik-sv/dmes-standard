# tooltip-refactor 레인 정본 메모

**상태: 완료(2026-10-05).** dev 머지 `d437a6ea`(트리 32e373ce), 워크트리·브랜치 정리 끝. D1·D2·D3 구현·리뷰(opus/high, 동작 보존 OK)·audit 통과. 구조 기록은 `structure-tooltip-refactor.md`.

- 브랜치: `refactor/tooltip-screens-followup` / 워크트리: `/Users/jji/project/dmes-standard-wt/tooltip-refactor` / 기준 dev `6e80a51e` / 지시 tooltip-refactor-1

## 진도

| 항목 | 상태 | 커밋 |
|---|---|---|
| D2 위젯 유형 편집기 4개 `MdmMetaProvider disabled` | 끝 | 3d5e5396 · 79697c00 |
| D1 열 `meta: false` → `uiCols` | 끝 | 7d7fa2ce(고정 시험) · 99801410 · ec7cd38c · 609fa68d · 7f87a1f3 · af9ec3da |
| D3 설명·원천 라벨 상수 | 끝 | D1 커밋에 포함 |
| D4 마감 | 끝 | 구조 기록·정본 메모 커밋 → 머지 d437a6ea |

## 남은 일
1. (끝) 머지·정리. 메인 체크아웃의 형제 tsup 재빌드는 조정자 몫.
2. 후속(제안): shared 몫 — 범용 키 목록을 `resolveMdmPhysName` 이 자동으로 끄면 화면의 `meta: false` 약 160곳이 더 줄어든다(남은 것은 `cell()` 형태·SearchField·라벨 등). `uiCols` 두 사본(m-mdm/src, m-mcm/lib)은 shared 승격 시 하나가 된다.
3. 후속(기존): `m-mdm/tests/dma/domainMng/page-render.test.ts` 고정 20ms 대기 flake(변경 전에도 재현).

## 환경 메모
- 워크트리 의존성은 `deps.sh` 를 쓰지 않고 `src/frontend` 에서 `pnpm install --frozen-lockfile --prefer-offline` 후 `pnpm --filter @dk-oasis/shared build`. 시작·끝에 메인 `m-mcm/node_modules/@dk-oasis/shared` 가 `../../../shared` 인 것을 확인했다.
- 고정 시험은 m-mdm 에 있고 m-mcm·m-mls 소스도 훑는다(`pnpm vitest run tests/ui-meta-lock.test.ts` 를 m-mdm 에서).
