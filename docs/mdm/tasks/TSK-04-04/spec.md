# mdm/TSK-04-04 컬럼 사전 — 자동 생성·역분해·시스템 매핑
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [02 「TB_MDM_COLUMN (컬럼 사전)」](design/basic/02-term-domain-column.md) · [02 「TB_MDM_COLUMN_SYSTEM (컬럼 시스템 매핑)」](design/basic/02-term-domain-column.md) · [02 「컬럼명 속성」](design/basic/02-term-domain-column.md) · PRD FR-A3 · 시안: [02 「컬럼 사전 관리」](design/basic/html/02-term-domain-column.html) · 시안: [02 「컬럼 사전 관리 — 자동 생성 패널」](design/basic/html/02-term-domain-column.html)
> entry-point: /portal → mdt/columnMng (메뉴: MDM > 용어·도메인 > 컬럼 사전)
> depends: mdm/TSK-04-01, mdm/TSK-01-03

## 요구사항
- 컬럼 목록(실제 필드명으로도 검색), 상세 폼(표시명 긴24/중12/짧6, 도메인 필수, 참조 종류)
- 시스템별 실제 필드명 그리드(행 추가·삭제, transform·note)
- 한국어 논리명 → 최장 일치 분해 → 동의어 표준어 치환 → 물리명 미리보기(`***` 표시)
- `***` 클릭 → 유사어 확인 → 용어 인라인 등록 팝업(`mdt/termRegPop`)
- 도메인 추천·중복 검사, 역방향(물리명 → 논리명) 분해

## API 스펙
OASIS 서비스 `columnMng` — `/api/mdm/oasis/{serviceId}/{action}`

## 데이터 모델
TB_MDM_COLUMN, TB_MDM_COLUMN_SYSTEM

## 수용 기준
- [ ] 한 시스템 안 같은 필드명의 두 번째 등록 거부
- [ ] 라벨이 비면 더 긴 쪽으로 대체해 표시
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-columnMng.spec.ts` 가 통과한다
- [ ] `***` 가 남으면 저장 불가
- [ ] 권한 없는 사용자는 인라인 등록 불가
