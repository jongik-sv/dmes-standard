# mdm/TSK-05-02 전문 헤더·레이아웃 편집
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [03 「구조: 전문 = EAI 헤더 + 업무 본문」](design/basic/03-interface-layout.md) · [03 「항목 채움 방식(fill_kind)과 기본값」](design/basic/03-interface-layout.md) · [03 「자동 계산과 등록 검증」](design/basic/03-interface-layout.md) · [03 「단위와 표현 형식」](design/basic/03-interface-layout.md) · PRD FR-B1 · PRD FR-B2 · 시안: [03 「전문 헤더 정의」](design/basic/html/03-interface-layout.html) · 시안: [03 「전문 레이아웃 — 헤더 구성·상수 편집」](design/basic/html/03-interface-layout.html) · 시안: [03 「전문 레이아웃 — 본문 항목」](design/basic/html/03-interface-layout.html)
> entry-point: /portal → mdl/headerMng (메뉴: MDM > 레이아웃 > 전문 헤더 정의); /portal → mdl/layoutMng (메뉴: MDM > 레이아웃 > 전문 레이아웃)
> depends: mdm/TSK-05-01, mdm/TSK-01-03

## 요구사항
- 헤더 목록·상세(인코딩·패딩), 헤더 항목 그리드(컬럼 사전 검색으로 추가)
- 헤더 변경 시 사용 전문 전체를 영향도에 표시
- 전문 목록·기본 속성(송신·수신 시스템), 헤더 구성 그리드(순서, 구성 잠김)
- 상수 편집 팝업(헤더 기본값 vs 이 전문 값) — 기본값 3층 규칙
- 본문 항목 그리드(컬럼 사전 검색, fill_kind 선택, 드래그 순서)
- 항목 상세(파생 타입·단위·도메인, trans_unit/unit_item, 부호·0 채움·암묵 소수점, FILLER 길이)
- 오프셋·총 길이 즉시 재계산

## API 스펙
OASIS 서비스 `headerMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `layoutMng` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 컬럼 사전에 없는 항목 추가 불가
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-headerMng.spec.ts` 가 통과한다
- [ ] 헤더 구성·길이는 전문에서 편집 불가, 상수만 재정의
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-layoutMng.spec.ts` 가 통과한다
- [ ] fill_kind 별 닫힌 칸에 값이 있으면 거부
- [ ] M201 예시 총 길이 187바이트·본문 첫 오프셋 130 재현
