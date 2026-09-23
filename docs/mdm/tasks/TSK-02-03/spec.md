# mdm/TSK-02-03 영역별 DB(ERD) 설계 (02·03·04·05·06)
> stage: as · category: design · domain: database · priority: high · model: sonnet
> prd-ref: [02 「테이블 설계」](design/basic/02-term-domain-column.md) · [03 「테이블 설계」](design/basic/03-interface-layout.md) · [04 「테이블 설계」](design/basic/04-master-code-deploy-full.md) · [05 「테이블 설계」](design/basic/05-master-data.md) · [06 「테이블 설계」](design/basic/06-business-rule.md) · PRD FR-A · PRD FR-B · PRD FR-C · PRD FR-D · PRD FR-E
> entry-point: -
> depends: mdm/TSK-02-01

## 요구사항
- 테이블 TB_MDM_UNIT, TB_MDM_TERM, TB_MDM_DOMAIN, TB_MDM_COLUMN, TB_MDM_COLUMN_SYSTEM, TB_MDM_DICT_SEQ, TB_MDM_DICT_SYSTEM 의 두 방언 DDL 초안(명명 결정 반영)
- 원장 내부 FK·인덱스·CHECK, 하위 업무 테이블로의 FK 금지 확인
- 테이블 TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM (+ 헤더 적층·상수 재정의 테이블) 의 두 방언 DDL 초안(명명 결정 반영)
- 목업의 헤더 다중 적층(EAI 구간 + 시스템 구간)과 md 의 전문당 헤더 하나 중 확정, 상수 재정의 저장 테이블 설계
- 테이블 TB_MDM_CODE, TB_MDM_CODE_SYSTEM, TB_MDM_CODE_VER, TB_MDM_CODE_ITEM, TB_MDM_CODE_CATE, TB_MDM_CODE_CATE_ITEM, TB_MDM_CODE_RECV 의 두 방언 DDL 초안(명명 결정 반영)
- 테이블 TB_MDM_DATA, TB_MDM_DATA_SYSTEM, TB_MDM_DATA_ITEM, TB_MDM_DATA_CATE, TB_MDM_DATA_CATE_ITEM, TB_MDM_DATA_RECV, TB_MDM_DATA_RECV_ITEM 의 두 방언 DDL 초안(명명 결정 반영)
- 테이블 TB_MDM_RULE, TB_MDM_RULE_SYSTEM, TB_MDM_RULE_VER, TB_MDM_RULE_VAR, TB_MDM_RULE_ROW, TB_MDM_RULE_TEST_CASE, TB_MDM_RULE_SET, TB_MDM_RULE_RECV 의 두 방언 DDL 초안(명명 결정 반영)
- JSON 칼럼(cells, rule_ids) 방언 표현과 json_each/OPENJSON 참조 검사 쿼리
- 배포 대상(`*_SYSTEM`)·배포 순번(`TB_MDM_DICT_SEQ`, `chg_seq`)·수신 로그(`*_RECV*`) 표는 설계대로 두고 ERD 에 보류 표시(PRD §2 규칙 7)

## 데이터 모델
TB_MDM_UNIT, TB_MDM_TERM, TB_MDM_DOMAIN, TB_MDM_COLUMN, TB_MDM_COLUMN_SYSTEM, TB_MDM_DICT_SEQ, TB_MDM_DICT_SYSTEM
TB_MDM_EAI, TB_MDM_LAYOUT, TB_MDM_LAYOUT_ITEM (+ 헤더 적층·상수 재정의 테이블)
TB_MDM_CODE, TB_MDM_CODE_SYSTEM, TB_MDM_CODE_VER, TB_MDM_CODE_ITEM, TB_MDM_CODE_CATE, TB_MDM_CODE_CATE_ITEM, TB_MDM_CODE_RECV
TB_MDM_DATA, TB_MDM_DATA_SYSTEM, TB_MDM_DATA_ITEM, TB_MDM_DATA_CATE, TB_MDM_DATA_CATE_ITEM, TB_MDM_DATA_RECV, TB_MDM_DATA_RECV_ITEM
TB_MDM_RULE, TB_MDM_RULE_SYSTEM, TB_MDM_RULE_VER, TB_MDM_RULE_VAR, TB_MDM_RULE_ROW, TB_MDM_RULE_TEST_CASE, TB_MDM_RULE_SET, TB_MDM_RULE_RECV

## 수용 기준
- [ ] ERD(Mermaid 또는 dbml)와 DDL 초안을 `docs/mdm/erd/` 에 커밋
- [ ] 영역 계약 Task 가 그대로 마이그레이션으로 옮길 수 있는 수준
