/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecMenu (commMenuMng 화면) native query 어댑터 — selectCommMenuMng / selectMenuFldList(CTE) /
 *       selectMenuObj / selectMenuObjPop. 표준 CRUD 는 SecMenuRepository 사용.
 */
package com.dongkuk.dmes.mcm.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hibernate.query.NativeQuery;
import org.hibernate.type.StandardBasicTypes;
import org.springframework.stereotype.Repository;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

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
 *       Oracle {@code CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID} → ANSI 재귀 WITH(칸 이름 목록 포함) 변환.
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

    /** 메뉴 셋(MENU_TP) 이 NULL 인 행이 속하는 셋 — 2026-11-26 사용자 결정(NULL = WEB, 시드도 NULL → 'WEB'). */
    public static final String DEFAULT_MENU_TP = "WEB";

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * As-Is {@code selectCommMenuMng} (xml:7~44) 변환 + 폴더 트리 후손 → leaf 화면 조회 (2026-06-02 R3 P1 round 3).
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
     *   <li>2026-11-26 To-Be 추가 {@code cboMENUTP} (메뉴 셋) → {@code NVL(A.MENU_TP, 'WEB') = :cboMenuTp} — NULL 은 WEB.
     *       재귀(폴더 지정)·전체 두 분기에 같이 붙는다.</li>
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
                                                  String edtMenuNm, String cboUseTp, String cboMenuTp) {
        StringBuilder sql = new StringBuilder();
        boolean useDescendants = notBlank(pMenuId);
        if (useDescendants) {
            // round 3 — FLD 후손 폴더 수집 (CTE) → SEC_MENU leaf SELECT.
            // FldDesc anchor = TB_MCM_SEC_MENU_FLD WHERE MENU_ID = :pMenuId (폴더 시작점).
            // FldDesc recursive = child FLD JOIN parent FLD (PARENT_MENU_ID = d.MENU_ID).
            // 최종 leaf 화면은 SEC_MENU.PARENT_MENU_ID IN (FldDesc.MENU_ID) — SEC_MENU 는 모두 leaf.
            // Oracle 재귀 WITH 는 RECURSIVE 키워드 없이 칸 이름 목록(FldDesc (MENU_ID))을 반드시 단다(ORA-32039).
            sql.append("WITH FldDesc (MENU_ID) AS ( ")
               .append("  SELECT MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD ")
               .append("   WHERE MENU_ID = :pMenuId ")
               .append("  UNION ALL ")
               .append("  SELECT f.MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD f ")
               .append("    JOIN FldDesc d ON f.PARENT_MENU_ID = d.MENU_ID ")
               .append(") ")
               .append("SELECT A.MENU_ID, A.MENU_SEQ, A.MENU_NM, A.MENU_DESC, A.MENU_TP, ")
               .append("       A.OBJECT_ID, B.OBJECT_NM, CAST(A.USE_TP AS VARCHAR(20)), ")
               .append("       A.START_ACTIVE_DATE, A.END_ACTIVE_DATE, ")
               .append("       CAST(A.MENU_VIEW_YN AS VARCHAR(20)), A.PARENT_MENU_ID, ")
               .append("       A.MENU_PARAM1, A.MENU_PARAM2, A.MENU_PARAM3 ")
               .append("  FROM MCMAPUSER.TB_MCM_SEC_MENU A ")
               .append("  LEFT JOIN MCMAPUSER.TB_MCM_SEC_OBJ B ON A.OBJECT_ID = B.OBJECT_ID ")
               .append(" WHERE A.PARENT_MENU_ID IN (SELECT MENU_ID FROM FldDesc) ");
        } else {
            // round 3 — 기본 (트리 미선택 / 검색 only): SEC_MENU 전체 SELECT (폴더 ✗ — leaf 만 적재되어 있음).
            sql.append("SELECT A.MENU_ID, A.MENU_SEQ, A.MENU_NM, A.MENU_DESC, A.MENU_TP, ")
               .append("       A.OBJECT_ID, B.OBJECT_NM, CAST(A.USE_TP AS VARCHAR(20)), ")
               .append("       A.START_ACTIVE_DATE, A.END_ACTIVE_DATE, ")
               .append("       CAST(A.MENU_VIEW_YN AS VARCHAR(20)), A.PARENT_MENU_ID, ")
               .append("       A.MENU_PARAM1, A.MENU_PARAM2, A.MENU_PARAM3 ")
               .append("  FROM MCMAPUSER.TB_MCM_SEC_MENU A ")
               .append("  LEFT JOIN MCMAPUSER.TB_MCM_SEC_OBJ B ON A.OBJECT_ID = B.OBJECT_ID ")
               .append(" WHERE 1 = 1 ");
        }
        if (notBlank(edtMenuId)) {
            sql.append(" AND UPPER(A.MENU_ID) LIKE UPPER('%' || :edtMenuId || '%') ");
        }
        if (notBlank(edtMenuNm)) {
            sql.append(" AND A.MENU_NM LIKE '%' || :edtMenuNm || '%' ");
        }
        if (notBlank(cboUseTp)) {
            sql.append(" AND A.USE_TP = :cboUseTp ");
        }
        if (notBlank(cboMenuTp)) {
            sql.append(" AND NVL(A.MENU_TP, '" + DEFAULT_MENU_TP + "') = :cboMenuTp ");
        }
        sql.append(" ORDER BY A.MENU_ID, A.MENU_SEQ");

        var q = entityManager.createNativeQuery(sql.toString());
        if (useDescendants) q.setParameter("pMenuId", pMenuId);
        if (notBlank(edtMenuId)) q.setParameter("edtMenuId", edtMenuId);
        if (notBlank(edtMenuNm)) q.setParameter("edtMenuNm", edtMenuNm);
        if (notBlank(cboUseTp)) q.setParameter("cboUseTp", cboUseTp);
        if (notBlank(cboMenuTp)) q.setParameter("cboMenuTp", cboMenuTp);

        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_SEQ", row[1]);
            map.put("MENU_NM", row[2]);
            map.put("MENU_DESC", row[3]);
            map.put("MENU_TP", row[4]);
            map.put("OBJECT_ID", row[5]);
            map.put("OBJECT_NM", row[6]);
            map.put("USE_TP", row[7]);
            map.put("START_ACTIVE_DATE", row[8]);
            map.put("END_ACTIVE_DATE", row[9]);
            map.put("MENU_VIEW_YN", row[10]);
            map.put("PARENT_MENU_ID", row[11]);
            map.put("MENU_PARAM1", row[12]);
            map.put("MENU_PARAM2", row[13]);
            map.put("MENU_PARAM3", row[14]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectMenuFldList} (xml:125~140) — Oracle CONNECT BY → ANSI 재귀 WITH(칸 이름 목록 포함) 변환.
     *
     * <p>변환 매핑 (정합 §F #1~#5):
     * <ul>
     *   <li>{@code LEVEL - 1 AS LEV} → CTE 누적 LEV 컬럼 (anchor=0, recursive=parent.LEV+1)</li>
     *   <li>{@code START WITH PARENT_MENU_ID IS NULL} → anchor member WHERE</li>
     *   <li>{@code CONNECT BY PRIOR MENU_ID = PARENT_MENU_ID} → JOIN child ON child.PARENT_MENU_ID = parent.MENU_ID</li>
     *   <li>{@code SYS_CONNECT_BY_PATH(TO_CHAR(MENU_SEQ,'00000000'),'/')} → 누적 PATH 컬럼 (LPAD 8자 zero-pad)</li>
     * </ul>
     *
     * <p>To-Be 정책 #1: As-Is {@code <if cbo_bizSystemCode>WHERE BIZ_SYSTEM_CODE = #{}</if>} (xml:132~134) 제거.
     * SELECT 5 컬럼 (LEV / MENU_ID / MENU_SEQ / MENU_NM / PARENT_MENU_ID).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuFld() {
        // Oracle 단일화(oracle-1007) — 8자 0 채움은 LPAD, 결합은 ||. MENU_SEQ 는 VARCHAR2(30) 이라 8자 이하 값에서는
        // 예전 RIGHT('00000000' + x, 8) 와 같다(8자를 넘으면 RIGHT 는 오른쪽, LPAD 는 왼쪽 8자를 남긴다).
        // Oracle 재귀 WITH 는 RECURSIVE 키워드 없이 칸 이름 목록을 반드시 단다(ORA-32039). 앵커·재귀 쪽 PATH 형은 VARCHAR(4000) 으로 맞춘다.
        String pathAnchor = "CAST('/' || LPAD(CAST(MENU_SEQ AS VARCHAR(30)), 8, '0') AS VARCHAR(4000))";
        String pathRecursive = "CAST(parent.PATH || '/' || LPAD(CAST(child.MENU_SEQ AS VARCHAR(30)), 8, '0') AS VARCHAR(4000))";
        String cteKeyword = "WITH FldTree (MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, LEV, PATH) AS ( ";
        String sql =
                cteKeyword +
                "  SELECT MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID, 0 AS LEV, " +
                "         " + pathAnchor + " AS PATH " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                "   WHERE PARENT_MENU_ID IS NULL " +
                "  UNION ALL " +
                "  SELECT child.MENU_ID, child.MENU_SEQ, child.MENU_NM, child.PARENT_MENU_ID, parent.LEV + 1 AS LEV, " +
                "         " + pathRecursive + " AS PATH " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD child " +
                "    JOIN FldTree parent ON child.PARENT_MENU_ID = parent.MENU_ID " +
                ") " +
                "SELECT LEV, MENU_ID, MENU_SEQ, MENU_NM, PARENT_MENU_ID " +
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
     * As-Is 와 같은 Oracle {@code ||} 결합 (정합 §F #7 — oracle-1007 로 되돌림).
     *
     * <p>2026-06-04 round 5 — PARENT_MENU_ID 컬럼 추가 (사용자 결정):
     * <ul>
     *   <li>FE OBJECT LoV 모달에서 행 선택 시 OBJECT_ID + PARENT_MENU_ID (상위 폴더) 자동 세트 요구.</li>
     *   <li>PARENT_MENU_ID 는 {@code TB_MCM_SEC_MENU} 에 기등록된 (OBJECT_ID 가 이미 다른 메뉴에 묶인 경우의)
     *       그룹 폴더 ID — 상관 서브쿼리 끝의 {@code FETCH FIRST 1 ROWS ONLY} 로 임의 1행 가져온다.</li>
     *   <li>OBJECT 가 어떤 메뉴에도 매핑 안 됐으면 LEFT JOIN 결과 NULL — FE 는 빈 문자열로 처리.</li>
     * </ul>
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuObjPop(String edtObjectId) {
        // Oracle 단일화(oracle-1007) — 상관 서브쿼리의 임의 1행은 FETCH FIRST 1 ROWS ONLY(Oracle 12c+·H2 공통).
        String parentSub = "(SELECT M.PARENT_MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU M WHERE M.OBJECT_ID = O.OBJECT_ID FETCH FIRST 1 ROWS ONLY)";
        StringBuilder sql = new StringBuilder()
                .append("SELECT O.OBJECT_ID, O.OBJECT_NM, O.SERVICE, O.FORM_URL, O.PARAM, ")
                .append("       ").append(parentSub).append(" AS PARENT_MENU_ID ")
                .append("  FROM MCMAPUSER.TB_MCM_SEC_OBJ O ")
                .append(" WHERE O.USE_TP = 'Y' ");
        if (notBlank(edtObjectId)) {
            sql.append("   AND (UPPER(O.OBJECT_ID) LIKE UPPER('%' || :edtObjectId || '%') OR UPPER(O.OBJECT_NM) LIKE UPPER('%' || :edtObjectId || '%')) ");
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

    /**
     * 2026-11-26 — 메뉴 셋 {@code menuTp} 에 아직 놓이지 않은 사용 OBJECT 목록 (commMenuMng {@code searchUnplacedObj}).
     *
     * <p>조건: {@code USE_TP = 'Y'} 이고, 그 OBJECT_ID 로 {@code NVL(MENU_TP,'WEB') = :menuTp} 인 SEC_MENU 행이 없다.
     * {@code edtObjectId} 가 있으면 OBJECT_ID 또는 OBJECT_NM UPPER LIKE. ORDER BY OBJECT_ID.
     * 결과 타입은 {@code addScalar} 로 문자열에 고정한다({@link #searchMenuFldList()} 주석과 같은 이유).
     *
     * @param menuTp      메뉴 셋 — 빈 값이면 {@link #DEFAULT_MENU_TP}
     * @param edtObjectId OBJECT_ID·OBJECT_NM 검색어 (선택)
     * @return {OBJECT_ID, OBJECT_NM, SYSTEM_CODE, OBJECT_TYPE, FORM_URL} 행 목록
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchUnplacedObj(String menuTp, String edtObjectId) {
        String set = notBlank(menuTp) ? menuTp.trim() : DEFAULT_MENU_TP;
        StringBuilder sql = new StringBuilder()
                .append("SELECT O.OBJECT_ID, O.OBJECT_NM, O.SYSTEM_CODE, O.OBJECT_TYPE, O.FORM_URL ")
                .append("  FROM MCMAPUSER.TB_MCM_SEC_OBJ O ")
                .append(" WHERE O.USE_TP = 'Y' ")
                .append("   AND NOT EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_SEC_MENU M ")
                .append("                    WHERE M.OBJECT_ID = O.OBJECT_ID ")
                .append("                      AND NVL(M.MENU_TP, '" + DEFAULT_MENU_TP + "') = :menuTp) ");
        if (notBlank(edtObjectId)) {
            sql.append("   AND (UPPER(O.OBJECT_ID) LIKE UPPER('%' || :edtObjectId || '%') OR UPPER(O.OBJECT_NM) LIKE UPPER('%' || :edtObjectId || '%')) ");
        }
        sql.append(" ORDER BY O.OBJECT_ID");

        NativeQuery<Object[]> q = entityManager.createNativeQuery(sql.toString()).unwrap(NativeQuery.class);
        q.addScalar("OBJECT_ID", StandardBasicTypes.STRING)
         .addScalar("OBJECT_NM", StandardBasicTypes.STRING)
         .addScalar("SYSTEM_CODE", StandardBasicTypes.STRING)
         .addScalar("OBJECT_TYPE", StandardBasicTypes.STRING)
         .addScalar("FORM_URL", StandardBasicTypes.STRING);
        q.setParameter("menuTp", set);
        if (notBlank(edtObjectId)) q.setParameter("edtObjectId", edtObjectId);

        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("OBJECT_ID", row[0]);
            map.put("OBJECT_NM", row[1]);
            map.put("SYSTEM_CODE", row[2]);
            map.put("OBJECT_TYPE", row[3]);
            map.put("FORM_URL", row[4]);
            out.add(map);
        }
        return out;
    }

    /**
     * 2026-11-26 — OBJECT 의 화면 코드 경로(FORM_URL)를 옛 규칙 값으로 채운다 (멱등). 규칙 정본은 {@code mcm.menu.MenuCodePath}.
     *
     * <p>대상: FORM_URL 이 비었거나, {@code /} 가 없고 접속 경로(ACCESS_TP)가 {@code 외부} 가 아닌 OBJECT 중 그것을 참조하는
     * SEC_MENU 행(PARENT_MENU_ID 있음)이 있는 것. 값: 그 메뉴 행들의 {@code MIN(PARENT_MENU_ID || '/' || OBJECT_ID)}
     * — 여러 폴더에 놓였어도 늘 같은 값을 고른다. 외부 OBJECT 의 FORM_URL 값은 건드리지 않는다.
     *
     * <p>왜: 즐겨찾기·기본 화면 fullId 와 화면 사용 통계 pageId 는 옛 규칙({@code PARENT_MENU_ID/OBJECT_ID})으로 저장돼 있다.
     * 경로를 OBJECT 로 옮길 때 그 값을 FORM_URL 에 고정해 두어야 저장된 값이 계속 맞고, 메뉴를 다른 폴더로 옮겨도 경로가 바뀌지 않는다.
     * 기존 DB 는 Flyway {@code V22__backfill_obj_form_url}(같은 문장)이, 새로 시드한 DB 는 기동 시드 마무리({@code MenuFinalizer})가,
     * 운영 중 새로 놓인 화면은 {@code saveCmMenu} 가 부른다.
     *
     * @return 바뀐 OBJECT 행 수
     */
    public int backfillObjectFormUrl() {
        // 직전 JPA save() 의 대기 중 INSERT/UPDATE 를 먼저 내보낸다 — 아래 문장이 최신 메뉴 행을 보게.
        entityManager.flush();
        String sql =
                "UPDATE MCMAPUSER.TB_MCM_SEC_OBJ O " +
                "   SET O.FORM_URL = (SELECT MIN(M.PARENT_MENU_ID || '/' || M.OBJECT_ID) " +
                "                       FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                "                      WHERE M.OBJECT_ID = O.OBJECT_ID " +
                "                        AND TRIM(M.PARENT_MENU_ID) IS NOT NULL) " +
                " WHERE (TRIM(O.FORM_URL) IS NULL " +
                "        OR (INSTR(O.FORM_URL, '/') = 0 AND NVL(O.ACCESS_TP, '-') <> :external)) " +
                "   AND EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                "                WHERE M.OBJECT_ID = O.OBJECT_ID " +
                "                  AND TRIM(M.PARENT_MENU_ID) IS NOT NULL)";
        return entityManager.createNativeQuery(sql)
                .setParameter("external", ACCESS_TP_EXTERNAL)
                .executeUpdate();
    }

    /** 접속 경로 외부 — {@code SecObj.accessTp} 의 To-Be 2 값("내부"/"외부") 중 하나. */
    static final String ACCESS_TP_EXTERNAL = "외부";

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    /**
     * 2026-06-04 사용자 지시 — commMenuMng "메뉴 필드 관리" 팝업 SEARCH 어댑터.
     *
     * <p>TB_MCM_SEC_MENU_FLD 의 본 4 컬럼 + MENU_VIEW_YN 반환 (audit 컬럼은 본 화면 책임 ✗).
     * 순서는 트리 순서다 — 위에서부터 부모 → 자식, 같은 부모 안에서는 MENU_SEQ 순({@link #searchMenuFld} 와 같은 PATH).
     * 부모를 찾지 못한 폴더(트리 밖)는 맨 뒤에 MENU_ID 순으로 둔다.
     *
     * <p>결과 타입은 {@code addScalar} 로 고정한다 — 이유는 메서드 본문 주석 참조 (2026-09-03).
     *
     * <p>2026-08-14 — {@code MENU_VIEW_YN}(폴더 표시/미표시) 을 본 SELECT 로 흡수했다. 직전에는
     * 화면 패키지의 별도 어댑터가 전건 맵을 따로 읽어 결과에 덧입혔는데, 같은 테이블을 두 번 읽을
     * 이유가 없다. 값 도메인은 {@code 'Y'}(표시) / {@code 'N'}(미표시) 2 값이고,
     * <b>NULL 은 표시</b>로 취급한다 (사이드바 필터 {@code SecUserService} 가 {@code 'N'} 일 때만 숨김).
     * 그리드 표시용 정규화(NULL·빈 문자열 → {@code 'Y'})는 호출부(Service) 책임이다.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchMenuFldList() {
        // 2026-11-27 사용자 결정 — FULL_SEQ 를 없앴다. 순서는 트리 PATH(MENU_SEQ 8자리 0 채움을 부모부터 이은 값)로 정한다.
        //
        // 2026-09-03 — 결과 타입을 CAST(... AS VARCHAR(20)) 대신 addScalar 로 고정한다.
        //   CAST 는 "그 식(expression) 컬럼의 JDBC 타입을 드라이버가 무엇으로 보고하느냐" 에 여전히 의존한다.
        //   (옛 SQLite 시절 사례) sqlite-jdbc 는 선언타입이 없는 식 컬럼의 타입을 '현재 행의 값 타입' 으로 추론하는데, 본 테이블의
        //   정렬 첫 행(mcm)은 MENU_VIEW_YN 이 NULL 이라 numeric 으로 보고됐다.
        //   → Hibernate 가 DecimalJdbcType 을 골랐고, 뒤이어 'N'(cmz 행) 을 만난 순간
        //     "Could not extract column [6] from JDBC ResultSet [Bad value for type BigDecimal : N]" 로
        //     조회 전체가 실패했다 (팝업 0건 + 오류 모달).
        //   addScalar 는 ResultSet 메타데이터를 보지 않고 타입을 고정하므로 방언·데이터 오염과 무관하게 안전하다.
        //   Character 추론(length=1 VARCHAR → '' CoercionException) 문제도 함께 사라진다.
        String sql =
                "WITH FldTree (MENU_ID, PATH) AS ( " +
                "  SELECT MENU_ID, CAST('/' || LPAD(CAST(MENU_SEQ AS VARCHAR(30)), 8, '0') AS VARCHAR(4000)) " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD WHERE PARENT_MENU_ID IS NULL " +
                "  UNION ALL " +
                "  SELECT child.MENU_ID, CAST(parent.PATH || '/' || LPAD(CAST(child.MENU_SEQ AS VARCHAR(30)), 8, '0') AS VARCHAR(4000)) " +
                "    FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD child " +
                "    JOIN FldTree parent ON child.PARENT_MENU_ID = parent.MENU_ID " +
                ") " +
                "SELECT F.MENU_ID, F.MENU_SEQ, F.MENU_NM, F.PARENT_MENU_ID, F.MENU_VIEW_YN " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F " +
                "  LEFT JOIN FldTree T ON T.MENU_ID = F.MENU_ID " +
                " ORDER BY CASE WHEN T.PATH IS NULL THEN 1 ELSE 0 END, T.PATH, F.MENU_ID";
        NativeQuery<Object[]> q = entityManager.createNativeQuery(sql).unwrap(NativeQuery.class);
        q.addScalar("MENU_ID", StandardBasicTypes.STRING)
         .addScalar("MENU_SEQ", StandardBasicTypes.STRING)
         .addScalar("MENU_NM", StandardBasicTypes.STRING)
         .addScalar("PARENT_MENU_ID", StandardBasicTypes.STRING)
         .addScalar("MENU_VIEW_YN", StandardBasicTypes.STRING);
        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_SEQ", row[1]);
            map.put("MENU_NM", row[2]);
            map.put("PARENT_MENU_ID", row[3]);
            map.put("MENU_VIEW_YN", row[4]);
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

    /**
     * 직전 JPA save() 의 대기 중 insert·update 를 DB 에 내보낸다. 저장 뒤 native 재조회가 최신 행을 보게 한다.
     *
     * <p>2026-11-27 — FULL_SEQ(트리 위치 7자리 인코딩) 재계산을 없앴다(사용자 결정). 그 재계산이 하던 flush 만 남긴다.
     * 메뉴 순서는 PARENT_MENU_ID + MENU_SEQ 로 정한다({@code mcm.menu.MenuOrder}).
     */
    public void flush() {
        entityManager.flush();
    }
}
