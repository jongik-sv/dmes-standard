# mdm-column-dict 레인 정본 메모

- 브랜치 `feat/mdm-column-dict`, 워크트리 `/Users/jji/project/dmes-standard-wt/mdm-column-dict`(기준 dev e00a3c7c), 조정 세션 dmes-standard-0f.
- 지시: mdm-column-dict-1(착수), mdm-column-dict-2(C1 확정 — MDM 별칭은 조회 쪽(C1b)으로, WIDGET_ID 용어 등록, TITLE 사전에 있음).

## 항목

| 항목 | 상태 | 커밋 | 결과 |
|---|---|---|---|
| C1 분류표 | 끝·확정 | ec4ff90a, b3d28de5, d3e46c5a | `docs/mdm-column-dict/classification.md`(+json·csv). 키 423: 사전에 있음 45, MDM 별칭 67, 신규 69(표준 59), MES 별칭 10, 표시용 32, 범용 106, UI 94 |
| C1b 시스템 코드 목록 | 끝 | ee705168, 90bb01d9 | 피드 시험 72·별칭 시험 16 통과, opus 리뷰 결함 없음(배포 순서 주의) |
| C2 등록 묶음·스크립트 | 끝 | 1d4720e5 + 리뷰 수정 | 용어 1·신규 59·별칭 10, dry-run PLAN 70·FAIL 0. 리뷰: CD_V·COLUMN_ID 의 MDM 자기 매핑 때문에 별칭 2건을 표시용으로 옮김 |
| C3 전후 확인 | 끝 | c40c1cd9 + 리뷰 수정 | 고정 키 417·등록 전 hit 62·기대 hit 146(`--expect`) |
| C4 BE 측정 절차 | 끝 | ccefc1e8 | `scripts/perf/mdm-meta/run-measure.sh`, 수치는 조정 세션 측정 창 |
| C5 마감 | 진행 | — | 리팩토링 리뷰, 기록 문서, 머지 요청 |

## 남은 일

1. C5 리팩토링 리뷰(sonnet/high) — C2·C3 리뷰 지적은 반영했다.
2. dev 최신 합치기 → 시험 재실행 → 머지 요청(C1·C1b·C2·C3·C4 묶음).
3. 머지 뒤 조정 세션: MDM 먼저·mcm 나중 재기동 → `register-columns.mjs --apply` → `check-meta.sh --expect` → `run-measure.sh` before/after.
