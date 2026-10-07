# ERD 조각 — widget-meta 레인 (2026-10-05)

조정 세션이 마감에 `docs/mcm/erd/csa-menu.dbml`·`csa-menu-tables.md` 에 합친다. 이 파일은 레인 조각이 정본이다.

## TB_MCM_WIDGET_DEF — 칸 추가 (2026-10-05 위젯 개선 §6 분류)

| 칸 | 형 | NULL | 설명 |
|---|---|---|---|
| `CATEGORY_CD` | VARCHAR(20) | NULL 허용 | 분류 — 공통코드 그룹 `WIDGET_CTG` 값. NULL 이면 코드 위젯은 코드 메타 `meta.category` 값, 정의 위젯은 분류 없음. 관리 화면 입력칸·목록 칸, 서랍 분류 묶음이 쓴다. |

- 엔티티: `WidgetDef.categoryCd`(`mcm-core/.../widget/def/entity/WidgetDef.java`). 로컬은 `ddl-auto: update` 로 생긴다.
- **개발계·운영계는 앱 배포 전에 먼저**: Oracle `ALTER TABLE MCMAPUSER.TB_MCM_WIDGET_DEF ADD (CATEGORY_CD VARCHAR2(20 CHAR))`, PostgreSQL `ALTER TABLE ... ADD COLUMN category_cd varchar(20)`(스펙 widget-admin-generic §17.2 TITLE 선례와 같은 절차).

## TB_MCM_WIDGET_DEF — 칸 추가 (2026-10-06 배치 옵션, widget-placement 레인)

| 칸 | 형 | NULL | 설명 |
|---|---|---|---|
| `PLACE_TP` | VARCHAR(1) | NULL 허용 | 배치 옵션. `W`=위젯 화면(보드)만, `B`=업무 화면(도구 창)만, `A`=둘 다. NULL 이면 유형 `floatable` 을 따른다(보드는 늘 허용, 도구 창은 floatable 일 때만). |

- 해석 규칙(shared `resolveWidgetPlacement`): 정의 값이 있으면 그 값, 없으면 floatable. `B`·`A` 는 floatable 과 상관없이 도구 창에 띄운다. 보드 서랍은 `B` 를 숨기고, 도구 메뉴는 `W` 를 숨긴다.
- 화면 계약: `WidgetMeta.placement`, `WidgetDefRow.placeTp`. 코드 위젯은 `widget.meta.ts` 에 `placement` 를 직접 둘 수 있다.
- 기존 행은 NULL 이므로 동작이 바뀌지 않는다. 알 수 없는 값은 NULL 로 본다.
- 엔티티: `WidgetDef.placeTp`. 저장 검증은 `CommWidgetMngService.save`(W·B·A 외 거절, 공백은 NULL), 응답 키는 `placeTp`(`WidgetDefService.list`·`CommWidgetMngService.search` 공통, 요약 쿼리 20번째 열).
- 로컬은 `ddl-auto: update` 로 생긴다. TB_MCM_WIDGET_DEF 는 Flyway 체인에 DDL 이 없어(V1 에도 없음) 마이그레이션 `ALTER` 를 두면 새 DB 에서 표가 없어 실패하므로 V19 를 쓰지 않았다(번호 V19 는 비어 있다).
- **개발계·운영계는 앱 배포 전에 먼저**: Oracle `ALTER TABLE MCMAPUSER.TB_MCM_WIDGET_DEF ADD (PLACE_TP VARCHAR2(1 CHAR))`, PostgreSQL `ALTER TABLE ... ADD COLUMN place_tp varchar(1)`(CATEGORY_CD 와 같은 절차).
- `db-snapshot/mcm/_schema.sql` 에 `PLACE_TP varchar(1)` 을 더했다. 데이터 파일은 칸 이름을 명시한 INSERT 라 그대로 복원된다.

## 공통코드 그룹 WIDGET_CTG (cactus LoV TB_SEC_CODE_*)

- 그룹 `WIDGET_CTG`(위젯 분류), 항목 시드: `COMMON`(공통)·`PROD`(생산)·`QUAL`(품질)·`LOGI`(물류)·`TOOL`(도구)·`INFO`(외부 정보).
- 시드: `mcm/api` 의 `WidgetCategoryCodeSeeder`(옛 SQLite `V18__insert_widget_category_code.sql` 은 `mcm-core/archive/db-migration/sqlite/` 에 보관 — 운영은 마스터코드 관리 화면에서 등록).
- 조회: `GET /api/mcm/lov/master/WIDGET_CTG`(LovController → MasterCodeProvider).
