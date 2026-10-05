# ERD 조각 — widget-meta 레인 (2026-10-05)

조정 세션이 마감에 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 합친다. 이 파일은 레인 조각이 정본이다.

## TB_MCM_WIDGET_DEF — 칸 추가 (2026-10-05 위젯 개선 §6 분류)

| 칸 | 형 | NULL | 설명 |
|---|---|---|---|
| `CATEGORY_CD` | VARCHAR(20) | NULL 허용 | 분류 — 공통코드 그룹 `WIDGET_CTG` 값. NULL 이면 코드 위젯은 코드 메타 `meta.category` 값, 정의 위젯은 분류 없음. 관리 화면 입력칸·목록 칸, 서랍 분류 묶음이 쓴다. |

- 엔티티: `WidgetDef.categoryCd`(`mcm-core/.../widget/def/entity/WidgetDef.java`). 로컬은 `ddl-auto: update` 로 생긴다.
- **개발계·운영계는 앱 배포 전에 먼저**: Oracle `ALTER TABLE MCMAPUSER.TB_MCM_WIDGET_DEF ADD (CATEGORY_CD VARCHAR2(20 CHAR))`, PostgreSQL `ALTER TABLE ... ADD COLUMN category_cd varchar(20)`(스펙 widget-admin-generic §17.2 TITLE 선례와 같은 절차).

## 공통코드 그룹 WIDGET_CTG (cactus LoV TB_SEC_CODE_*)

- 그룹 `WIDGET_CTG`(위젯 분류), 항목 시드: `COMMON`(공통)·`PROD`(생산)·`QUAL`(품질)·`LOGI`(물류)·`TOOL`(도구)·`INFO`(외부 정보).
- SQLite 시드: `mcm-core/src/main/resources/db/migration/sqlite/V18__insert_widget_category_code.sql`(V13 시드 원칙 — 운영은 마스터코드 관리 화면에서 등록).
- 조회: `GET /api/mcm/lov/master/WIDGET_CTG`(LovController → MasterCodeProvider).
