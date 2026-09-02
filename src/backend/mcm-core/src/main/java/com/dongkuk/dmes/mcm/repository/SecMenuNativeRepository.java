/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecMenu (commMenuMng 화면) native query 어댑터 — selectCommMenuMng / selectMenuFldList(CTE) /
 *       selectMenuObj / selectMenuObjPop. 표준 CRUD 는 SecMenuRepository 사용.
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_MENU} + {@code TB_MCM_SEC_OBJ} + {@code TB_MCM_SEC_MENU_FLD} read-only
 * native query 어댑터 (commMenuMng 화면 owner — W2).
 *
 * <p>인용 SQL (분석리포트 §6 — Mapper.xml 8 SQL 중 본 화면 활성 4 read):
 * <ul>
 *   <li>{@link #searchCmMenu} — As-Is {@code selectCommMenuMng} (xml:7~44) — TB_MCM_SEC_MENU A
 *       LEFT JOIN TB_MCM_SEC_OBJ B + 4 if 분기 (To-Be 정책 #1: BIZ_SYSTEM_CODE 분기 제거).
 *       MENU_ID UPPER LIKE / p_MENU_ID 정확일치 / MENU_NM LIKE / USE_TP 일치.</li>
 *   <li>{@link #searchMenuFld} — As-Is {@code selectMenuFldList} (xml:125~140) —
 *       Oracle {@code CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID} → MSSQL CTE WITH RECURSIVE 변환.
 *       LEV 0-base 누적 + PATH 누적 컬럼으로 ORDER BY.</li>
 *   <li>{@link #searchObj} — As-Is {@code selectMenuObj} (xml:142~154) — TB_MCM_SEC_OBJ
 *       8 컬럼 (To-Be 정책 #1: BIZ_SYSTEM_CODE 제거 후).</li>
 *   <li>{@link #searchMenuObjPop} — As-Is {@code selectMenuObjPop} (xml:156~168) —
 *       TB_MCM_SEC_OBJ WHERE USE_TP='Y' AND (UPPER OBJECT_ID OR OBJECT_NM LIKE).</li>
 * </ul>
 *
 * <p>본 어댑터는 read-only — save / delete 는 {@link SecMenuRepository} 의 표준 CRUD 사용.
 *
 * <p>To-Be 정책 #1 (BIZ_SYSTEM_CODE 폐기) 반영 — selectCommMenuMng 파라미터 4 / selectMenuObj 응답 8 컬럼 /
 * selectMenuFldList 파라미터 0.
 */
@Repository
public class SecMenuNativeRepository {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * As-Is {@code selectCommMenuMng} (xml:7~44) MSSQL 변환 + 폴더 트리 후손 → leaf 화면 조회 (2026-06-02 R3 P1 round 3).
     *
     * <p>round 3 변경 (사용자 결정 2026-06-02):
     * <ul>
     *   <li><b>메인 그리드는 화면 (leaf) 만 표시</b> — 모듈/그룹 폴더 row 는 표시 ✗.</li>
     *   <li>TB_MCM_SEC_MENU 에는 화면 (leaf) 만 적재 — 모듈/그룹 폴더는 TB_MCM_SEC_MENU_FLD owner.</li>
     *   <li>p_MENU_ID = 트리 노드 (폴더) 클릭 시 전달되는 FLD.MENU_ID. CTE 로 FLD 후손 폴더 IDs 수집 →
     *       SEC_MENU.PARENT_MENU_ID IN (후손 폴더 IDs) 인 화면 SELECT.</li>
     * </ul>
     *
     * <p>As-Is WHERE 분기 매핑:
     * <ul>
     *   <li>{@code edt_MENU_ID} → {@code UPPER(A.MENU_ID) LIKE UPPER('%' || #{} || '%')} (xml:28)</li>
     *   <li>{@code p_MENU_ID}  → round 3: FLD CTE 후손 폴더 IN — SEC_MENU.PARENT_MENU_ID 매칭 (leaf 화면 SELECT).</li>
     *   <li>{@code edt_MENU_NM} → {@code A.MENU_NM LIKE '%' || #{} || '%'} (xml:35)</li>
     *   <li>{@code cbo_USE_TP}  → {@code A.USE_TP = #{}} (xml:38)</li>
     *   <li>~~{@code cbo_bizSystemCode} → {@code B.BIZ_SYSTEM_CODE = #{}} (xml:41)~~ — To-Be 폐기 (정책 #1)</li>
     * </ul>
     *
     * <p>p_MENU_ID 폴더 후손 CTE 정합 (round 3):
     * <ol>
     *   <li>anchor = {@code TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :pMenuId} (시작 폴더 — 1 행)</li>
     *   <li>recursive = {@code JOIN d ON f.PARENT_MENU_ID = d.MENU_ID} (FLD 자식 폴더 → 손자 폴더 → ...)</li>
     *   <li>최종 SELECT = {@code TB_MCM_SEC_MENU A WHERE A.PARENT_MENU_ID IN (FldDesc)} (leaf 화면만).</li>
     * </ol>
     *
     * <p>예: 트리에서 mcm 클릭 → FldDesc={mcm, cma, csa, cme} → SEC_MENU.PARENT_MENU_ID IN(cma,csa,cme) →
     * leaf 13 화면. csa 클릭 → FldDesc={csa} → leaf 8 화면. mcm 자체는 leaf ✗ 라 결과 미포함.
     *
     * <p>p_MENU_ID 가 비면 (FE 초기 진입 / 트리 미선택) — SEC_MENU 전체 SELECT (폴더 ✗ — SEC_MENU 가 leaf 만 보관).
     *
     * <p>SELECT 본 16 컬럼 (A.컬럼 15 + B.OBJECT_NM scalar) — To-Be 정책 #1: B.BIZ_SYSTEM_CODE 컬럼 제거.
     * ORDER BY A.MENU_ID, A.MENU_SEQ.
     *
     * <p><b>USE_TP / MENU_VIEW_YN 은 {@code CAST(... AS VARCHAR(20))} 으로 감싼다</b> (2026-08-07).
     * Hibernate 6 는 길이 1 인 VARCHAR 를 {@code Character} 로 추론하는데, 값이 {@code ''} 인 행이 하나라도
     * 섞이면 {@code CoercionException: value does not contain a character: ''} 로 <b>조회 전체가 실패</b>한다.
     * OASIS 는 이를 HTTP 200 + {@code meta.success=false} 로 돌려주므로 화면에서는 "저장/조회를 눌러도 아무 일이
     * 없는" 증상으로만 드러났다. 캐스팅으로 결과 타입을 {@code String} 에 고정해 데이터 오염에 견디게 한다.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmMenu(String edtMenuId, String pMenuId,
                                                  String edtMenuNm, String cboUseTp) {
        boolean sqlite = McmAuditStatementInspector.isSqlite();
        StringBuilder sql = new StringBuilder();
        boolean useDescendants = notBlank(pMenuId);
        if (useDescendants) {
            // round 3 — FLD 후손 폴더 수집 (CTE) → SEC_MENU leaf SELECT.
            // FldDesc anchor = TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :pMenuId (폴더 시작점).
            // FldDesc recursive = child FLD JOIN parent FLD (PARENT_MENU_ID = d.MENU_ID).
            // 최종 leaf 화면은 SEC_MENU.PARENT_MENU_ID IN (FldDesc.MENU_ID) — SEC_MENU 는 모두 leaf.
            // SQLite 재귀 CTE 는 RECURSIVE 키워드 명시(MSSQL 은 WITH 만 허용). schema 접두는 inspector 가 제거.
            sql.append(sqlite ? "WITH RECURSIVE FldDesc AS ( " : "WITH FldDesc AS ( ")
               .append("  SELECT MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD ")
               .append("   WHERE MENU_ID = :pMenuId ")
               .append("  UNION ALL ")
               .append("  SELECT f.MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD f ")
               .append("    JOIN FldDesc d ON f.PARENT_MENU_ID = d.MENU_ID ")
               .append(") ")
               .append("SELECT A.MENU_ID, A.MENU_SEQ, A.FULL_SEQ, A.MENU_NM, A.MENU_DESC, A.MENU_TP, ")
               .append("       A.OBJECT_ID, B.OBJECT_NM, CAST(A.USE_TP AS VARCHAR(20)), ")
               .append("       A.START_ACTIVE_DATE, A.END_ACTIVE_DATE, ")
               .append("       CAST(A.MENU_VIEW_YN AS VARCHAR(20)), A.PARENT_MENU_ID, ")
               .append("       A.MENU_PARAM1, A.MENU_PARAM2, A.MENU_PARAM3 ")
               .append("  FROM MCMAPUSER.TB_MCM_SEC_MENU A ")
               .append("  LEFT JOIN MCMAPUSER.TB_MCM_SEC_OBJ B ON A.OBJECT_ID = B.OBJECT_ID ")
               .append(" WHERE A.PARENT_MENU_ID IN (SELECT MENU_ID FROM FldDesc) ");
        } else {
            // round 3 — 기본 (트리 미선택 / 검색 only): SEC_MENU 전체 SELECT (폴더 ✗ — leaf 만 적재되어 있음).
            sql.append("SELECT A.MENU_ID, A.MENU_SEQ, A.FULL_SEQ, A.MENU_NM, A.MENU_DESC, A.MENU_TP, ")
               .append("       A.OBJECT_ID, B.OBJECT_NM, CAST(A.USE_TP AS VARCHAR(20)), ")
               .append("       A.START_ACTIVE_DATE, A.END_ACTIVE_DATE, ")
               .append("       CAST(A.MENU_VIEW_YN AS VARCHAR(20)), A.PARENT_MENU_ID, ")
               .append("       A.MENU_PARAM1, A.MENU_PARAM2, A.MENU_PARAM3 ")
               .append("  FROM MCMAPUSER.TB_MCM_SEC_MENU A ")
               .append("  LEFT JOIN MCMAPUSER.TB_MCM_SEC_OBJ B ON A.OBJECT_ID = B.OBJECT_ID ")
               .append(" WHERE 1 = 1 ");
        }
        if (notBlank(edtMenuId)) {
            sql.append(sqlite
                    ? " AND UPPER(A.MENU_ID) LIKE UPPER('%' || :edtMenuId || '%') "
                    : " AND UPPER(A.MENU_ID) LIKE UPPER(CONCAT('%', :edtMenuId, '%')) ");
        }
        if (notBlank(edtMenuNm)) {
            sql.append(sqlite
                    ? " AND A.MENU_NM LIKE '%' || :edtMenuNm || '%' "
                    : " AND A.MENU_NM LIKE CONCAT('%', :edtMenuNm, '%') ");
        }
        if (notBlank(cboUseTp)) {
            sql.append(" AND A.USE_TP = :cboUseTp ");
        }
        sql.append(" ORDER BY A.MENU_ID, A.MENU_SEQ");

        var q = entityManager.createNativeQuery(sql.toString());
        if (useDescendants) q.setParameter("pMenuId", pMenuId);
        if (notBlank(edtMenuId)) q.setParameter("edtMenuId", edtMenuId);
        if (notBlank(edtMenuNm)) q.setParameter("edtMenuNm", edtMenuNm);
        if (notBlank(cboUseTp)) q.setParameter("cboUseTp", cboUseTp);

        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_SEQ", row[1]);
            map.put("FULL_SEQ", row[2]);
            map.put("MENU_NM", row[3]);
            map.put("MENU_DESC", row[4]);
            map.put("MENU_TP", row[5]);
            map.put("OBJECT_ID", row[6]);
            map.put("OBJECT_NM", row[7]);
            map.put("USE_TP", row[8]);
            map.put("START_ACTIVE_DATE", row[9]);
            map.put("END_ACTIVE_DATE", row[10]);
            map.put("MENU_VIEW_YN", row[11]);
            map.put("PARENT_MENU_ID", row[12]);
            map.put("MENU_PARAM1", row[13]);
            map.put("MENU_PARAM2", row[14]);
            map.put("MENU_PARAM3", row[15]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectMenuFldList} (xml:125~140) — Oracle CONNECT BY → MSSQL CTE WITH RECURSIVE 변환.
     *
     * <p>변환 매핑 (정합 §F #1~#5):
     * <ul>
     *   <li>{@code LEVEL - 1 AS LEV} → CTE 누적 LEV 컬럼 (anchor=0, recursive=parent.LEV+1)</li>
     *   <li>{@code START WITH PARENT_MENU_ID IS NULL} → anchor member WHERE</li>
     *   <li>{@code CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID} → JOIN child ON child.PARENT_MENU_ID = parent.MENU_ID</li>
     *   <li>{@code SYS_CONNECT_BY_PATH(TO_CHAR(MENU_SEQ,'00000000'),'/')} → 누적 PATH 컬럼 (RIGHT 8자 zero-pad)</li>
     * </ul>
     *
     * <p>To-Be 정책 #1: As-Is {@code <if cbo_bizSystemCode>WHERE BIZ_SYSTEM_CODE = #{}</if>} (xml:132~134) 제거.
     * SELECT 5 컬럼 (LEV / MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuFld() {
        // 2026-06-04 — FULL_SEQ 컬럼 SELECT 추가 (폴더 트리 정렬 tie-break / FE buildMenuTree FULL_SEQ 활용 정합).
        boolean sqlite = McmAuditStatementInspector.isSqlite();
        // SQLite 는 RIGHT() 와 문자열 '+' 연결을 미지원 → SUBSTR(.., -8)(우측 8자) + || 로 분기. MSSQL 은 기존 RIGHT/CAST 유지.
        // 재귀 CTE 는 SQLite 에서 RECURSIVE 키워드 명시. schema 접두(MCMAPUSER.) 제거는 inspector.toSqlite 가 담당.
        String pathAnchor = sqlite
                ? "'/' || SUBSTR('00000000' || CAST(MENU_SEQ AS TEXT), -8)"
                : "CAST('/' + RIGHT('00000000' + CAST(MENU_SEQ AS VARCHAR(20)), 8) AS VARCHAR(4000))";
        String pathRecursive = sqlite
                ? "parent.PATH || '/' || SUBSTR('00000000' || CAST(child.MENU_SEQ AS TEXT), -8)"
                : "CAST(parent.PATH + '/' + RIGHT('00000000' + CAST(child.MENU_SEQ AS VARCHAR(20)), 8) AS VARCHAR(4000))";
        String cteKeyword = sqlite ? "WITH RECURSIVE FldTree AS ( " : "WITH FldTree AS ( ";
        String sql =
                cteKeyword +
                "  SELECT MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ, 0 AS LEV, " +
                "         " + pathAnchor + " AS PATH " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "   WHERE PARENT_MENU_ID IS NULL " +
                "  UNION ALL " +
                "  SELECT child.MENU_ID, child.MENU_SEQ, child.MENU_NM, child.PARENT_MENU_ID, child.FULL_SEQ, parent.LEV + 1 AS LEV, " +
                "         " + pathRecursive + " AS PATH " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD child " +
                "    JOIN FldTree parent ON child.PARENT_MENU_ID = parent.MENU_ID " +
                ") " +
                "SELECT LEV, MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ " +
                "  FROM FldTree " +
                " ORDER BY PATH, MENU_SEQ";

        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("LEV", row[0]);
            map.put("MENU_ID", row[1]);
            map.put("MENU_SEQ", row[2]);
            map.put("MENU_NM", row[3]);
            map.put("PARENT_MENU_ID", row[4]);
            map.put("FULL_SEQ", row[5]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectMenuObj} (xml:142~154) — TB_MCM_SEC_OBJ WHERE OBJECT_ID=#{} 단건 검색.
     *
     * <p>As-Is SELECT 9 컬럼 → To-Be 8 컬럼 (BIZ_SYSTEM_CODE 제거 — 정책 #1).
     * 잔존 = SYSTEM_CODE / OBJECT_TYPE / SERVICE / USE_TP / FORM_URL / PARAM /
     * START_ACTIVE_DATE / END_ACTIVE_DATE.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchObj(String objectId) {
        String sql =
                "SELECT SYSTEM_CODE, OBJECT_TYPE, SERVICE, CAST(USE_TP AS VARCHAR(20)), FORM_URL, PARAM, " +
                "       START_ACTIVE_DATE, END_ACTIVE_DATE " +
                "  FROM MCMAPUSER.TB_MCM_SEC_OBJ " +
                " WHERE OBJECT_ID = :objectId";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("objectId", objectId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("SYSTEM_CODE", row[0]);
            map.put("OBJECT_TYPE", row[1]);
            map.put("SERVICE", row[2]);
            map.put("USE_TP", row[3]);
            map.put("FORM_URL", row[4]);
            map.put("PARAM", row[5]);
            map.put("START_ACTIVE_DATE", row[6]);
            map.put("END_ACTIVE_DATE", row[7]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectMenuObjPop} (xml:156~168) — TB_MCM_SEC_OBJ
     * WHERE USE_TP='Y' AND (UPPER OBJECT_ID LIKE OR UPPER OBJECT_NM LIKE).
     *
     * <p>SELECT 6 컬럼 (OBJECT_ID / OBJECT_NM / SERVICE / FORM_URL / PARAM / PARENT_MENU_ID).
     * Oracle {@code ||} 결합 → MSSQL CONCAT (정합 §F #7).
     *
     * <p>2026-06-04 round 5 — PARENT_MENU_ID 컬럼 추가 (사용자 결정):
     * <ul>
     *   <li>FE OBJECT LoV 모달에서 행 선택 시 OBJECT_ID + PARENT_MENU_ID (상위 폴더) 자동 세트 요구.</li>
     *   <li>PARENT_MENU_ID 는 {@code TB_MCM_SEC_MENU} 에 기등록된 (OBJECT_ID 가 이미 다른 메뉴에 묶인 경우의)
     *       그룹 폴더 ID. {@code commObjMng} 의 {@code SecObjRepository.findOneParentMenuIdByObjectId}
     *       와 동일 패턴 — {@code TOP 1} 로 임의 1행 가져온다.</li>
     *   <li>OBJECT 가 어떤 메뉴에도 매핑 안 됐으면 LEFT JOIN 결과 NULL — FE 는 빈 문자열로 처리.</li>
     * </ul>
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuObjPop(String edtObjectId) {
        boolean sqlite = McmAuditStatementInspector.isSqlite();
        // 상관 subquery 의 TOP 1 → SQLite 는 LIMIT 1. CONCAT → SQLite 는 || 분기. MSSQL 은 기존 유지.
        String parentSub = sqlite
                ? "(SELECT M.PARENT_MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU M WHERE M.OBJECT_ID = O.OBJECT_ID LIMIT 1)"
                : "(SELECT TOP 1 M.PARENT_MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU M WHERE M.OBJECT_ID = O.OBJECT_ID)";
        StringBuilder sql = new StringBuilder()
                .append("SELECT O.OBJECT_ID, O.OBJECT_NM, O.SERVICE, O.FORM_URL, O.PARAM, ")
                .append("       ").append(parentSub).append(" AS PARENT_MENU_ID ")
                .append("  FROM MCMAPUSER.TB_MCM_SEC_OBJ O ")
                .append(" WHERE O.USE_TP = 'Y' ");
        if (notBlank(edtObjectId)) {
            sql.append(sqlite
                    ? "   AND (UPPER(O.OBJECT_ID) LIKE UPPER('%' || :edtObjectId || '%') OR UPPER(O.OBJECT_NM) LIKE UPPER('%' || :edtObjectId || '%')) "
                    : "   AND (UPPER(O.OBJECT_ID) LIKE UPPER(CONCAT('%', :edtObjectId, '%')) OR UPPER(O.OBJECT_NM) LIKE UPPER(CONCAT('%', :edtObjectId, '%'))) ");
        }
        sql.append(" ORDER BY O.OBJECT_ID");

        var q = entityManager.createNativeQuery(sql.toString());
        if (notBlank(edtObjectId)) q.setParameter("edtObjectId", edtObjectId);

        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("OBJECT_ID", row[0]);
            map.put("OBJECT_NM", row[1]);
            map.put("SERVICE", row[2]);
            map.put("FORM_URL", row[3]);
            map.put("PARAM", row[4]);
            map.put("PARENT_MENU_ID", row[5]);
            out.add(map);
        }
        return out;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * 2026-06-04 사용자 지시 — commMenuMng "메뉴 필드 관리" 팝업 SEARCH 어댑터.
     *
     * <p>TB_MCM_SEC_MENU_FLD 의 본 4 컬럼 + FULL_SEQ + MENU_VIEW_YN 반환 (audit 컬럼은 본 화면 책임 ✗).
     * 트리 정렬 정합: MENU_SEQ asc (numeric — VARCHAR 이지만 zero-pad 시 string 비교 OK).
     *
     * <p>2026-08-14 — {@code MENU_VIEW_YN}(폴더 표시/미표시) 을 본 SELECT 로 흡수했다. 직전에는
     * 화면 패키지의 별도 어댑터가 전건 맵을 따로 읽어 결과에 덧입혔는데, 같은 테이블을 두 번 읽을
     * 이유가 없다. 값 도메인은 {@code 'Y'}(표시) / {@code 'N'}(미표시) 2 값이고,
     * <b>NULL 은 표시</b>로 취급한다 (사이드바 필터 {@code SecUserService} 가 {@code 'N'} 일 때만 숨김).
     * 그리드 표시용 정규화(NULL·빈 문자열 → {@code 'Y'})는 호출부(Service) 책임이다.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuFldList() {
        // 2026-06-04 사용자 지시 — FULL_SEQ 컬럼 표시 (메뉴 필드 관리 read-only 컬럼).
        // FULL_SEQ 인코딩 (모듈 백만 / 그룹 만) 은 recomputeMenuFullSeq() 가 저장 시 자동 부여.
        // ORDER BY 도 FULL_SEQ 우선 (인코딩 = 트리 표시 순서) → null(미부여) 행은 말미.
        //
        // MENU_VIEW_YN 은 searchCmMenu 와 동일하게 CAST(... AS VARCHAR(20)) 로 감싼다 (본 클래스 javadoc 참조).
        //   Hibernate 6 는 length=1 VARCHAR 를 Character 로 추론하므로, 값이 '' 인 행이 하나라도 섞이면
        //   CoercionException 으로 조회 전체가 실패한다. 게다가 DataInitializer.normalizeSecMenuCharColumns
        //   의 자가치유 대상은 TB_MCM_SEC_MENU 뿐이라 본 FLD 테이블은 '' 오염이 남아 있을 수 있다.
        String sql =
                "SELECT MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, FULL_SEQ, " +
                "       CAST(MENU_VIEW_YN AS VARCHAR(20)) " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                " ORDER BY CASE WHEN FULL_SEQ IS NULL THEN 1 ELSE 0 END, FULL_SEQ, MENU_SEQ, MENU_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_SEQ", row[1]);
            map.put("MENU_NM", row[2]);
            map.put("PARENT_MENU_ID", row[3]);
            map.put("FULL_SEQ", row[4]);
            map.put("MENU_VIEW_YN", row[5]);
            out.add(map);
        }
        return out;
    }

    /**
     * 신규 row INSERT (PK 충돌 시 RuntimeException). batch save 의 inserted 분기에서 호출.
     *
     * @param menuViewYn {@code 'Y'}(표시) / {@code 'N'}(미표시). null 이면 {@code 'Y'} 로 적재한다 —
     *                   신규 행에 NULL 을 남기지 않기 위함이다. 호출부에서 정규화 완료된 값을 넘길 것
     *                   ({@code ''} 가 VARCHAR(1) 에 도달하면 Hibernate Character 변환에서
     *                   CoercionException 으로 화면이 통째로 죽는다).
     */
    public int insertMenuFld(String menuId, String menuSeq, String menuNm, String parentMenuId,
                             String menuViewYn) {
        String sql =
                "INSERT INTO MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "(MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, MENU_VIEW_YN) " +
                "VALUES (:menuId, :menuSeq, :menuNm, :parentMenuId, :menuViewYn)";
        var q = entityManager.createNativeQuery(sql);
        q.setParameter("menuId", menuId);
        q.setParameter("menuSeq", menuSeq);
        q.setParameter("menuNm", menuNm);
        q.setParameter("parentMenuId", parentMenuId != null && !parentMenuId.isBlank() ? parentMenuId : null);
        q.setParameter("menuViewYn", "N".equalsIgnoreCase(menuViewYn) ? "N" : "Y");
        return q.executeUpdate();
    }

    /**
     * updated 분기 — MENU_ID 기준 UPDATE.
     *
     * @param menuViewYn {@code 'Y'} / {@code 'N'}. <b>null 이면 SET 절에서 제외</b>해 DB 값을 보존한다 —
     *                   호출부 row 에 키 자체가 실려오지 않은 경우(구 FE·타 호출부) 기본값 {@code 'Y'} 로
     *                   덮어써서 운영자가 설정해 둔 {@code 'N'} 을 되돌리는 사고를 막기 위함이다.
     */
    public int updateMenuFld(String menuId, String menuSeq, String menuNm, String parentMenuId,
                             String menuViewYn) {
        // menuViewYn == null 은 "미지정" = DB 보존. COALESCE(:p, MENU_VIEW_YN) 대신 SET 절을 동적으로
        // 구성하는 이유 = native query 에 null 파라미터를 바인딩하면 타입 추론이 방언별로 갈리기 때문이다.
        String sql =
                "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "   SET MENU_SEQ = :menuSeq, MENU_NM = :menuNm, PARENT_MENU_ID = :parentMenuId " +
                (menuViewYn != null ? "     , MENU_VIEW_YN = :menuViewYn " : "") +
                " WHERE MENU_ID = :menuId";
        var q = entityManager.createNativeQuery(sql);
        q.setParameter("menuId", menuId);
        q.setParameter("menuSeq", menuSeq);
        q.setParameter("menuNm", menuNm);
        q.setParameter("parentMenuId", parentMenuId != null && !parentMenuId.isBlank() ? parentMenuId : null);
        if (menuViewYn != null) {
            q.setParameter("menuViewYn", "N".equalsIgnoreCase(menuViewYn) ? "N" : "Y");
        }
        return q.executeUpdate();
    }

    /** deleted 분기 — MENU_ID 기준 DELETE. cycle guard: 본 row 를 PARENT_MENU_ID 로 참조하는 자식 존재 시 거부. */
    public int deleteMenuFld(String menuId) {
        // 자식 존재 가드 (parent → children FK 가 본 테이블 자기참조)
        @SuppressWarnings("unchecked")
        List<Object> childCount = entityManager.createNativeQuery(
                "SELECT COUNT(1) FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE PARENT_MENU_ID = :menuId")
                .setParameter("menuId", menuId).getResultList();
        long cnt = childCount.isEmpty() ? 0 : ((Number) childCount.get(0)).longValue();
        if (cnt > 0) {
            throw new IllegalStateException("MENU_ID='" + menuId + "' 는 하위 폴더 " + cnt + " 건이 있어 삭제 불가합니다.");
        }
        String sql = "DELETE FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :menuId";
        return entityManager.createNativeQuery(sql).setParameter("menuId", menuId).executeUpdate();
    }

    // ────────────────────────────────────────────────────────────────
    // 2026-06-04 사용자 지시 — FULL_SEQ 7자리 인코딩 전체 재계산 (멱등)
    // ────────────────────────────────────────────────────────────────

    /**
     * 메뉴 트리 FULL_SEQ 7자리 인코딩 전체 재계산 (멱등). [[reference_full_seq_encoding]] / DataInitializer R3 정합.
     *
     * <p>인코딩 자리값:
     * <ul>
     *   <li><b>모듈</b> ({@code TB_MCM_SEC_MENU_FLD}, PARENT_MENU_ID IS NULL): {@code i × 1,000,000} (i = 1..9)</li>
     *   <li><b>그룹 폴더</b> ({@code TB_MCM_SEC_MENU_FLD}, PARENT 존재): {@code 부모BASE + j × 10,000} (j = 1..99)</li>
     *   <li><b>화면</b> ({@code TB_MCM_SEC_MENU}, PARENT_MENU_ID = 그룹 폴더 MENU_ID): {@code 그룹BASE + 100 + k × 10} (k = 0..89)</li>
     * </ul>
     *
     * <p>정렬 키 = (기존 FULL_SEQ asc, null 말미) → (MENU_ID asc). 기존 행의 상대 순서를 보존하면서
     * 신규(미부여=null) 행을 말미에 append. 따라서 현 시드 데이터(mcm/cma/csa/cme + leaf 13)에 대해 멱등.
     *
     * <p>{@code saveCmMenu} / {@code saveCmMenuFld} 의 CRUD 직후 · 재조회 직전에 호출 →
     * 응답 dataset 이 항상 최신 FULL_SEQ 를 반영. 사용자는 FULL_SEQ 를 직접 입력하지 않는다(자동 부여).
     *
     * <p>FLD 테이블 FULL_SEQ = NUMERIC(10,0) → Long 저장. SEC_MENU FULL_SEQ = VARCHAR(30) → 문자열 저장.
     * 시작 시 {@link EntityManager#flush()} 로 직전 JPA save() 의 pending insert 를 DB 반영 후 native SELECT.
     *
     * <p>그룹 폴더에 매칭되지 않는 화면(orphan — PARENT 가 폴더 MENU_ID 가 아닌 경우)은 FULL_SEQ 미변경 skip.
     */
    public void recomputeMenuFullSeq() {
        // 직전 saveCmMenu 의 JPA save() pending insert/update 를 DB 에 flush — 아래 native SELECT 가 최신 행을 본다.
        entityManager.flush();

        // ── 1) 폴더 로드 (PARENT 별 group) ──
        @SuppressWarnings("unchecked")
        List<Object[]> fldRows = entityManager.createNativeQuery(
                "SELECT MENU_ID, PARENT_MENU_ID, FULL_SEQ, MENU_SEQ FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD").getResultList();
        // parent("" = root) → [{menuId, fullSeqStr, menuSeq}]
        Map<String, List<String[]>> fldByParent = new LinkedHashMap<>();
        for (Object[] r : fldRows) {
            String menuId = strOf(r[0]);
            if (menuId == null || menuId.isBlank()) continue;
            String parent = r[1] == null ? "" : strOf(r[1]).trim();
            String fs = r[2] == null ? null : strOf(r[2]);
            String ms = r[3] == null ? null : strOf(r[3]);
            fldByParent.computeIfAbsent(parent, k -> new ArrayList<>()).add(new String[]{menuId, fs, ms});
        }
        // 정렬 비교자 — 폴더(모듈/그룹) 표시 순서는 MENU_SEQ(zero-pad VARCHAR, 사용자 편집 필드) asc 기준.
        // null/blank 는 말미(99999999), tie-break MENU_ID asc.
        // 2026-06-10: 기존 "FULL_SEQ 자기참조" 정렬은 MENU_SEQ 를 무시해 사용자가 MENU_SEQ 를 바꿔도
        //   순서가 안 바뀌는 문제가 있어 MENU_SEQ 기준으로 변경. (FULL_SEQ 는 본 재계산이 트리 위치로 재부여.)
        Comparator<String[]> byMenuSeqThenId = (a, b) -> {
            int c = compareMenuSeq(a[2], b[2]);
            if (c != 0) return c;
            return a[0].compareTo(b[0]);
        };

        Map<String, Long> folderBase = new HashMap<>(); // menuId → 부여된 FULL_SEQ

        // ── 2) 모듈 (root, PARENT null) — i × 1,000,000 ──
        List<String[]> roots = fldByParent.getOrDefault("", new ArrayList<>());
        roots.sort(byMenuSeqThenId);
        Deque<String> queue = new ArrayDeque<>();
        long moduleOrd = 0;
        for (String[] m : roots) {
            moduleOrd++;
            long base = moduleOrd * 1_000_000L;
            folderBase.put(m[0], base);
            updateFldFullSeq(m[0], base);
            queue.add(m[0]);
        }

        // ── 3) 그룹(+ 더 깊은 폴더) — BFS, 부모BASE + j × 10,000 ──
        while (!queue.isEmpty()) {
            String parentId = queue.poll();
            long parentBase = folderBase.getOrDefault(parentId, 0L);
            List<String[]> children = fldByParent.getOrDefault(parentId, new ArrayList<>());
            children.sort(byMenuSeqThenId);
            long ord = 0;
            for (String[] c : children) {
                ord++;
                long base = parentBase + ord * 10_000L;
                folderBase.put(c[0], base);
                updateFldFullSeq(c[0], base);
                queue.add(c[0]);
            }
        }

        // ── 4) 화면 (SEC_MENU) — 그룹BASE + 100 + k × 10 ──
        @SuppressWarnings("unchecked")
        List<Object[]> menuRows = entityManager.createNativeQuery(
                "SELECT MENU_ID, MENU_SEQ, PARENT_MENU_ID, FULL_SEQ FROM MCMAPUSER.TB_MCM_SEC_MENU").getResultList();
        // parent → [{menuId, menuSeq, fullSeqStr}]
        Map<String, List<String[]>> menuByParent = new LinkedHashMap<>();
        for (Object[] r : menuRows) {
            String menuId = strOf(r[0]);
            if (menuId == null || menuId.isBlank()) continue;
            String menuSeq = strOf(r[1]);
            String parent = r[2] == null ? "" : strOf(r[2]).trim();
            String fs = r[3] == null ? null : strOf(r[3]);
            menuByParent.computeIfAbsent(parent, k -> new ArrayList<>()).add(new String[]{menuId, menuSeq, fs});
        }
        // 화면(leaf) 정렬 — 1순위 MENU_SEQ(사용자가 상세폼 "메뉴 순서" 에서 편집하는 필드) asc,
        //   2순위 기존 FULL_SEQ asc(동순번일 때 기존 상대 순서 보존), 최종 tie-break MENU_ID asc.
        // 2026-08-07: 폴더는 2026-06-10 에 MENU_SEQ 기준으로 바꿨지만 화면은 "기존 FULL_SEQ" 만 보고 있어,
        //   사용자가 화면의 메뉴 순서를 바꿔도 재계산 결과가 그대로라 포털 사이드바 순서가 변하지 않았다
        //   (사이드바 정렬 키가 곧 FULL_SEQ 이므로 — SecUserService.sortTree). 폴더와 규칙을 일치시킨다.
        Comparator<String[]> menuByMenuSeqThenFullSeq = (a, b) -> {
            int c = compareMenuSeq(a[1], b[1]);
            if (c != 0) return c;
            Long fa = parseLongOrNull(a[2]);
            Long fb = parseLongOrNull(b[2]);
            if (fa != null && fb != null && !fa.equals(fb)) return Long.compare(fa, fb);
            if (fa == null && fb != null) return 1;
            if (fa != null && fb == null) return -1;
            return a[0].compareTo(b[0]);
        };
        for (Map.Entry<String, List<String[]>> e : menuByParent.entrySet()) {
            Long groupBase = folderBase.get(e.getKey());
            if (groupBase == null) continue; // orphan — 그룹 폴더 미매칭 → FULL_SEQ 미변경
            List<String[]> screens = e.getValue();
            screens.sort(menuByMenuSeqThenFullSeq);
            long k = 0;
            for (String[] s : screens) {
                long fs = groupBase + 100 + k * 10;
                k++;
                updateMenuFullSeq(s[0], String.valueOf(fs));
            }
        }
    }

    /**
     * MENU_SEQ 두 값의 표시 순서 비교 — 폴더·화면 공통 (2026-08-07).
     *
     * <p>MENU_SEQ 는 화면 저장 경로에서만 8자리 zero-pad 되고({@code CommMenuMngService.lpad8})
     * 시드 데이터에는 {@code "001"} / {@code "3010140"} 처럼 자릿수가 섞여 있다. 문자열 비교로는
     * {@code "9" > "10"} 이 되어 순서가 뒤집히므로 <b>숫자로 비교</b>한다.
     * 숫자가 아니거나 비어 있으면 말미로 보내고, 둘 다 비숫자면 문자열 비교로 폴백한다.
     */
    private static int compareMenuSeq(String a, String b) {
        Long na = parseLongOrNull(a);
        Long nb = parseLongOrNull(b);
        if (na != null && nb != null) return Long.compare(na, nb);
        if (na != null) return -1;   // 숫자가 앞, 비숫자/blank 가 뒤
        if (nb != null) return 1;
        String sa = (a == null) ? "" : a.trim();
        String sb = (b == null) ? "" : b.trim();
        return sa.compareTo(sb);
    }

    /** FLD 폴더 1행 FULL_SEQ (NUMERIC) UPDATE. */
    private void updateFldFullSeq(String menuId, long fullSeq) {
        entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_MENU_FLD SET FULL_SEQ = :fs WHERE MENU_ID = :id")
                .setParameter("fs", fullSeq)
                .setParameter("id", menuId)
                .executeUpdate();
    }

    /** 화면 1행 FULL_SEQ (VARCHAR) UPDATE — PK = MENU_ID 단독 (2026-06-05). */
    private void updateMenuFullSeq(String menuId, String fullSeq) {
        entityManager.createNativeQuery(
                "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET FULL_SEQ = :fs WHERE MENU_ID = :id")
                .setParameter("fs", fullSeq)
                .setParameter("id", menuId)
                .executeUpdate();
    }

    private static String strOf(Object o) { return o == null ? null : String.valueOf(o); }

    /** 숫자 파싱 (소수점 포함 NUMERIC 문자열 "1010000.0" 도 허용). 실패 시 null. */
    private static Long parseLongOrNull(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            String t = s.trim();
            int dot = t.indexOf('.');
            if (dot >= 0) t = t.substring(0, dot);
            return Long.parseLong(t);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
