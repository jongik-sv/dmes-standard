# mdm/TSK-04-05 초기 적재 — SAP 데이터 엘리먼트 후보 추출
> stage: as · category: dev · domain: backend · priority: high · model: opus
> prd-ref: [02 「TB_MDM_COLUMN_SYSTEM (컬럼 시스템 매핑)」](design/basic/02-term-domain-column.md) · PRD FR-A6 · PRD §5 「보류」
> entry-point: -
> depends: mdm/TSK-04-01

## 요구사항
- SAP 데이터 엘리먼트(DD03L 등) 추출 파일에서 용어·도메인·컬럼 매핑 후보 생성
- 미대응 필드 작업 목록 출력

## 제약
- 사전 수신 시스템 화면(`mdt/dictSystemMng`)과 변경분 배포는 보류(PRD §5)

## 수용 기준
- [ ] 샘플 추출 파일로 후보·미대응 목록이 생성된다
- [ ] 후보는 파일로 출력하고 자동 등록하지 않는다. 사람이 검토해 용어·도메인·컬럼 화면으로 등록한다
