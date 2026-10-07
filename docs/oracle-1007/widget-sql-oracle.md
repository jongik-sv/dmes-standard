# 로컬 쿼리 위젯 정의 SQL — SQLite → Oracle 변환표 (ora-mcm-core c3, 2026-10-07)

로컬 `mcm.db` 의 `TB_MCM_WIDGET_DEF` 에 있는 쿼리 위젯 6개(사용자가 화면에서 만든 데이터, 시드 아님)는 SQLite 문법이라 Oracle 로
옮기면 실행이 실패한다. 아래 Oracle 판으로 `CONFIG_JSON.sql` 만 바꿔 적재한다(그 밖의 설정 칸은 그대로).

확인 방법: 레인 PDB `L_ORA_MCM_CORE`(MCMAPUSER V1 적용)에 시험 행 3개를 넣고, `SqlGuard.check(…, ORACLE, 선언 조건)` 검사 →
`WidgetReadOnlyJdbc`(읽기 전용 트랜잭션) 안에서 `NamedParameterJdbcTemplate` 로 실행했다. 7개 모두 검사 통과·실행 성공.

바꾼 규칙:

| SQLite | Oracle |
|---|---|
| `DATE('now', 'localtime')` | `TRUNC(SYSDATE)`(컨테이너·운영 DB 시간대 KST) |
| `DATE('now', 'localtime', '-6 day')` | `TRUNC(SYSDATE) - 6` |
| `SUBSTR(STARTED_AT, 1, 16)`(일시 문자열 자르기) | `TO_CHAR(STARTED_AT, 'YYYY-MM-DD HH24:MI')` |
| `SUBSTR(STARTED_AT, 6, 5)` / `GROUP BY SUBSTR(STARTED_AT, 1, 10)` | `TO_CHAR(TRUNC(STARTED_AT), 'MM-DD')` / `GROUP BY TRUNC(STARTED_AT)` |
| `REPLACE(SUBSTR(STARTED_AT, 1, 10), '-', '') >= :fromDt` | `TO_CHAR(STARTED_AT, 'YYYYMMDD') >= :fromDt` |
| `LIMIT n` | `FETCH FIRST n ROWS ONLY` |
| `GROUP BY 1`(위치 번호) | 식을 그대로 다시 씀(Oracle 은 GROUP BY 위치 번호를 받지 않는다. ORDER BY 위치 번호는 된다) |
| `/ 60000.0` | `/ 60000`(Oracle NUMBER 나눗셈은 정수 버림이 없다) |

## 결과

| 위젯 ID | 이름 | 확인 결과(시험 행 3개) |
|---|---|---|
| def.fpkt65d4 | 오늘 화면 사용 요약(query-number) | 성공 4행 |
| def.ldj2hpgw | 내 최근 화면 사용(query-table) | 성공 3행 |
| def.lo41tduo | 화면 사용 순위(query-chart) | 성공 1행 |
| def.qcondsmp | 화면 사용 기록 검색(query-table, 조회 조건 4개) | 성공 3행(scope=MINE, minSec=10) |
| def.spzufhgo | 업무 영역별 사용 비율(query-chart) | 성공 1행 |
| def.ubb8dih0 | 일별 화면 사용 시간(query-chart) | 성공 3행 |
| (도움말 §9.3) | 자동 수집 예시 | 성공 1행 |

## Oracle SQL

### def.fpkt65d4

```sql
SELECT '사용 시간' AS LABEL, ROUND(COALESCE(SUM(DURATION_MS), 0) / 60000, 1) AS VAL, '분' AS UNIT
  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= TRUNC(SYSDATE)
UNION ALL
SELECT '사용자', COUNT(DISTINCT USER_ID), '명'
  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= TRUNC(SYSDATE)
UNION ALL
SELECT '연 화면', COUNT(DISTINCT PAGE_ID), '개'
  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= TRUNC(SYSDATE)
UNION ALL
SELECT '열람 횟수', COUNT(*), '회'
  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= TRUNC(SYSDATE)
```

### def.ldj2hpgw

```sql
SELECT TO_CHAR(l.STARTED_AT, 'YYYY-MM-DD HH24:MI') AS STARTED,
       COALESCE(o.OBJECT_NM, l.PAGE_ID) AS SCREEN_NM,
       ROUND(l.DURATION_MS / 1000) AS SEC
  FROM TB_SEC_SCREEN_USAGE_LOG l
  LEFT JOIN TB_MCM_SEC_OBJ o
    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)
 WHERE l.USER_ID = :userId
 ORDER BY l.STARTED_AT DESC
 FETCH FIRST 20 ROWS ONLY
```

### def.lo41tduo

```sql
SELECT COALESCE(o.OBJECT_NM, l.PAGE_ID) AS SCREEN_NM,
       ROUND(SUM(l.DURATION_MS) / 60000, 1) AS USE_MIN,
       COUNT(*) AS OPEN_CNT
  FROM TB_SEC_SCREEN_USAGE_LOG l
  LEFT JOIN TB_MCM_SEC_OBJ o
    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)
 WHERE l.STARTED_AT >= TRUNC(SYSDATE) - 6
 GROUP BY COALESCE(o.OBJECT_NM, l.PAGE_ID)
 ORDER BY USE_MIN DESC
 FETCH FIRST 10 ROWS ONLY
```

### def.qcondsmp

```sql
SELECT TO_CHAR(l.STARTED_AT, 'YYYY-MM-DD HH24:MI') AS STARTED,
       COALESCE(o.OBJECT_NM, l.PAGE_ID) AS SCREEN_NM,
       l.USER_ID AS USER_ID,
       ROUND(l.DURATION_MS / 1000) AS SEC
  FROM TB_SEC_SCREEN_USAGE_LOG l
  LEFT JOIN TB_MCM_SEC_OBJ o
    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)
 WHERE (:scope = 'ALL' OR l.USER_ID = :userId)
   AND (:screenNm IS NULL OR COALESCE(o.OBJECT_NM, l.PAGE_ID) LIKE '%' || :screenNm || '%')
   AND (:fromDt IS NULL OR l.STARTED_AT >= TO_DATE(:fromDt, 'YYYYMMDD'))
   AND (:minSec IS NULL OR l.DURATION_MS >= :minSec * 1000)
 ORDER BY l.STARTED_AT DESC
 FETCH FIRST 100 ROWS ONLY
```

### def.spzufhgo

```sql
SELECT CASE o.SYSTEM_CODE WHEN 'mcm' THEN '공통관리' WHEN 'mdm' THEN '마루 MDM' ELSE COALESCE(o.SYSTEM_CODE, '기타') END AS AREA,
       ROUND(SUM(l.DURATION_MS) / 60000, 1) AS USE_MIN
  FROM TB_SEC_SCREEN_USAGE_LOG l
  LEFT JOIN TB_MCM_SEC_OBJ o
    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)
 WHERE l.STARTED_AT >= TRUNC(SYSDATE) - 29
 GROUP BY CASE o.SYSTEM_CODE WHEN 'mcm' THEN '공통관리' WHEN 'mdm' THEN '마루 MDM' ELSE COALESCE(o.SYSTEM_CODE, '기타') END
 ORDER BY 2 DESC
```

### def.ubb8dih0

```sql
SELECT TO_CHAR(TRUNC(STARTED_AT), 'MM-DD') AS DAY,
       ROUND(SUM(DURATION_MS) / 60000, 1) AS USE_MIN
  FROM TB_SEC_SCREEN_USAGE_LOG
 WHERE STARTED_AT >= TRUNC(SYSDATE) - 13
 GROUP BY TRUNC(STARTED_AT)
 ORDER BY TRUNC(STARTED_AT)
```
