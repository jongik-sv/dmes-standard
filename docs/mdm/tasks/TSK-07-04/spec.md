# mdm/TSK-07-04 항목 트리·CSV 업로드
> stage: as · category: dev · domain: fullstack · priority: high · model: sonnet
> prd-ref: [05 「구조: 마루 데이터 → 항목 · 추가 컬럼 · 카테고리」](design/basic/05-master-data.md) · [05 「저장 경로와 검증」](design/basic/05-master-data.md) · PRD FR-D2 · PRD FR-D3 · 시안: [05 「항목 관리 (ORG 트리)」](design/basic/html/05-master-data.html) · 시안: [05 「CSV 업로드」](design/basic/html/05-master-data.html)
> entry-point: /portal → mdd/dataItemMng (메뉴: MDM > 마스터데이터 > 항목 관리); /portal → mdd/dataCsvUploadPop (메뉴: MDM > 마스터데이터 > 항목 관리 > CSV 업로드)
> depends: mdm/TSK-07-01, mdm/TSK-01-03, mdm/TSK-07-03

## 요구사항
- lvl 트리 보기, 이 노드로 보기 필터 칩, 열린 행 필터
- UTF-8·RFC 4180, 열 이름 = 물리명, 검증 결과(INSERT/UPDATE/NONE·오류)
- 오류 0건일 때만 한 트랜잭션으로 저장

## API 스펙
OASIS 서비스 `dataItemMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `dataCsvUploadPop` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] ORG 샘플 트리가 `sql/04-hier-tree-sim.py` 결과와 일치
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataItemMng.spec.ts` 가 통과한다
- [ ] 같은 파일 재업로드 시 바뀐 행만 새 선분
- [ ] CSV 로 닫기 불가
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataCsvUploadPop.spec.ts` 가 통과한다
