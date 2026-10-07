# sargable-sql 레인 정본 메모 (sargable-1008)

- 레인: sargable-sql / 브랜치 `fix/sargable-sql` / 기준 dev `3a1f1992a` / 조정 세션 `dmes-standard-d8`
- 규칙 정본: `docs/guide/Database/oracle-sql-rules.md` §3 「인덱스를 살리는 조건(sargable)」

## 1. 지금 상태

s1~s5 구현·시험·계획 확인·리뷰 반영이 끝났다. 남은 일은 머지 직전 dev 합치기와 전체 Oracle 시험, 머지 요청이다.

| 항목 | 커밋 | 내용 | 결과 |
|---|---|---|---|
| s1 | 2cdc88935, a624ee31e, c0231f425 | 위젯 `qcondsmp` 의 `TO_CHAR(l.STARTED_AT,'YYYYMMDD') >= :fromDt` → `l.STARTED_AT >= TO_DATE(:fromDt,'YYYYMMDD')`. json·db-snapshot CSV·docs·위젯 작성 가이드(두 예시)와 생성 번들 `widget-guide-content.ts` | 계획 확인(§3) |
| s2 | 3b2d92670 | `MasterRuleDataService`·`MasterRuleDataListService` 의 DATE 칸 LIKE. 숫자 앞 일치만 반열린 범위로(`common/util/DatePrefixRange`) | 단위 시험·Oracle 시험 통과 |
| s3 | bee60c7ab | `RuleMasterRepository.searchRuleMasterList` 의 `COALESCE(e.useTp,'N') <> 'N'` → `e.useTp <> 'N'` | `RuleMasterUseTpOraTest`(NULL·N·Y·이력행) 통과 |
| s4·s5 | 1440a8305, e9fd82a82, 3c840bc72 | 함수 기반 인덱스 V2 두 개(mcmapuser·mdm)와 `SecUserRepository.searchByFilter` 분기 | `SecUserSearchOraTest` 통과, 계획 확인(§3) |
| 리뷰 반영 | 8ba32ede4 | opus/high 리뷰 지적(주석·24시 시험·Oracle 날짜 LIKE 시험·mdm V2 주석·문서) | 통과 |

## 2. 결정과 판정 근거

### s2 날짜 LIKE (입력 형식별 동작)

값에서 구분자(`- : / . 공백`)를 지운 뒤 판정한다.

| 입력(구분자 제거 후) | 처리 | 이전과 결과 |
|---|---|---|
| 숫자 4·6·8·10·12·14자 + 끝의 `%` 하나 (`2026%`, `202610%`, `20261003%`, `2026-10-03 12%`) | `col >= TO_DATE(:vN) AND col < TO_DATE(:vNe)` (다음 단위 시작까지) | 같다 |
| 중간 일치(`%1003%`), `_` 패턴, 5자 같은 달력 단위 아닌 앞부분, `%` 가 둘 이상 | 현행 `TO_CHAR(col,'YYYYMMDDHH24MISS') LIKE :v` 유지(글자 비교가 필요해 함수가 남는다) | 같다 |
| 없는 날짜(`202613%`, `20260231%`, `2026100324%`), `0000%`, `9999%` | 현행 경로(0건) | 같다 |
| `%` 없는 완전한 날짜(`20261003`) | 현행 경로 | 0건 그대로 |

**결정 대기**: `%` 없는 완전한 날짜(8자 또는 `yyyy-MM-dd`)는 현행에서도 14자 문자열과 같지 않아 0건이다. 이를 그 하루의 범위로 바꾸면 사용자가 의도한 결과가 나오지만 의미가 바뀌므로 하지 않았다. 조정자가 사용자에게 올릴 결정이다.

### s4·s5 판정(L_MAIN 읽기 전용 실측, 2026-10-08)

| 칼럼 | 행 수 | 소문자 | 판정 |
|---|---|---|---|
| `TB_MCM_SEC_USER.USER_ID` | 11 | 5 | 칼럼 UPPER 를 뺄 수 없다 → 함수 기반 인덱스 |
| `TB_MCM_SEC_USER.USER_EMP_NO`·`USER_NM` | 11 | 0 | 대소문자 보장 없음 → 함수 기반 인덱스(같은 쿼리의 OR 세 칸이라 함께) |
| `TB_MCM_CODE_MASTER.CODE_ID` (MCMAPUSER 사본, `VI_MCM_CODE_ACCESS` 를 거친다) | 3 | 0 | 보장 없음 → 함수 기반 인덱스. MCM_SOURCE 원장은 건드리지 않는다 |
| `TB_MDM_COLUMN.PHYS_NAME` | 7,951 | 0 | 원형 유니크 인덱스는 있으나 `UPPER` 때문에 못 쓴다. 보장 없음 → 함수 기반 인덱스 |
| `TB_MDM_COLUMN_SYSTEM.PHYS_NAME` | 11,250 | 10 | 칼럼 UPPER 를 뺄 수 없다. `(SYSTEM_CODE, UPPER(PHYS_NAME))` 인덱스를 만들어도 IN 목록이 두 번째 칼럼이라 INLIST 반복을 못 해 기존 인덱스와 access 가 같아 **만들지 않았다** |

- 칼럼의 UPPER 를 빼는(바인드만 UPPER) 선택은 한 곳도 없다. 의미 변경은 없다.
- **`SecUserRepository` 분기가 필요했던 이유**: `(:pUserKey IS NULL OR :pUserKey = '' OR UPPER(칼럼) LIKE …)` 가드가 있으면 `USE_CONCAT` 힌트를 줘도 FULL SCAN 이다. 가드를 뺀 쿼리(검색어 있음)는 `USE_CONCAT` 에서 세 인덱스를 `CONCATENATION` 으로 쓴다. 그래서 `searchByFilter` 시그니처는 그대로 두고 default 메서드가 `searchAllByFilter`(검색어 없음)와 `searchByKeyAndFilter`(검색어 있음)로 나눈다. 호출부는 `CommUserMngQueryService:69` 하나이고 결과는 같다.
- **`DeptInfoRepository.searchByDeptKey` 는 고치지 않았다**: `UPPER(deptCd) LIKE 앞일치` 가 `UPPER(deptNm) LIKE 중간일치` 와 OR 이라 deptCd 만 고쳐도 인덱스를 못 쓴다(부서 마스터 7행). s6 에 올렸다.
- **지시서 정정**: s5 로 적힌 `MasterCodeSelPopService:105·109`, `masterCodeSelPop.xml:30·34`, `MasterCodeMngListService:97` 은 `%값%` 중간 일치라 s6 으로 옮겼다. 앞 일치는 `SecUserRepository` 3칸뿐이었다.

## 3. 실행 계획 확인(`EXPLAIN PLAN` + `DBMS_XPLAN`, 레인 PDB `L_SARGABLE`, L_MAIN 은 읽기 전용만)

표가 작아(행 수 수 건~1만) 옵티마이저가 FULL 을 고르는 곳은 힌트를 한 번 줘 「쓸 수 있는지」만 봤다. 제품 SQL 에 힌트는 없다.

| 항목 | 이전 Predicate | 이후 Predicate |
|---|---|---|
| s1 `STARTED_AT` | `filter(:FROMDT IS NULL OR TO_CHAR(INTERNAL_FUNCTION("L"."STARTED_AT"),'YYYYMMDD')>=:FROMDT)` | `access("L"."STARTED_AT">=TO_DATE(:FROMDT,'YYYYMMDD'))` (`:FROMDT IS NULL` 분기는 OR 확장으로 분리) |
| s2 `LIKE '202610%'` | `filter(TO_CHAR(INTERNAL_FUNCTION("STARTED_AT"),'YYYYMMDDHH24MISS') LIKE '202610%')` | `filter("STARTED_AT">=TIMESTAMP' 2026-10-01 00:00:00' AND "STARTED_AT"<TIMESTAMP' 2026-11-01 00:00:00')` |
| s3 `USE_TP` | `COALESCE("E"."USE_TP",'N')<>'N'` | `"E"."USE_TP"<>'N'` (`<>` 라 접근 경로는 FULL 그대로, 칼럼에서 함수만 걷음) |
| s4 `CODE_ID` | `UPPER("CODE_ID")=UPPER(:C)` 필터 | `INDEX RANGE SCAN IX_TB_MCM_CODE_MASTER_UP_ID`, `access(UPPER("CODE_ID")=UPPER(:C))` (힌트 없이 기본 계획) |
| s5 `SecUser` 검색어 있음 | 가드가 있는 쿼리: `TABLE ACCESS FULL`, `filter(:K IS NULL OR UPPER("USER_ID") LIKE …)` | 가드 없는 쿼리 + 힌트 `USE_CONCAT`: `CONCATENATION` + 인덱스 3개 `INDEX RANGE SCAN`, `access(UPPER("USER_NM") LIKE UPPER(:K||'%'))` 등. 표가 작아 기본 계획은 FULL |
| s4 `TB_MDM_COLUMN.PHYS_NAME IN` | `UPPER("PHYS_NAME")` 필터(원형 인덱스를 못 씀) | `INLIST ITERATOR` + `INDEX RANGE SCAN IX_TB_MDM_COLUMN_UP_PHYS`, `access(UPPER("PHYS_NAME")=:A OR …)` (힌트 없이 기본 계획) |

Hibernate 가 실제로 내는 SQL 로 확인했다: `upper(su1_0.USER_ID) like upper((?||'%'))` 는 인덱스 식 `UPPER("USER_ID")` 와 같다(`-Dhibernate.show_sql=true` 를 `JAVA_TOOL_OPTIONS` 로 시험 JVM 에 넘겨 얻음).

## 4. 시험

- 단위: `DatePrefixRangeTest`(3), `MasterRuleDataServiceTest`(13), `MasterRuleDataListServiceTest`(7)
- Oracle: `RuleMasterUseTpOraTest`, `SecUserSearchOraTest`(2), `MasterRuleDataDynamicTableOraTest`(17, 날짜 LIKE 시험 포함) — `-Pdmes.ora.test=clone`
- 전체 Oracle 시험은 머지 요청 직전 한 번(`heavy.sh`) 돌린다. 결과는 머지 요청에 적는다.

## 5. 후속과 알려진 위험

- **s6(고치지 않음)**: UPPER 중간 일치 54행(지시서 조사 32건 외에 나머지 포함)과 위젯 조인 SUBSTR 4건의 상한·다른 조건·위험 표는 `docs/sargable-1008/s6-follow-up-table.md`. 전체 읽기 위험이 「큼」 인 곳은 `mdm/lib/.../common/mastercode/MasterCodeRemoval.java:82` 한 곳(다섯 표 `UPPER(칼럼) LIKE '%MASTER%'`, 행 수 상한·다른 조건 없음, 코드 삭제 확인 때만 호출)이다.
- **TIMESTAMP WITH TIME ZONE 칸**: `MasterRuleColListRepository` 가 `DATA_TYPE LIKE 'TIMESTAMP%'` 를 모두 `DATE` 로 묶어, 시간대가 붙은 칸이면 날짜 LIKE 의 범위 경로가 세션 시간대에 따라 이전과 달라질 수 있다. 기준선에는 이런 칸이 없다. 동적 룰 표를 만들 때 시간대 붙은 칸을 쓰면 다시 본다.
- **위젯 `fromDt` 형**: 위젯 편집에서 `fromDt` 형을 date 에서 text 로 바꾸면 `TO_DATE` 에서 ORA-01861 이 난다(이전에는 글자 비교로 지나갔다). 현재 정의(date)는 영향 없다. `TB_MCM_WIDGET_DEF` 의 실행 중 DB 행은 CSV 를 다시 적재하기 전까지 옛 SQL 이다(L_MAIN 은 조정자가 이미 고쳤다).
- **V2 파일은 재실행에 안전하지 않다**(`CREATE INDEX` 만, 같은 이름·같은 식이면 ORA-00955·01408). 이 브랜치의 앞 판(mdm V2 가 인덱스 2개였던 `1440a8305`)을 적용한 PDB 는 `L_SARGABLE` 뿐이며 정리했다. **머지 직전 dev 최신에서 V 번호를 다시 확인한다.**
- `mdm` V2 의 `IX_TB_MDM_COLUMN_UP_PHYS`·`mcmapuser` V2 의 인덱스 이름은 모두 30자 이하다.
- 운영 DBA 적용: V 파일을 그대로 적용한다. 인덱스 생성은 짧은 잠금이 있다(표가 작다).
- `Widget-Authoring-Guide.md` 재생성은 `node scripts/gen-widget-guide.mjs` 로 했다. 이 워크트리에는 `node_modules` 가 없어 `widget-guide-sync` vitest 는 돌리지 못했다(생성기를 다시 돌려도 차이가 없음을 확인).

## 6. 마무리 상태

- 레인 PDB `L_SARGABLE`: 사용 후 닫고 지운다(drop 은 이 레인이 만든 것만).
- 남은 백그라운드: 0.
