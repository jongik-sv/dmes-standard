# 정본 메모 — tooltip-shared 레인

- 지시: tooltip-shared-1 (`/Users/jji/.coord/tooltip-2026-10-05/lanes/tooltip-shared/brief.md`)
- 브랜치·워크트리: `fix/tooltip-shared` / `/Users/jji/project/dmes-standard-wt/tooltip-shared` (기준 dev e00a3c7c)
- 조정 세션: dmes-standard-0f

## 항목 상태 (2026-10-05)

| 항목 | 상태 | 커밋 | 비고 |
|---|---|---|---|
| A1 mdm 탭 → mcm 메타 | 완료·리뷰 clean | c2cf6be8, 68d2bb9e | analog 만 끔 |
| A2 SearchField name·meta | 구현 완료, 리뷰 중 | 562289e1 | 특성 시험 선행 |
| A3 기본 머리글 툴팁 | 완료·리뷰 clean | 1e6f0393, 892c17dd | 잎 열만, 그룹 머리·No 열 제외 |
| A4 툴팁 지연 500ms | 완료·리뷰 지적 반영 | 8af10d91, 493fe2ed | 셀 툴팁도 빨라짐(문서화) |
| A5 문서 | 진행 중 | — | 스킬 문서·색인·FE 가이드 |
| A6 리팩토링 리뷰·전체 시험 | 대기 | — | 머지 요청 전 |
| A7 FE 성능 | 대기(「측정 시작」 뒤) | — | tooltip-screens 머지 뒤 |

## 남은 일
1. A2 리뷰 지적 반영, A5 문서 커밋.
2. A6: 레인 전체 opus 리뷰 → dev 합치기 → shared 전체 vitest(heavy.sh) · tsc · 형제 tsup → 머지 요청.
3. A7: 조정자의 「측정 시작」 뒤 mdmMeta 묶음 횟수·열 정의 재생성 확인, perf-tooltip-shared.md.

## 알려진 한계
- `MdmHeaderLabel` 의 지연은 라벨이 만들어질 때 `api.getGridOption("tooltipShowDelay")` 로 읽는다. 화면이 실행 중에 `tooltipShowDelay` 를 바꾸면 이미 그린 HTML 머리글 카드는 예전 지연을 쓴다(드문 경우라 두었다).
