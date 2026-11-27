/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commObjMng 전용 읽기 쿼리 — 폴더 아래 오브젝트·오브젝트의 직무 퍼미션·오브젝트를 가리키는 메뉴 (퍼미션 모델 v2)
 */
package com.dongkuk.dmes.mcm.csa.commObjMng.query;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** commObjMng 화면 하나만 쓰는 네이티브 읽기 쿼리(Oracle). 공용 쿼리는 {@code CommPermQueryRepository}. */
@Repository
public class CommObjMngQuery {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * 폴더 하나와 그 아래 모든 폴더 중 어느 하나라도 메뉴(TB_MCM_SEC_MENU)의 부모인 오브젝트 ID 집합.
     * 오브젝트의 메뉴가 여러 개면 그중 하나만 맞아도 포함한다. 빈 값·없는 폴더 = 빈 집합.
     *
     * <p>하위 폴더는 SQL 안에서 재귀로 편다 — 폴더 ID 목록을 IN 으로 넘기지 않아 1000개 제한(ORA-01795)이 없다
     * ({@code CommPermMngQuery.objectIdsUnderFolder} 와 같은 방식).
     */
    @SuppressWarnings("unchecked")
    public Set<String> objectIdsUnderFolder(String rootFolderId) {
        if (rootFolderId == null || rootFolderId.isBlank()) return new LinkedHashSet<>();
        List<Object> rows = entityManager.createNativeQuery(
                "WITH ST (MENU_ID, LV) AS ( " +
                "    SELECT F.MENU_ID, 0 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F WHERE F.MENU_ID = :menuId " +
                "    UNION ALL " +
                "    SELECT C.MENU_ID, P.LV + 1 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD C " +
                "      JOIN ST P ON C.PARENT_MENU_ID = P.MENU_ID WHERE P.LV < 32 " +
                ") " +
                "SELECT DISTINCT M.OBJECT_ID FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                " WHERE M.OBJECT_ID IS NOT NULL " +
                "   AND M.PARENT_MENU_ID IN (SELECT MENU_ID FROM ST)")
                .setParameter("menuId", rootFolderId)
                .getResultList();
        Set<String> out = new LinkedHashSet<>();
        for (Object r : rows) out.add(String.valueOf(r));
        return out;
    }

    /**
     * 오브젝트의 직무 퍼미션(직무 이름·사용 여부 포함). 정렬 = ROLE_ID.
     *
     * <p>칸: ROLE_ID · ROLE_NM · ROLE_USE_TP · BTN_PERM · POPUP_PERM · DATA_PERM.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> rolePermsOfObject(String objectId) {
        if (objectId == null || objectId.isBlank()) return new ArrayList<>();
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT P.ROLE_ID, R.ROLE_NM, CAST(R.USE_TP AS VARCHAR2(10)), P.BTN_PERM, P.POPUP_PERM, P.DATA_PERM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM P " +
                "  LEFT JOIN MCMAPUSER.TB_MCM_SEC_ROLE R ON R.ROLE_ID = P.ROLE_ID " +
                " WHERE P.OBJECT_ID = :objectId " +
                " ORDER BY P.ROLE_ID")
                .setParameter("objectId", objectId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_ID", r[0]);
            m.put("ROLE_NM", r[1]);
            m.put("ROLE_USE_TP", r[2]);
            m.put("BTN_PERM", r[3]);
            m.put("POPUP_PERM", r[4]);
            m.put("DATA_PERM", r[5]);
            out.add(m);
        }
        return out;
    }

    /**
     * 오브젝트를 가리키는 모든 메뉴(WEB·MOBIL). 정렬 = WEB 먼저, 그다음 MENU_ID.
     *
     * <p>칸: MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_TP · MENU_VIEW_YN · USE_TP (MENU_PATH 는 서비스가 붙인다).
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> menusOfObject(String objectId) {
        if (objectId == null || objectId.isBlank()) return new ArrayList<>();
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT M.MENU_ID, M.MENU_NM, M.PARENT_MENU_ID, M.MENU_TP, CAST(M.MENU_VIEW_YN AS VARCHAR2(10)), CAST(M.USE_TP AS VARCHAR2(10)) " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                " WHERE M.OBJECT_ID = :objectId " +
                " ORDER BY CASE WHEN M.MENU_TP = 'WEB' THEN 0 ELSE 1 END, M.MENU_ID")
                .setParameter("objectId", objectId)
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] r : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("MENU_ID", r[0]);
            m.put("MENU_NM", r[1]);
            m.put("PARENT_MENU_ID", r[2]);
            m.put("MENU_TP", r[3]);
            m.put("MENU_VIEW_YN", r[4]);
            m.put("USE_TP", r[5]);
            out.add(m);
        }
        return out;
    }
}
