# mdm/TSK-07-02 마루 데이터 조회·등록·수정·카테고리
> stage: as · category: dev · domain: fullstack · priority: high · model: sonnet
> prd-ref: [05 「화면」](design/basic/05-master-data.md) · [05 「추가 컬럼」](design/basic/05-master-data.md) · [05 「구조: 마루 데이터 → 항목 · 추가 컬럼 · 카테고리」](design/basic/05-master-data.md) · [05 「카테고리 정의 방식」](design/basic/05-master-data.md) · PRD FR-D1 · 시안: [05 「마루 데이터 조회·등록」](design/basic/html/05-master-data.html) · 시안: [05 「마루 데이터 수정」](design/basic/html/05-master-data.html) · 시안: [05 「카테고리 편집」](design/basic/html/05-master-data.html)
> entry-point: /portal → mdd/dataMng (메뉴: MDM > 마스터데이터 > 마루 데이터); /portal → mdd/dataEdit (메뉴: MDM > 마스터데이터 > 마루 데이터 수정); /portal → mdd/dataCateEdit (메뉴: MDM > 마스터데이터 > 카테고리 편집)
> depends: mdm/TSK-07-01, mdm/TSK-01-03, mdm/TSK-03-02

## 요구사항
- 조회(ID·이름·상태), 등록(MDM 원천만): TB_MDM_DATA(INUSE)+CATE BASE 한 트랜잭션
- 헤더·키 패턴 저장
- 라벨 1~10 저장, lvl_cnt 증감, 폐기 2단 확인
- REGEX(대상 KEY/LVL/ATTR)·TABLE(체크박스 소속 적용) 편집, 닫기·다시 열기(선분)
- 매칭 건수 미리보기

## API 스펙
OASIS 서비스 `dataMng` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `dataEdit` — `/api/mdm/oasis/{serviceId}/{action}`
OASIS 서비스 `dataCateEdit` — `/api/mdm/oasis/{serviceId}/{action}`

## 수용 기준
- [ ] 마루 코드와 ID 중복 거부
- [ ] 등록 후 수정 화면으로 이동
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataMng.spec.ts` 가 통과한다
- [ ] lvl_cnt 축소는 뒤 칸 값이 있는 행이 없을 때만
- [ ] DEPRECATED 후 저장 거부
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataEdit.spec.ts` 가 통과한다
- [ ] BASE 편집·닫기 불가
- [ ] 닫힌 카테고리는 소속 보존·판정 false
- [ ] 포털 메뉴에서 화면이 열리고 e2e `src/frontend/e2e/mdm-dataCateEdit.spec.ts` 가 통과한다
