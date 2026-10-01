# docs/external/SampleErp — 레거시 시스템 원천 자료

신규 프로젝트에서 분석 대상 레거시 시스템의 **원천 소스 덤프**를 넣는 자리다.
`SampleErp` 는 스탠드인 이름이며, 실제로는 시스템명을 그대로 쓴다
(예: `docs/external/{시스템명}/`).

`analyze-*` 계열 스킬은 이 디렉터리를 **정적 파일로 직접 읽는다.** DB 접속을 하지 않으므로,
아래 구조와 파일명 규약을 지키지 않으면 스킬이 대상을 찾지 못하고 즉시 종료한다.

원천 DBMS 는 이 README 에 `원천 DBMS: {Oracle|PostgreSQL|MSSQL|SQLite}` 형식의 한 줄로 적는다 — `analyze-*` 스킬이 이 줄을 먼저 읽어 SQL 방언을 정하고, 없으면 SQL 문법으로 추정하거나 사용자에게 묻는다.

## 디렉터리 구조와 파일명 규약

| 디렉터리 | 내용 | 파일명 형식 | 사용 스킬 |
|---|---|---|---|
| `tables/` | 테이블 DDL | `{TABLE}.sql` | `analyze-table-schema` |
| `procedures/` | 저장 프로시저 | `{NAME}.sql` | `analyze-plsql` |
| `functions/` | 함수 | `{NAME}.sql` | `analyze-plsql` |
| `triggers/` | 트리거 | `{TRIGGER}.sql` | `analyze-trigger` |
| `views/` | 뷰 | `{VIEW}.sql` | `analyze-view` |
| `screenCaptures/` | 화면 캡처 이미지 | 화면 ID 기준 폴더 | `analyze-service` (UI 분석) |

- 객체 1개당 파일 1개, 하위 폴더 없이 **평면(flat)** 배치.
- 파일명은 객체명과 대소문자까지 일치시킨다.
- 화면 소스(C# 등)는 별도로 두되, `analyze-service` 가 참조할 수 있는 경로를 유지한다.

## 산출물이 쌓이는 곳

분석 결과는 원천 자료와 섞이지 않도록 `orgErpReport/` 하위에 모인다.

```
docs/external/{시스템명}/orgErpReport/{영역}/{모듈ID}/DBMS/tables/{TABLE}_schema_analysis.md
docs/external/{시스템명}/orgErpReport/{영역}/{모듈ID}/screens/{화면ID}_{화면명}.md
```

> 각 `analyze-*` 스킬의 SKILL.md 에는 원본 프로젝트의 시스템명이 하드코딩되어 있다.
> 신규 프로젝트 착수 시 스킬 문서의 시스템명을 먼저 치환하고 사용한다.
