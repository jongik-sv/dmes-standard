# memo dn-split-wbs (지시 dn-split-wbs-1)

상태: 이동·리뷰 반영 끝 → 머지 요청 대기. 리뷰 반영: 번호 예외·금지 규칙 인라인, 트리거 문구 구체화, 참조 수정. 남은 외부 링크: dflow-export/SKILL.md:20 (다른 스킬).
브랜치 chore/dn-split-wbs · 크기: SKILL.md 2개 수정 + references 신규 10개.

## 바이트 (전 → 후)

| 대상 | SKILL.md | references 합계 |
|---|---|---|
| dflow-wbs | 57,948 → 19,982 | 7,313 → 49,173 |
| dflow-wbs-nlevel | 17,673 → 7,887 | 26,015 → 37,082 |

## dflow-wbs 절 분류

| 절 | 분류 | 처리 |
|---|---|---|
| 인자 파싱·입력 파일·입력/출력 검증 | 매 호출 | 유지 (출력 검증의 툴체인 제약 표만 이동) |
| 전체 구조·계층·category·상태·depends·Task 분해·일정·Dev Config·실행 플로우 | 매 호출 | 유지 |
| 출력 형식 요약·명세 블록 파싱 계약 | 매 호출 | 유지 (규칙 4줄). 근거표는 output-format.md 로 이동 |
| 툴체인 제약 표 | 특정 상황 | → references/toolchain-constraints.md |
| D'Flow 연동 표기 (넣는 것·ID 불변·넣지 않는 것·바인딩) | 특정 상황 | → references/dflow-integration.md |
| 프로그램 리스트 입력 어댑터 | 특정 상황(`--programs`) | → references/program-list-adapter.md |
| 계약 Task 의 공유 파일 규칙 + 계약 전용 Task 관례 | 특정 상황(contract Task) | → references/contract-shared-file-rules.md |
| 엑셀 export | 특정 상황(`--export-xlsx`) | → references/xlsx-export.md |
| 성공 기준 | 특정 상황(자기 검수) | → references/success-criteria.md |
| 출력 형식 예시 골격 | 특정 상황 | → references/output-format.md 끝 |
| 머리말 환경 안내·dep-analysis 주의 | 특정 상황 | → references/environment-notes.md, toolchain-constraints.md 끝 |

## dflow-wbs-nlevel 절 분류

| 절 | 분류 | 처리 |
|---|---|---|
| 머리말·업로드 게이트·모드·조회 사슬·실행 플로우·업로드·자주 틀리는 것 | 매 호출 | 유지 |
| 계약 요약 §1~§5 | 특정 상황 | → references/contract-summary.md |
| 골격 정의 파일·methodology·wsf 표준 구성 | 특정 상황(`--skeleton`) | → references/skeleton-mode.md |
| PL 입력 파일 programs.* | 특정 상황 | → references/pl-programs-input.md |

## 외부 참조 (이 레인 밖)
- `.claude/skills/dflow-export/SKILL.md:20` 가 `dflow-wbs/SKILL.md §"D'Flow 프로젝트 바인딩"` 을 가리킴 → 새 위치 `dflow-wbs/references/dflow-integration.md` (다른 스킬이라 손대지 않음).
- wbs-web tests/skills 가 문장·경로를 검사하면 dn-wbsweb 레인이 갱신.
