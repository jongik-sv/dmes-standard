# TE-001 — 메뉴 필드 관리 팝업 조회 전멸 (`Bad value for type BigDecimal : N`)

- 일자: 2026-09-03
- 대상: `commMenuMng` / action `searchCmMenuFld` (메뉴 필드 관리 팝업)
- 상태: 해결

## 증상 (로그 원문)

```
ERROR c.d.oasis.service.CoreServiceStarter -
  Could not extract column [6] from JDBC ResultSet [Bad value for type BigDecimal : N] [n/a]
Caused by: java.sql.SQLException: Bad value for type BigDecimal : N
  at org.sqlite.jdbc3.JDBC3ResultSet.getBigDecimal(JDBC3ResultSet.java:169)
  at org.hibernate.type.descriptor.jdbc.DecimalJdbcType$2.doExtract(DecimalJdbcType.java:86)
```

화면에서는 팝업 그리드 `0건` + 오류 모달. HTTP 는 200 (OASIS 규약대로 `meta.success=false`).

## 원인

**2026-08-07 에 넣은 `CAST(... AS VARCHAR(20))` workaround 자체가 원인이었다.**

`SecMenuNativeRepository.searchMenuFldList()` 의 6번째 컬럼이
`CAST(MENU_VIEW_YN AS VARCHAR(20))` 이었다. sqlite-jdbc 는 **선언 타입이 없는 식(expression) 컬럼**의
JDBC 타입을 declared type 이 아니라 **현재(첫) 행의 값 타입**으로 추론한다.
본 테이블의 정렬 첫 행은 `mcm`(FULL_SEQ=1000000)이고 `MENU_VIEW_YN` 이 **NULL** 이라,
드라이버가 그 컬럼을 `Types.NUMERIC` 으로 보고했다.
→ Hibernate 가 `DecimalJdbcType` 을 선택 → 6번째 행(`cmz`, 값 `'N'`)에서 `getBigDecimal("N")` 폭발
→ 조회 전체 실패.

### 실측 근거 (sqlite-jdbc 3.50.3.0 직접 probe)

| SELECT 6번째 컬럼 | `getColumnType` | 의미 |
|---|---|---|
| `CAST(MENU_VIEW_YN AS VARCHAR(20))` | **2 (NUMERIC)** | 식 컬럼 → 첫 행 값(NULL)으로 추론 |
| `MENU_VIEW_YN` (선언 VARCHAR(1)) | **12 (VARCHAR)** | 선언 타입 그대로 |

데이터 (`TB_MCM_SEC_MENU_FLD` 8행): `mcm/cma/csa/cme/cmb` = NULL, `cmz` = `'N'`, `analog/anl` = `'Y'`.

## 해결

`CAST` 를 걷어내고 **`addScalar` 로 결과 타입을 고정**했다 (`SecMenuNativeRepository.searchMenuFldList()`).

```java
NativeQuery<Object[]> q = entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
q.addScalar("MENU_ID",        StandardBasicTypes.STRING)
 .addScalar("MENU_SEQ",       StandardBasicTypes.STRING)
 .addScalar("MENU_NM",        StandardBasicTypes.STRING)
 .addScalar("PARENT_MENU_ID", StandardBasicTypes.STRING)
 .addScalar("FULL_SEQ",       StandardBasicTypes.LONG)
 .addScalar("MENU_VIEW_YN",   StandardBasicTypes.STRING);
```

`addScalar` 는 ResultSet 메타데이터를 **아예 보지 않는다.** 방언·데이터 오염과 무관하게 타입이 고정되므로
CAST 가 원래 막으려던 문제(길이 1 VARCHAR → `Character` 추론 → `''` 행에서 `CoercionException`)도 함께 사라진다.

## 교훈

1. **`CAST` 는 타입 고정 수단이 아니다.** "드라이버가 그 식을 무엇으로 보고하느냐" 에 여전히 의존하고,
   sqlite-jdbc 에서는 오히려 선언 타입 정보를 **버리게** 만든다. native query 결과 타입을 확정해야 하면
   `addScalar` 를 쓴다.
2. **NULL 이 섞인 컬럼 + ORDER BY 는 조합 폭탄이다.** 정렬 순서가 바뀌어 NULL 행이 맨 앞에 오는 것만으로
   조회가 죽는다. 재현이 데이터·정렬 의존이라 "어제는 됐는데" 가 나온다.
3. 로그의 `column [6]` 은 **1-base ResultSet 인덱스**다. SELECT 목록 6번째를 바로 지목한다.

## 남은 위험 (미조치 — 의도적)

`searchCmMenu()` 도 같은 `CAST(A.USE_TP AS VARCHAR(20))` / `CAST(A.MENU_VIEW_YN AS VARCHAR(20))` 를 쓴다.
현재 `TB_MCM_SEC_MENU` 21행은 두 컬럼 모두 NULL 이 0건이라 드라이버가 TEXT(12) 로 보고해 **우연히 동작 중**이다.
해당 컬럼에 NULL 행이 하나라도 생기고 그 행이 `ORDER BY A.MENU_ID, A.MENU_SEQ` 상 첫 행이 되면
**본 건과 완전히 동일하게 죽는다.** 메인 그리드 16컬럼 전부를 `addScalar` 로 옮기는 작업이라
이번 변경 범위에서 분리했다.

## 정본 반영

- 코드 주석: `SecMenuNativeRepository.searchMenuFldList()` 본문에 원인·근거 기록.
- 본 문서가 이 저장소의 **첫 `docs/ai-build-log/` 기록**이다 (기존에 폴더가 없었음).
