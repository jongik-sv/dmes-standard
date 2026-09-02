# triggers — 레거시 트리거 DDL

여기에 레거시 트리거 DDL 을 넣으세요.
`analyze-trigger` 스킬이 `docs/external/{시스템명}/triggers/{TRIGGER}.sql` 형식을 기대합니다.

- 트리거 1개당 파일 1개, 평면 배치 (예: `DELETE_SAMPLE_ITEM_HISTORY.sql`)
- `analyze-table-schema` 는 이 폴더를 전수 탐색해 대상 테이블에 붙은 트리거를 찾습니다.
