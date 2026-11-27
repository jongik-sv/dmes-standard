/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commRoleMng 화면 전용 읽기 쿼리 — 이 역할의 퍼미션·메뉴 폴더 오브젝트(퍼미션 모델 v2)
 * 수정: 2026-11-27 @jongik-sv — folderObjects 하위 트리를 SQL 재귀로 풂(ORA-01795), MENU_SEQ LPAD 30
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.query;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * commRoleMng 화면만 쓰는 네이티브 읽기 쿼리. 여러 화면이 함께 쓰는 쿼리는
 * {@code repository.CommPermQueryRepository} 에 있다.
 */
@Repository
public class CommRoleMngQuery {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * 역할 한 개의 퍼미션 행과 오브젝트 허용 값. 정렬 없음(서비스가 메뉴 순서로 정렬한다).
     *
     * @param roleId 역할 ID
     * @return 칸 = ROLE_ID · OBJECT_ID · OBJECT_NM · OBJ_BTN_PERM · OBJ_POPUP_PERM · BTN_PERM · POPUP_PERM · DATA_PERM
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> rolePerms(String roleId) {
        if (roleId == null || roleId.isBlank()) return new ArrayList<>();
        String sql =
                "SELECT RP.ROLE_ID, RP.OBJECT_ID, O.OBJECT_NM, O.BTN_PERM, O.POPUP_PERM, " +
                "       RP.BTN_PERM, RP.POPUP_PERM, RP.DATA_PERM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM RP " +
                "  JOIN MCMAPUSER.TB_MCM_SEC_OBJ O ON O.OBJECT_ID = RP.OBJECT_ID " +
                " WHERE RP.ROLE_ID = :roleId";
        List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("roleId", roleId).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_ID", r[0]);
            m.put("OBJECT_ID", r[1]);
            m.put("OBJECT_NM", r[2]);
            m.put("OBJ_BTN_PERM", r[3]);
            m.put("OBJ_POPUP_PERM", r[4]);
            m.put("BTN_PERM", r[5]);
            m.put("POPUP_PERM", r[6]);
            m.put("DATA_PERM", r[7]);
            out.add(m);
        }
        return out;
    }

    /**
     * 폴더 하나(모듈 또는 폴더)와 그 아래 모든 폴더 바로 아래 화면 메뉴(TB_MCM_SEC_MENU)가 가리키는 오브젝트.
     * 오브젝트마다 그 폴더들 안의 대표 메뉴 한 개(WEB 먼저, 그다음 MENU_SEQ·MENU_ID). 빈 값·없는 폴더 = 빈 결과.
     *
     * <p>폴더 하위 트리를 SQL 안에서 풀어 IN 목록 1000개 제한(ORA-01795)을 피한다. 깊이 32 에서 멈춘다
     * ({@code CommPermMngQuery.objectIdsUnderFolder} 와 같은 방식).
     *
     * @param rootFolderId 고른 폴더 MENU_ID
     * @return 칸 = OBJECT_ID · OBJECT_NM · OBJ_BTN_PERM · OBJ_POPUP_PERM · USE_TP · MENU_NM · MENU_FOLDER_ID · MENU_SORT
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> folderObjects(String rootFolderId) {
        if (rootFolderId == null || rootFolderId.isBlank()) return new ArrayList<>();
        String sql =
                "WITH ST (MENU_ID, LV) AS ( " +
                "    SELECT F.MENU_ID, 0 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F WHERE F.MENU_ID = :menuId " +
                "    UNION ALL " +
                "    SELECT C.MENU_ID, P.LV + 1 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD C " +
                "      JOIN ST P ON C.PARENT_MENU_ID = P.MENU_ID WHERE P.LV < 32 " +
                ") " +
                "SELECT OBJECT_ID, OBJECT_NM, BTN_PERM, POPUP_PERM, USE_TP, MENU_NM, PARENT_MENU_ID, MENU_SORT FROM ( " +
                "    SELECT O.OBJECT_ID, O.OBJECT_NM, O.BTN_PERM, O.POPUP_PERM, CAST(O.USE_TP AS VARCHAR2(10)) AS USE_TP, M.MENU_NM, M.PARENT_MENU_ID, " +
                "           LPAD(COALESCE(M.MENU_SEQ, '0'), 30, '0') || M.MENU_ID AS MENU_SORT, " +
                "           ROW_NUMBER() OVER (PARTITION BY O.OBJECT_ID ORDER BY CASE WHEN M.MENU_TP = 'WEB' THEN 0 ELSE 1 END, " +
                "               LPAD(COALESCE(M.MENU_SEQ, '0'), 30, '0'), M.MENU_ID) AS RN " +
                "      FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                "      JOIN MCMAPUSER.TB_MCM_SEC_OBJ O ON O.OBJECT_ID = M.OBJECT_ID " +
                "     WHERE M.PARENT_MENU_ID IN (SELECT MENU_ID FROM ST) " +
                ") WHERE RN = 1";
        List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("menuId", rootFolderId).getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("OBJECT_ID", r[0]);
            m.put("OBJECT_NM", r[1]);
            m.put("OBJ_BTN_PERM", r[2]);
            m.put("OBJ_POPUP_PERM", r[3]);
            m.put("USE_TP", r[4]);
            m.put("MENU_NM", r[5]);
            m.put("MENU_FOLDER_ID", r[6]);
            m.put("MENU_SORT", r[7]);
            out.add(m);
        }
        return out;
    }
}
