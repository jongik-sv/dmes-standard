# views — 레거시 뷰 DDL

여기에 레거시 뷰 DDL 을 넣으세요.
`analyze-view` 스킬이 `docs/external/{시스템명}/views/{VIEW}.sql` 형식을 기대합니다.

- 뷰 1개당 파일 1개, 평면 배치 (예: `V_SAMPLE_STOCK.sql`)
- `analyze-table-schema` 는 이 폴더의 FROM/JOIN 절을 훑어 테이블 lineage 를 만듭니다.
