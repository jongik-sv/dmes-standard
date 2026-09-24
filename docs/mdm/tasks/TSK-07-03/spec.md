# mdm/TSK-07-03 항목 관리 — 저장 코어·목록·이력
> stage: as · category: dev · domain: fullstack · priority: high · model: opus
> prd-ref: [05 「저장 경로와 검증」](design/basic/05-master-data.md) · [05 「선분과 닫기」](design/basic/05-master-data.md) · [05 「화면」](design/basic/05-master-data.md) · PRD FR-D2, FR-D3 · PRD FR-D2 · PRD FR-D3 · 시안: [05 「항목 관리 (PORT·CUST)」](design/basic/html/05-master-data.html) · 시안: [05 「항목 이력」](design/basic/html/05-master-data.html)
> entry-point: /portal → mdd/dataItemMng (메뉴: MDM > 마스터데이터 > 항목 관리); /portal → mdd/dataHistory (메뉴: MDM > 마스터데이터 > 항목 이력)
> depends: mdm/TSK-07-01, mdm/TSK-01-03

## 요구사항
- 수정 = 옛 행 valid_to 닫기 + 같은 시각 새 행
- 닫기·다시 열기, 값이 같으면 새 행 없음
- 검사 1~7(DEPRECATED, 원천·경로, code_pattern, name, attr 라벨, 계층 일관성, TABLE 소속)
- TB_MDM_DATA 행 잠금으로 같은 마루 데이터의 동시 저장 직렬화. 배포 순번 발급은 보류(PRD §2 규칙 7)
- 서버 페이징 그리드(동적 lvl·attr 열), 인라인 편집·닫기·다시 열기·이력 링크
- row_version 충돌 안내
- 대상(항목/카테고리/소속)·키별 선분 타임라인, 닫힌 구간 표시

## API 스펙
OASIS 서비스 `dataItemMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `dataHistory` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 05 「예」 E1~E6·X1~X4 의 선분 결과 재현(순번 칸 제외)
- [ ] 동시 저장에서 선분 겹침 0
- [ ] 닫힌 키로 신규 등록 시 다시 열기 안내
- [ ] 다른 사용자 수정 충돌 시 재조회
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataItemMng.spec.ts` 가 통과한다
- [ ] 01 「이력 조회」 요구(생성·변경·소멸)를 충족
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataHistory.spec.ts` 가 통과한다
