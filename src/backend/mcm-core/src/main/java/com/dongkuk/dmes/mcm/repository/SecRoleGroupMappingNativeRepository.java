/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleGroupMapping (commRoleGrpMng 화면) native query 어댑터 —
 *       selectCommRoleGrpMap (2-table JOIN) / selectCommRole (NOT EXISTS) /
 *       selectMenuObjTree (5-table CTE + ANSI 재귀 WITH 변환)
 */
package com.dongkuk.dmes.mcm.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING} + {@code TB_MCM_SEC_ROLE} + {@code TB_MCM_SEC_ROLE_MAPPING} +
 * {@code TB_MCM_SEC_MENU} + {@code TB_MCM_SEC_MENU_FLD} + {@code TB_MCM_SEC_OBJ} read-only native query 어댑터
 * (commRoleGrpMng 화면 owner / W4).
 *
 * <p>인용 SQL (분석리포트 §6 — Mapper.xml 활성 SQL 중 본 화면 3 read):
 * <ul>
 *   <li>{@link #searchCmRoleGrpMap(String)} — As-Is {@code selectCommRoleGrpMap} (xml:85~98) —
 *       2 테이블 implicit JOIN (TB_MCM_SEC_ROLEGROUP_MAPPING A + TB_MCM_SEC_ROLE B)
 *       WHERE A.ROLE_ID = B.ROLE_ID AND A.ROLE_GROUP_ID = #{ROLE_GROUP_ID}.
 *       응답 8 컬럼: ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID /
 *       <b>PARENT_ROLE_ID</b> (To-Be SELECT 추가 — Q-010 해소 / 분석 §12).</li>
 *   <li>{@link #searchCmRole(String)} — As-Is {@code selectCommRole} (xml:128~143) —
 *       TB_MCM_SEC_ROLE A WHERE USE_TP='Y' AND NOT EXISTS (ROLE_GROUP_MAPPING B 매칭).
 *       응답 7 컬럼: ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE /
 *       <b>PARENT_ROLE_ID</b> (To-Be SELECT 추가 — Q-010 해소 / 분석 §12).</li>
 *   <li>{@link #searchCmRoleGrpMenu(String)} — As-Is {@code selectMenuObjTree} (xml:145~249) —
 *       Oracle CTE + CONNECT BY 계층 쿼리 → ANSI 재귀 WITH 변환 (정합 §F #7/#9).
 *       응답 8 컬럼: MENU_ID / MENU_SEQ / MENU_NM / LEV / PARENT_MENU_ID / ROW_SEQ / OBJECT_ID / MENU_VIEW_YN.</li>
 * </ul>
 *
 * <p>본 어댑터는 read-only — INSERT / DELETE 는 {@link SecRoleGroupMappingRepository} 의 표준 CRUD 사용.
 */
@Repository
public class SecRoleGroupMappingNativeRepository {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * As-Is {@code selectCommRoleGrpMap} (xml:85~98) 변환.
     *
     * <p>As-Is SQL (Oracle implicit join):
     * <pre>
     * SELECT B.ROLE_ID, B.ROLE_NM, B.MENU_ID, B.USE_TP,
     *        B.START_ACTIVE_DATE, B.END_ACTIVE_DATE, A.ROLE_GROUP_ID
     *   FROM TB_MCM_SEC_ROLEGROUP_MAPPING A, TB_MCM_SEC_ROLE B
     *  WHERE A.ROLE_ID = B.ROLE_ID
     *    AND A.ROLE_GROUP_ID = #{ROLE_GROUP_ID}
     *  ORDER BY B.ROLE_ID
     * </pre>
     *
     * <p>To-Be 적용:
     * <ul>
     *   <li>implicit JOIN → ANSI JOIN (정합 §F #12)</li>
     *   <li>PARENT_ROLE_ID 컬럼 SELECT 절 추가 (분석 §12 / GE1-004 binding 정상 표시 보장)</li>
     * </ul>
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmRoleGrpMap(String roleGroupId) {
        String sql =
                "SELECT B.ROLE_ID, B.ROLE_NM, B.MENU_ID, CAST(B.USE_TP AS VARCHAR(20)), " +
                "       B.START_ACTIVE_DATE, B.END_ACTIVE_DATE, A.ROLE_GROUP_ID, B.PARENT_ROLE_ID " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING A " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLE B ON A.ROLE_ID = B.ROLE_ID " +
                " WHERE A.ROLE_GROUP_ID = :roleGroupId " +
                " ORDER BY B.ROLE_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("roleGroupId", roleGroupId == null ? "" : roleGroupId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("ROLE_ID", row[0]);
            map.put("ROLE_NM", row[1]);
            map.put("MENU_ID", row[2]);
            map.put("USE_TP", row[3]);
            map.put("START_ACTIVE_DATE", row[4]);
            map.put("END_ACTIVE_DATE", row[5]);
            map.put("ROLE_GROUP_ID", row[6]);
            map.put("PARENT_ROLE_ID", row[7]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectCommRole} (xml:128~143) 변환.
     *
     * <p>As-Is SQL:
     * <pre>
     * SELECT A.ROLE_ID, A.ROLE_NM, A.MENU_ID, A.USE_TP, A.START_ACTIVE_DATE, A.END_ACTIVE_DATE
     *   FROM TB_MCM_SEC_ROLE A
     *  WHERE A.USE_TP = 'Y'
     *    AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLEGROUP_MAPPING B
     *                     WHERE B.ROLE_ID = A.ROLE_ID
     *                       AND B.ROLE_GROUP_ID = #{ROLE_GROUP_ID})
     *  ORDER BY A.ROLE_ID
     * </pre>
     *
     * <p>To-Be 적용: PARENT_ROLE_ID 컬럼 SELECT 추가 (분석 §12 / GE2-004 binding 정상 표시 보장).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmRole(String roleGroupId) {
        // USE_TP 등 길이 1 컬럼은 CAST 로 String 고정 — 빈 문자열 행 하나가 조회 전체를 죽이는 것을 막는다
        // (Hibernate 6 Character 추론 → CoercionException. SecMenuNativeRepository.searchCmMenu javadoc 참조).
        String sql =
                "SELECT A.ROLE_ID, A.ROLE_NM, A.MENU_ID, CAST(A.USE_TP AS VARCHAR(20)), " +
                "       A.START_ACTIVE_DATE, A.END_ACTIVE_DATE, A.PARENT_ROLE_ID " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLE A " +
                " WHERE A.USE_TP = 'Y' " +
                "   AND NOT EXISTS (SELECT 'X' FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING B " +
                "                    WHERE B.ROLE_ID = A.ROLE_ID " +
                "                      AND B.ROLE_GROUP_ID = :roleGroupId) " +
                " ORDER BY A.ROLE_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("roleGroupId", roleGroupId == null ? "" : roleGroupId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("ROLE_ID", row[0]);
            map.put("ROLE_NM", row[1]);
            map.put("MENU_ID", row[2]);
            map.put("USE_TP", row[3]);
            map.put("START_ACTIVE_DATE", row[4]);
            map.put("END_ACTIVE_DATE", row[5]);
            map.put("PARENT_ROLE_ID", row[6]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectMenuObjTree} (xml:145~249) Oracle CTE + CONNECT BY → ANSI 재귀 WITH 변환.
     *
     * <p>As-Is 구조 (3 CTE):
     * <ol>
     *   <li>{@code MROLE AS} — 5 테이블 implicit JOIN (RGM/RG/R/RM/MNU)
     *       WHERE RGM.ROLE_GROUP_ID = #{ROLE_GROUP_ID}
     *       AND RG.USE_TP='Y' AND R.USE_TP='Y' AND MNU.USE_TP='Y' AND MNU.MENU_TP='WEB'</li>
     *   <li>{@code MENU AS} — MROLE UNION (TB_MCM_SEC_MENU_FLD 의 부모 메뉴 START WITH ... CONNECT BY PRIOR)</li>
     *   <li>{@code MENU1 AS} — 계층 LEVEL / SYS_CONNECT_BY_PATH / CONNECT_BY_ISLEAF 계산</li>
     * </ol>
     *
     * <p>ANSI 변환 (정합 §F #6~11 — oracle-1007 로 Oracle·H2 공통형):
     * <ul>
     *   <li>재귀 WITH(칸 이름 목록 필수 — Oracle ORA-32039) 로 부모 메뉴 traversal (CONNECT BY 등가).
     *       예전 MSSQL {@code OPTION (MAXRECURSION 32)} 는 재귀 쪽 {@code T.LEV < 32} 로 옮겨 순환 자료에서도 멈춘다.</li>
     *   <li>{@code SYS_CONNECT_BY_PATH} → CTE 의 누적 path 컬럼</li>
     *   <li>{@code CONNECT_BY_ISLEAF} → 외부 EXISTS (child) 로 대체</li>
     *   <li>{@code TO_CHAR(MENU_SEQ, '00000000')} → {@code LPAD(COALESCE(MENU_SEQ, '0'), 8, '0')} (MENU_SEQ 는 VARCHAR2)</li>
     *   <li>{@code (+)} outer-join → {@code LEFT JOIN ... ON}</li>
     *   <li>{@code ROWNUM} → {@code ROW_NUMBER() OVER (ORDER BY ...)}</li>
     *   <li>implicit JOIN → ANSI JOIN</li>
     * </ul>
     *
     * <p>응답 8 컬럼 (As-Is DS-004 + 추가 컬럼 일부):
     * MENU_ID / MENU_SEQ / MENU_NM / LEV / PARENT_MENU_ID / ROW_SEQ / OBJECT_ID / MENU_VIEW_YN.
     *
     * <p>본 화면 LT (메뉴 트리) 표시 전용 — 단순 권한 미리보기 (편집 ✗).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmRoleGrpMenu(String roleGroupId) {
        String sql =
                "WITH MROLE AS ( " +
                "    SELECT DISTINCT MNU.MENU_ID " +
                "      FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING RGM " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP RG ON RGM.ROLE_GROUP_ID = RG.ROLE_GROUP_ID " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON RGM.ROLE_ID = R.ROLE_ID " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING RM ON R.ROLE_ID = RM.ROLE_ID " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_MENU MNU ON RM.OBJECT_ID = MNU.OBJECT_ID " +
                "     WHERE RGM.ROLE_GROUP_ID = :roleGroupId " +
                "       AND RG.USE_TP = 'Y' " +
                "       AND R.USE_TP = 'Y' " +
                "       AND MNU.USE_TP = 'Y' " +
                "       AND MNU.MENU_TP = 'WEB' " +
                "), MENU_TREE (MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, MENU_VIEW_YN, LEV) AS ( " +
                "    SELECT F.MENU_ID, F.MENU_NM, F.PARENT_MENU_ID, F.MENU_SEQ, F.MENU_VIEW_YN, 0 AS LEV " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F " +
                "     WHERE F.MENU_ID IN (SELECT MENU_ID FROM MROLE) " +
                "    UNION ALL " +
                "    SELECT P.MENU_ID, P.MENU_NM, P.PARENT_MENU_ID, P.MENU_SEQ, P.MENU_VIEW_YN, T.LEV + 1 " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD P " +
                "      JOIN MENU_TREE T ON T.PARENT_MENU_ID = P.MENU_ID " +
                "     WHERE T.LEV < 32 " +
                ") " +
                "SELECT M.MENU_ID, " +
                "       LPAD(COALESCE(CAST(M.MENU_SEQ AS VARCHAR(30)), '0'), 8, '0') AS MENU_SEQ, " +
                "       M.MENU_NM, " +
                "       M.LEV, " +
                "       M.PARENT_MENU_ID, " +
                "       ROW_NUMBER() OVER (ORDER BY M.MENU_SEQ) AS ROW_SEQ, " +
                "       O.OBJECT_ID, " +
                "       CAST(M.MENU_VIEW_YN AS VARCHAR(20)) " +
                "  FROM (SELECT DISTINCT MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, MENU_VIEW_YN, LEV FROM MENU_TREE) M " +
                "  LEFT JOIN MCMAPUSER.TB_MCM_SEC_OBJ O ON O.OBJECT_ID = M.MENU_ID " +
                " ORDER BY M.MENU_SEQ";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("roleGroupId", roleGroupId == null ? "" : roleGroupId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_SEQ", row[1]);
            map.put("MENU_NM", row[2]);
            map.put("LEV", row[3]);
            map.put("PARENT_MENU_ID", row[4]);
            map.put("ROW_SEQ", row[5]);
            map.put("OBJECT_ID", row[6]);
            map.put("MENU_VIEW_YN", row[7]);
            out.add(map);
        }
        return out;
    }
}
