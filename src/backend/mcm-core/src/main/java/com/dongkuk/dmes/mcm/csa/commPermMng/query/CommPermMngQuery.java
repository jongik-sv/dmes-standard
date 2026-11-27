/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commPermMng 화면 전용 읽기 쿼리 — 메뉴 폴더 아래 오브젝트(퍼미션 모델 v2)
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.query;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * commPermMng 화면만 쓰는 네이티브 쿼리. 공용 쿼리는 {@code repository.CommPermQueryRepository} 에 있다.
 */
@Repository
public class CommPermMngQuery {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * 폴더 하나(모듈 또는 폴더)와 그 아래 모든 폴더에 든 화면 메뉴가 가리키는 OBJECT_ID.
     * 메뉴 USE_TP·MENU_TP 는 보지 않는다. 빈 값·없는 폴더 = 빈 집합.
     *
     * <p>폴더 하위 트리를 SQL 안에서 풀어 IN 목록 1000개 제한(ORA-01795)을 피한다. 깊이 32 에서 멈춘다.
     */
    @SuppressWarnings("unchecked")
    public Set<String> objectIdsUnderFolder(String menuId) {
        if (menuId == null || menuId.isBlank()) return Set.of();
        String sql =
                "WITH ST (MENU_ID, LV) AS ( " +
                "    SELECT F.MENU_ID, 0 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD F WHERE F.MENU_ID = :menuId " +
                "    UNION ALL " +
                "    SELECT C.MENU_ID, P.LV + 1 FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD C " +
                "      JOIN ST P ON C.PARENT_MENU_ID = P.MENU_ID WHERE P.LV < 32 " +
                ") " +
                "SELECT DISTINCT M.OBJECT_ID FROM MCMAPUSER.TB_MCM_SEC_MENU M " +
                " WHERE M.OBJECT_ID IS NOT NULL " +
                "   AND M.PARENT_MENU_ID IN (SELECT MENU_ID FROM ST)";
        List<Object> rows = entityManager.createNativeQuery(sql).setParameter("menuId", menuId).getResultList();
        Set<String> out = new LinkedHashSet<>();
        for (Object r : rows) out.add(String.valueOf(r));
        return out;
    }
}
