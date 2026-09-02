/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecRoleMapping (commRoleMng 화면) native query 어댑터 —
 *       selectCommRoleMapList (3-table JOIN) / selectCommPerm (NOT EXISTS) / selectMenuId (lov)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING} + {@code TB_MCM_SEC_OBJ} + {@code TB_MCM_SEC_PERM} +
 * {@code TB_MCM_SEC_MENU_FLD} read-only native query 어댑터 (commRoleMng 화면 owner / W3).
 *
 * <p>인용 SQL (분석리포트 §6 — Mapper.xml 활성 SQL 중 본 화면 3 read):
 * <ul>
 *   <li>{@link #searchCmRoleMap(String)} — As-Is {@code selectCommRoleMapList} (xml:89~110) —
 *       3 테이블 JOIN (TB_MCM_SEC_ROLE_MAPPING A + TB_MCM_SEC_OBJ B + TB_MCM_SEC_PERM C)
 *       WHERE A.ROLE_ID = #{ROLE_ID}. To-Be 정책 #1: BIZ_SYSTEM_CODE WHERE 분기 제거.
 *       응답 10 컬럼: PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN /
 *       OBJECT_ID / OBJECT_NM / SYSTEM_CODE / SERVICE / ROLE_ID.</li>
 *   <li>{@link #searchCmPerm(String)} — As-Is {@code selectCommPerm} (xml:143~159) —
 *       TB_MCM_SEC_PERM A WHERE USE_TP='Y' AND NOT EXISTS (PERMISSION_ID + ROLE_ID 미할당).
 *       응답 5 컬럼: PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN.</li>
 *   <li>{@link #findAllMenuIdLov()} — As-Is {@code CommObjMngMapper.selectMenuId} 본 namespace 내재화
 *       (Q-015 해소 / 분석 §11 #27 BPMN ScriptTask 표준).
 *       TB_MCM_SEC_MENU_FLD WHERE PARENT_MENU_ID IS NOT NULL GROUP BY MENU_ID.
 *       To-Be 정책 #1: BIZ_SYSTEM_CODE 컬럼 잔존 보존 (다른 화면 사용 가능성).</li>
 *   <li>{@link #searchObjectLov(String)} — As-Is {@code CommMenuMngMapper.selectMenuObjPop}
 *       (xml:161~173) 본 namespace 내재화 (Q-016 해소 / 2026-06-02 round-2 fix —
 *       sub2 OBJECT-LoV {@code div_object_id} 신규 구현). TB_MCM_SEC_OBJ WHERE USE_TP='Y'
 *       AND (UPPER OBJECT_ID OR OBJECT_NM LIKE). As-Is xfdl:321~336 commonDynamic_onload
 *       의 service ID="commonList", URL="csa::CommMenuMng", dataset="ds_menuObjLst",
 *       검색 조건명="edt_OBJECT_ID" 와 동일 의미. 응답 5 컬럼 OBJECT_ID / OBJECT_NM /
 *       SERVICE / FORM_URL / PARAM.</li>
 * </ul>
 *
 * <p>본 어댑터는 read-only — INSERT / DELETE 는 {@link SecRoleMappingRepository} 의 표준 CRUD 사용.
 */
@Repository
public class SecRoleMappingNativeRepository {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * As-Is {@code selectCommRoleMapList} (xml:89~110) MSSQL 변환.
     *
     * <p>As-Is SQL (Oracle 콤마 join):
     * <pre>
     * SELECT A.PERMISSION_ID, C.PERMISSION_NM, C.PERMISSION_COMMON, C.PERMISSION_CUSTOM,
     *        C.POPUP_BTN, A.OBJECT_ID, B.OBJECT_NM, B.SYSTEM_CODE, B.SERVICE, A.ROLE_ID
     *   FROM TB_MCM_SEC_ROLE_MAPPING A, TB_MCM_SEC_OBJ B, TB_MCM_SEC_PERM C
     *  WHERE A.OBJECT_ID = B.OBJECT_ID
     *    AND A.PERMISSION_ID = C.PERMISSION_ID
     *    AND A.ROLE_ID = #{ROLE_ID}
     *  ORDER BY A.OBJECT_ID, A.PERMISSION_ID
     * </pre>
     *
     * <p>To-Be 정책 #1: As-Is {@code <if cbo_bizSystemCode>AND B.BIZ_SYSTEM_CODE = #{}</if>} 분기 제거.
     * 콤마 join → ANSI JOIN 변환 (정합 §F #6).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmRoleMap(String roleId) {
        String sql =
                "SELECT A.PERMISSION_ID, C.PERMISSION_NM, C.PERMISSION_COMMON, C.PERMISSION_CUSTOM, " +
                "       C.POPUP_BTN, A.OBJECT_ID, B.OBJECT_NM, B.SYSTEM_CODE, B.SERVICE, A.ROLE_ID " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLE_MAPPING A " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_OBJ B  ON A.OBJECT_ID = B.OBJECT_ID " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_PERM C ON A.PERMISSION_ID = C.PERMISSION_ID " +
                " WHERE A.ROLE_ID = :roleId " +
                " ORDER BY A.OBJECT_ID, A.PERMISSION_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("roleId", roleId == null ? "" : roleId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("PERMISSION_ID", row[0]);
            map.put("PERMISSION_NM", row[1]);
            map.put("PERMISSION_COMMON", row[2]);
            map.put("PERMISSION_CUSTOM", row[3]);
            map.put("POPUP_BTN", row[4]);
            map.put("OBJECT_ID", row[5]);
            map.put("OBJECT_NM", row[6]);
            map.put("SYSTEM_CODE", row[7]);
            map.put("SERVICE", row[8]);
            map.put("ROLE_ID", row[9]);
            out.add(map);
        }
        return out;
    }

    /**
     * As-Is {@code selectCommPerm} (xml:143~159) MSSQL 변환.
     *
     * <p>As-Is SQL:
     * <pre>
     * SELECT A.PERMISSION_ID, A.PERMISSION_NM, A.PERMISSION_COMMON, A.PERMISSION_CUSTOM, A.POPUP_BTN
     *   FROM TB_MCM_SEC_PERM A
     *  WHERE A.USE_TP = 'Y'
     *    AND NOT EXISTS (SELECT 'X' FROM TB_MCM_SEC_ROLE_MAPPING B
     *                     WHERE B.PERMISSION_ID = A.PERMISSION_ID AND B.ROLE_ID = #{ROLE_ID})
     *  ORDER BY A.PERMISSION_ID
     * </pre>
     *
     * <p>2026-06-03 사용자 결정 — NOT EXISTS 분기 제거 (정합 정책 변경):
     * <ul>
     *   <li>변경 전: 본 ROLE_ID 에 <b>미할당</b> 권한만 조회 (As-Is 정합).</li>
     *   <li>변경 후: 권한 부여 여부 무관 <b>모든 권한 항상 표시</b>. ROLE_ID 파라미터는 시그니처 유지만 (실제 SQL 미사용).</li>
     * </ul>
     * <p>본 정책 변경 사유: sub2 좌측 OBJECT 목록 그리드에서 이미 부여된 OBJECT 가 FE 클라이언트 필터로
     * 제외되도록 변경됨에 따라 (이미 부여 → 재부여 불가), 권한 그리드는 OBJECT × PERMISSION 매트릭스의
     * "권한 축" 으로 항상 전체 표시 — 사용자가 다른 OBJECT 에 대해 동일 PERMISSION 부여 시 권한 풀이
     * NOT EXISTS 로 가려지는 결함 회피.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchCmPerm(String roleId) {
        // 2026-06-03 — NOT EXISTS 분기 제거. 모든 권한 항상 표시.
        // roleId 파라미터는 시그니처 호환 유지 (FE/Service 변경 회피)이며 실제 SQL 에는 미사용.
        String sql =
                "SELECT A.PERMISSION_ID, A.PERMISSION_NM, A.PERMISSION_COMMON, A.PERMISSION_CUSTOM, A.POPUP_BTN " +
                "  FROM MCMAPUSER.TB_MCM_SEC_PERM A " +
                " WHERE A.USE_TP = 'Y' " +
                " ORDER BY A.PERMISSION_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("PERMISSION_ID", row[0]);
            map.put("PERMISSION_NM", row[1]);
            map.put("PERMISSION_COMMON", row[2]);
            map.put("PERMISSION_CUSTOM", row[3]);
            map.put("POPUP_BTN", row[4]);
            out.add(map);
        }
        return out;
    }

    /**
     * lov 응답 — As-Is {@code CommObjMngMapper.selectMenuId} (xml:118~130) 본 namespace 내재화 (Q-015 closed).
     *
     * <p>As-Is SQL:
     * <pre>
     * SELECT MENU_ID,
     *        MAX(BIZ_SYSTEM_CODE)                          AS BIZ_SYSTEM_CODE,
     *        MAX(MENU_ID) || ' (' || MAX(MENU_NM) || ')'   AS MENU_ID_NM
     *   FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD
     *  WHERE PARENT_MENU_ID IS NOT NULL
     *  GROUP BY MENU_ID
     *  ORDER BY MENU_ID
     * </pre>
     *
     * <p>MSSQL 변환 — Oracle {@code ||} 결합 → MSSQL {@code CONCAT}.
     * To-Be 정책 #1: BIZ_SYSTEM_CODE 컬럼 잔존 (테이블 DDL 보존) — FE 가 미사용.
     */
    /**
     * As-Is {@code CommMenuMngMapper.selectMenuObjPop} (xml:161~173) 본 namespace 내재화 (Q-016 closed).
     *
     * <p>As-Is xfdl:321~336 {@code div_object_id} 의 {@code commonDynamic_onload} 호출 인자:
     * <ul>
     *   <li>service ID = {@code "commonList"}</li>
     *   <li>호출 URL = {@code "csa::CommMenuMng"}</li>
     *   <li>응답 dataset = {@code "ds_menuObjLst"}</li>
     *   <li>응답 컬럼 = {@code OBJECT_ID, OBJECT_NM, FORM_URL}</li>
     *   <li>조회 조건명 = {@code "edt_OBJECT_ID"}</li>
     *   <li>ID 컬럼 = {@code OBJECT_ID} / NM 컬럼 = {@code OBJECT_NM}</li>
     * </ul>
     *
     * <p>본 화면(commRoleMng) namespace 안에서 동일 SQL 을 내재화 — cross-screen 의존 회피 (worker 지시 정합).
     * 응답 5 컬럼: OBJECT_ID / OBJECT_NM / SERVICE / FORM_URL / PARAM.
     *
     * <p>As-Is SQL:
     * <pre>
     * SELECT OBJECT_ID, OBJECT_NM, SERVICE, FORM_URL, PARAM
     *   FROM TB_MCM_SEC_OBJ
     *  WHERE USE_TP='Y'
     *    AND (UPPER(OBJECT_ID) LIKE UPPER(#{edt_OBJECT_ID}||'%')
     *      OR UPPER(OBJECT_NM) LIKE UPPER(#{edt_OBJECT_ID}||'%'))
     * </pre>
     *
     * <p>To-Be 차이: {@code prefix LIKE ("...||'%'")} → {@code substring LIKE ("%...||'%'")} 로 완화 — As-Is
     * commonDynamic 의 UX 가 자동완성 prefix 검색이나 ToBe 는 input + 검색버튼 + Modal 결과 그리드 형태이므로
     * 부분 검색 (OBJECT_ID 와 OBJECT_NM 양쪽 substring) 이 더 적합. AsIs 의 USE_TP='Y' 조건은 1:1 보존.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> searchObjectLov(String edtObjectId) {
        StringBuilder sql = new StringBuilder()
                .append("SELECT OBJECT_ID, OBJECT_NM, SERVICE, FORM_URL, PARAM ")
                .append("  FROM MCMAPUSER.TB_MCM_SEC_OBJ ")
                .append(" WHERE USE_TP = 'Y' ");
        boolean hasKw = edtObjectId != null && !edtObjectId.isBlank();
        if (hasKw) {
            // SQLite 는 CONCAT 미지원 → || 분기. MSSQL 은 기존 CONCAT 유지.
            sql.append(McmAuditStatementInspector.isSqlite()
                    ? "   AND (UPPER(OBJECT_ID) LIKE UPPER('%' || :edtObjectId || '%') OR UPPER(OBJECT_NM) LIKE UPPER('%' || :edtObjectId || '%')) "
                    : "   AND (UPPER(OBJECT_ID) LIKE UPPER(CONCAT('%', :edtObjectId, '%')) OR UPPER(OBJECT_NM) LIKE UPPER(CONCAT('%', :edtObjectId, '%'))) ");
        }
        sql.append(" ORDER BY OBJECT_ID");

        var q = entityManager.createNativeQuery(sql.toString());
        if (hasKw) q.setParameter("edtObjectId", edtObjectId);

        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("OBJECT_ID", row[0]);
            map.put("OBJECT_NM", row[1]);
            map.put("SERVICE", row[2]);
            map.put("FORM_URL", row[3]);
            map.put("PARAM", row[4]);
            out.add(map);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> findAllMenuIdLov() {
        // SQLite 는 CONCAT 미지원 → || 분기. MSSQL 은 기존 CONCAT 유지. schema 접두는 inspector.toSqlite 가 제거.
        String menuIdNm = McmAuditStatementInspector.isSqlite()
                ? "MAX(MENU_ID) || ' (' || MAX(MENU_NM) || ')'"
                : "CONCAT(MAX(MENU_ID), ' (', MAX(MENU_NM), ')')";
        String sql =
                "SELECT MENU_ID, " +
                "       MAX(BIZ_SYSTEM_CODE) AS BIZ_SYSTEM_CODE, " +
                "       " + menuIdNm + " AS MENU_ID_NM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                " WHERE PARENT_MENU_ID IS NOT NULL " +
                " GROUP BY MENU_ID " +
                " ORDER BY MENU_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("BIZ_SYSTEM_CODE", row[1]);
            map.put("MENU_ID_NM", row[2]);
            out.add(map);
        }
        return out;
    }
}
