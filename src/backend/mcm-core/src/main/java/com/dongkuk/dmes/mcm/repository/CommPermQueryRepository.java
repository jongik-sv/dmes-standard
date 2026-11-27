/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: 권한 관리 옛 화면 4종(commObjMng·commRoleMng·commPermMng·commRoleGrpMng) 공용 읽기 쿼리 — 퍼미션 모델 v2
 */
package com.dongkuk.dmes.mcm.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * 권한 관리 옛 화면 4종이 함께 쓰는 읽기 전용 네이티브 쿼리(퍼미션 모델 v2, {@code TB_MCM_SEC_ROLE_PERM}).
 *
 * <p>옛 매핑 표({@code TB_MCM_SEC_ROLE_MAPPING})를 읽는 {@code Sec*Repository} 메서드는 고치지 않고
 * 이 클래스의 새 쿼리로 대신한다(perm-bench 조정 결정 — c5 소유 파일과 겹치지 않게).
 * 화면 하나만 쓰는 쿼리는 각 화면 패키지의 {@code query} 클래스에 둔다.
 *
 * <p>메뉴 구조: 폴더(모듈 = 뿌리) = {@code TB_MCM_SEC_MENU_FLD}, 화면 메뉴(잎) = {@code TB_MCM_SEC_MENU}
 * ({@code PARENT_MENU_ID} → 폴더, {@code OBJECT_ID} → 오브젝트). 경로 표시 = 폴더 이름을 {@code " › "} 로 잇는다.
 *
 * <p>사람 수 = 사용 중({@code USE_TP='Y'}) 역할 그룹을 거쳐 그 역할을 받는 서로 다른 사용자 수(그룹 겹침 제외).
 */
@Repository
public class CommPermQueryRepository {

    /** 경로 구분자(FE 표시와 같다). */
    public static final String PATH_SEP = " › ";

    /** SYSADMIN 역할 ID(런타임 별칭 {@code ROLE_SYSADMIN} 포함, D13·{@code PermResolver} javadoc). */
    public static final Set<String> SYSADMIN_ROLE_IDS = Set.of("SYSADMIN", "ROLE_SYSADMIN");

    /** 권한 관리 옛 화면 4종이 함께 쓰는 SYSADMIN 판정. */
    public static boolean isSysadmin(String roleId) {
        return roleId != null && SYSADMIN_ROLE_IDS.contains(roleId.trim());
    }

    /** SQL IN 목록용 SYSADMIN 역할 ID(상수 집합에서 만든다 — 사용자 입력 아님). */
    private static final String SYSADMIN_IN_SQL = "'" + String.join("','", new TreeSet<>(SYSADMIN_ROLE_IDS)) + "'";

    /** 폴더 트리 재귀 CTE(칸 이름 목록 필수 — Oracle ORA-32039). 깊이 32 에서 멈춘다(순환 자료 보호). */
    private static final String FOLDER_TREE_CTE =
            "FT (MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_LV, MENU_PATH, SORT_PATH) AS ( " +
            "    SELECT F.MENU_ID, F.MENU_NM, F.PARENT_MENU_ID, 1, " +
            "           CAST(COALESCE(F.MENU_NM, F.MENU_ID) AS VARCHAR2(4000)), " +
            "           CAST(LPAD(COALESCE(F.MENU_SEQ, '0'), 30, '0') || F.MENU_ID AS VARCHAR2(4000)) " +
            "      FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F " +
            "     WHERE F.PARENT_MENU_ID IS NULL " +
            "    UNION ALL " +
            "    SELECT C.MENU_ID, C.MENU_NM, C.PARENT_MENU_ID, P.MENU_LV + 1, " +
            "           P.MENU_PATH || '" + PATH_SEP + "' || COALESCE(C.MENU_NM, C.MENU_ID), " +
            "           P.SORT_PATH || '/' || LPAD(COALESCE(C.MENU_SEQ, '0'), 30, '0') || C.MENU_ID " +
            "      FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD C " +
            "      JOIN FT P ON C.PARENT_MENU_ID = P.MENU_ID " +
            "     WHERE P.MENU_LV < 32 " +
            ") ";

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    // ────────────────────────────────────────────────────────────────
    // 메뉴 폴더
    // ────────────────────────────────────────────────────────────────

    /**
     * 메뉴 폴더 고르기 목록(모듈 = MENU_LV 1, 폴더 = 2 이상). 화면 메뉴(잎)는 없다. 정렬 = 트리 순서.
     *
     * <p>칸: MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_LV · MENU_PATH.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> folderLov() {
        String sql = "WITH " + FOLDER_TREE_CTE +
                "SELECT MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_LV, MENU_PATH FROM FT ORDER BY SORT_PATH";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("MENU_ID", r[0]);
            m.put("MENU_NM", r[1]);
            m.put("PARENT_MENU_ID", r[2]);
            m.put("MENU_LV", toInt(r[3]));
            m.put("MENU_PATH", r[4]);
            out.add(m);
        }
        return out;
    }

    /** 폴더 하나와 그 아래 모든 폴더의 MENU_ID. 빈 값·없는 폴더 = 빈 집합. */
    @SuppressWarnings("unchecked")
    public Set<String> folderSubtree(String menuId) {
        if (menuId == null || menuId.isBlank()) return Set.of();
        String sql =
                "WITH ST (MENU_ID, LV) AS ( " +
                "    SELECT F.MENU_ID, 0 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F WHERE F.MENU_ID = :menuId " +
                "    UNION ALL " +
                "    SELECT C.MENU_ID, P.LV + 1 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD C " +
                "      JOIN ST P ON C.PARENT_MENU_ID = P.MENU_ID WHERE P.LV < 32 " +
                ") SELECT DISTINCT MENU_ID FROM ST";
        List<Object> rows = entityManager.createNativeQuery(sql).setParameter("menuId", menuId).getResultList();
        Set<String> out = new LinkedHashSet<>();
        for (Object r : rows) out.add(String.valueOf(r));
        return out;
    }

    /**
     * 오브젝트마다 대표 메뉴 한 개와 메뉴 수. 대표 = WEB 메뉴 먼저, 그다음 트리 순서.
     * 메뉴가 없는 오브젝트는 결과에 없다.
     */
    @SuppressWarnings("unchecked")
    public Map<String, ObjMenu> objMenus() {
        String sql = "WITH " + FOLDER_TREE_CTE +
                ", MM AS ( " +
                "    SELECT M.OBJECT_ID, M.MENU_ID, M.MENU_NM, M.PARENT_MENU_ID, FT.MENU_PATH, " +
                "           COALESCE(FT.SORT_PATH, '~') || '/' || LPAD(COALESCE(M.MENU_SEQ, '0'), 30, '0') || M.MENU_ID AS SORT_KEY, " +
                "           ROW_NUMBER() OVER (PARTITION BY M.OBJECT_ID ORDER BY CASE WHEN M.MENU_TP = 'WEB' THEN 0 ELSE 1 END, " +
                "               COALESCE(FT.SORT_PATH, '~'), LPAD(COALESCE(M.MENU_SEQ, '0'), 30, '0'), M.MENU_ID) AS RN, " +
                "           COUNT(*) OVER (PARTITION BY M.OBJECT_ID) AS MENU_CNT " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                "      LEFT JOIN FT ON FT.MENU_ID = M.PARENT_MENU_ID " +
                "     WHERE M.OBJECT_ID IS NOT NULL " +
                ") SELECT OBJECT_ID, MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_PATH, SORT_KEY, MENU_CNT FROM MM WHERE RN = 1";
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        Map<String, ObjMenu> out = new HashMap<>(rows.size() * 2);
        for (Object[] r : rows) {
            out.put(String.valueOf(r[0]), new ObjMenu(str(r[1]), str(r[2]), str(r[3]), str(r[4]), str(r[5]), toInt(r[6])));
        }
        return out;
    }

    /**
     * 오브젝트를 가리키는 대표 메뉴.
     *
     * @param menuId     메뉴 ID
     * @param menuNm     메뉴 이름
     * @param folderId   메뉴가 들어 있는 폴더 MENU_ID
     * @param folderPath 폴더 경로(예 "공통관리 › 시스템관리")
     * @param sortKey    트리 순서 정렬 키
     * @param menuCnt    이 오브젝트를 가리키는 메뉴 수(WEB·MOBIL 모두)
     */
    public record ObjMenu(String menuId, String menuNm, String folderId, String folderPath, String sortKey, int menuCnt) {}

    // ────────────────────────────────────────────────────────────────
    // 집계
    // ────────────────────────────────────────────────────────────────

    /** 역할마다 퍼미션 수(TB_MCM_SEC_ROLE_PERM). */
    public Map<String, Long> permCntByRole() {
        return countBy("SELECT ROLE_ID, COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM GROUP BY ROLE_ID");
    }

    /** 오브젝트마다 퍼미션 수(TB_MCM_SEC_ROLE_PERM). */
    public Map<String, Long> permCntByObject() {
        return countBy("SELECT OBJECT_ID, COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM GROUP BY OBJECT_ID");
    }

    /** 역할마다 들어 있는 그룹 수(그룹 USE_TP 무관). */
    public Map<String, Long> groupCntByRole() {
        return countBy("SELECT ROLE_ID, COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GROUP BY ROLE_ID");
    }

    /** 역할마다 받는 사람 수(사용 중 그룹·사용 중 역할 기준, 그룹 겹침 제외). 사용 안 함 역할은 결과에 없다(0 으로 읽힌다). */
    public Map<String, Long> userCntByRole() {
        return countBy(
                "SELECT RGM.ROLE_ID, COUNT(DISTINCT UM.USER_ID) " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING RGM " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP RG ON RG.ROLE_GROUP_ID = RGM.ROLE_GROUP_ID AND RG.USE_TP = 'Y' " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON R.ROLE_ID = RGM.ROLE_ID AND R.USE_TP = 'Y' " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM ON UM.ROLE_GROUP_ID = RGM.ROLE_GROUP_ID " +
                " GROUP BY RGM.ROLE_ID");
    }

    /** 역할 여러 개를 받는 서로 다른 사람 수(사용 중 그룹·사용 중 역할 기준 — 사용 안 함 역할은 아무것도 주지 않는다). 빈 목록 = 0. */
    public long distinctUserCnt(Collection<String> roleIds) {
        if (roleIds == null || roleIds.isEmpty()) return 0L;
        Object v = entityManager.createNativeQuery(
                "SELECT COUNT(DISTINCT UM.USER_ID) " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING RGM " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP RG ON RG.ROLE_GROUP_ID = RGM.ROLE_GROUP_ID AND RG.USE_TP = 'Y' " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON R.ROLE_ID = RGM.ROLE_ID AND R.USE_TP = 'Y' " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM ON UM.ROLE_GROUP_ID = RGM.ROLE_GROUP_ID " +
                " WHERE RGM.ROLE_ID IN (:roleIds)")
                .setParameter("roleIds", roleIds)
                .getSingleResult();
        return toLong(v);
    }

    /**
     * 역할이 들어 있는 그룹(그룹 USE_TP 무관)과 그룹마다 사람 수. 정렬 = ROLE_GROUP_ID.
     * 행 집합은 그룹 USE_TP 와 무관하게 모두 낸다. 단 위쪽 사람 수와 맞추려고 사용 안 함({@code USE_TP<>'Y'}) 그룹의
     * {@code USER_CNT} 는 0 이다(사용 안 함 그룹은 사람에게 아무것도 주지 않는다).
     *
     * <p>칸: ROLE_GROUP_ID · ROLE_GROUP_NM · USE_TP · USER_CNT.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> groupsOfRole(String roleId) {
        if (roleId == null || roleId.isBlank()) return new ArrayList<>();
        String sql =
                "SELECT RG.ROLE_GROUP_ID, RG.ROLE_GROUP_NM, CAST(RG.USE_TP AS VARCHAR2(10)), " +
                "       (SELECT COUNT(DISTINCT UM.USER_ID) FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING UM " +
                "         WHERE UM.ROLE_GROUP_ID = RG.ROLE_GROUP_ID AND RG.USE_TP = 'Y') AS USER_CNT " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING RGM " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP RG ON RG.ROLE_GROUP_ID = RGM.ROLE_GROUP_ID " +
                " WHERE RGM.ROLE_ID = :roleId " +
                " ORDER BY RG.ROLE_GROUP_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("roleId", roleId).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_GROUP_ID", r[0]);
            m.put("ROLE_GROUP_NM", r[1]);
            m.put("USE_TP", r[2]);
            m.put("USER_CNT", toLong(r[3]));
            out.add(m);
        }
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // commRoleGrpMng — 역할 그룹 메뉴 미리보기(옛 SecRoleGroupMappingNativeRepository#searchCmRoleGrpMenu 대체)
    // ────────────────────────────────────────────────────────────────

    /**
     * 역할 그룹이 볼 수 있는 메뉴 트리 미리보기. 옛 쿼리와 칸이 같고, 원천을 옛 매핑 → 새 퍼미션으로 바꿨다.
     * SYSADMIN 역할은 퍼미션 행 없이 사용 중 오브젝트를 가리키는 모든 메뉴를 본다(decompose D13).
     *
     * <p>옛 쿼리 결함 고침: 옛 쿼리는 화면 메뉴(잎, TB_MCM_SEC_MENU) ID 를 폴더 표에서 찾아 트리를 시작해
     * 결과가 늘 비었다. 지금은 잎 메뉴(OBJECT_ID 있음)에서 시작해 폴더로 올라가 대상 노드를 모은 뒤,
     * 뿌리(대상 폴더 가운데 부모가 대상에 없는 노드)에서 내려가며 {@code LEV}(treelevel)를 매긴다 — 뿌리 = 0, 깊을수록 크다.
     * 같은 노드는 한 줄만 낸다. 오브젝트가 사용 안 함({@code TB_MCM_SEC_OBJ.USE_TP<>'Y'})이면 역할 종류와 상관없이 빠진다.
     *
     * <p>칸 8개: MENU_ID · MENU_SEQ · MENU_NM · LEV · PARENT_MENU_ID · ROW_SEQ · OBJECT_ID · MENU_VIEW_YN.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> roleGroupMenu(String roleGroupId) {
        String sql =
                "WITH MROLE AS ( " +
                "    SELECT DISTINCT MNU.MENU_ID " +
                "      FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING RGM " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP RG ON RGM.ROLE_GROUP_ID = RG.ROLE_GROUP_ID " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON RGM.ROLE_ID = R.ROLE_ID " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_MENU MNU ON MNU.OBJECT_ID IS NOT NULL " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_OBJ SO ON SO.OBJECT_ID = MNU.OBJECT_ID AND SO.USE_TP = 'Y' " +
                "     WHERE RGM.ROLE_GROUP_ID = :roleGroupId " +
                "       AND RG.USE_TP = 'Y' " +
                "       AND R.USE_TP = 'Y' " +
                "       AND MNU.USE_TP = 'Y' " +
                "       AND MNU.MENU_TP = 'WEB' " +
                "       AND ( R.ROLE_ID IN (" + SYSADMIN_IN_SQL + ") " +
                "          OR EXISTS (SELECT 1 FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM RP " +
                "                      WHERE RP.ROLE_ID = R.ROLE_ID AND RP.OBJECT_ID = MNU.OBJECT_ID) ) " +
                "), MENU_TREE (MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, MENU_VIEW_YN, OBJECT_ID, KIND, LEV) AS ( " +
                "    SELECT L.MENU_ID, CAST(L.MENU_NM AS VARCHAR2(300)), L.PARENT_MENU_ID, L.MENU_SEQ, L.MENU_VIEW_YN, " +
                "           L.OBJECT_ID, CAST('L' AS VARCHAR2(1)), 0 " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU L " +
                "     WHERE L.MENU_ID IN (SELECT MENU_ID FROM MROLE) " +
                "    UNION ALL " +
                "    SELECT P.MENU_ID, CAST(P.MENU_NM AS VARCHAR2(300)), P.PARENT_MENU_ID, P.MENU_SEQ, P.MENU_VIEW_YN, " +
                "           CAST(NULL AS VARCHAR2(50)), CAST('F' AS VARCHAR2(1)), T.LEV + 1 " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD P " +
                "      JOIN MENU_TREE T ON T.PARENT_MENU_ID = P.MENU_ID " +
                "     WHERE T.LEV < 32 " +
                "), SEL (MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, MENU_VIEW_YN, OBJECT_ID, KIND) AS ( " +
                "    SELECT DISTINCT MENU_ID, MENU_NM, PARENT_MENU_ID, MENU_SEQ, MENU_VIEW_YN, OBJECT_ID, KIND FROM MENU_TREE " +
                "), DOWN_TREE (MENU_ID, KIND, LEV) AS ( " +
                "    SELECT S.MENU_ID, S.KIND, 0 FROM SEL S " +
                "     WHERE NOT EXISTS (SELECT 1 FROM SEL PF WHERE PF.KIND = 'F' AND PF.MENU_ID = S.PARENT_MENU_ID) " +
                "    UNION ALL " +
                "    SELECT C.MENU_ID, C.KIND, D.LEV + 1 FROM SEL C " +
                "      JOIN DOWN_TREE D ON D.KIND = 'F' AND C.PARENT_MENU_ID = D.MENU_ID " +
                "     WHERE D.LEV < 32 " +
                ") " +
                "SELECT M.MENU_ID, " +
                "       LPAD(COALESCE(CAST(M.MENU_SEQ AS VARCHAR(30)), '0'), 30, '0') AS MENU_SEQ, " +
                "       M.MENU_NM, " +
                "       M.LEV, " +
                "       M.PARENT_MENU_ID, " +
                "       ROW_NUMBER() OVER (ORDER BY M.MENU_SEQ, M.MENU_ID) AS ROW_SEQ, " +
                "       M.OBJECT_ID, " +
                "       CAST(M.MENU_VIEW_YN AS VARCHAR(20)) " +
                "  FROM (SELECT S.MENU_ID, S.MENU_NM, S.PARENT_MENU_ID, S.MENU_SEQ, S.MENU_VIEW_YN, S.OBJECT_ID, MIN(D.LEV) AS LEV " +
                "          FROM SEL S JOIN DOWN_TREE D ON D.MENU_ID = S.MENU_ID AND D.KIND = S.KIND " +
                "         GROUP BY S.MENU_ID, S.MENU_NM, S.PARENT_MENU_ID, S.MENU_SEQ, S.MENU_VIEW_YN, S.OBJECT_ID) M " +
                " ORDER BY M.MENU_SEQ, M.MENU_ID";
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

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Long> countBy(String sql) {
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        Map<String, Long> out = new HashMap<>(rows.size() * 2);
        for (Object[] r : rows) out.put(String.valueOf(r[0]), toLong(r[1]));
        return out;
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static long toLong(Object v) {
        return v == null ? 0L : ((Number) v).longValue();
    }

    private static int toInt(Object v) {
        return v == null ? 0 : ((Number) v).intValue();
    }
}
