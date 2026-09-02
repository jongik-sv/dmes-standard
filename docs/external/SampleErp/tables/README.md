# tables — 레거시 테이블 DDL

여기에 레거시 테이블 DDL 을 넣으세요.
`analyze-table-schema` 스킬이 `docs/external/{시스템명}/tables/{TABLE}.sql` 형식을 기대합니다.

- 테이블 1개당 파일 1개, 평면 배치 (예: `SAMPLE_ITEM.sql`)
- 파일명은 테이블명과 정확히 일치해야 합니다. 없으면 스킬이 즉시 종료합니다.
- CREATE TABLE 본문 + 제약(PK/FK/CHECK) + 인덱스를 함께 담습니다.
