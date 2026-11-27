/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 영향 표시용 이름 조회(native, 읽기 전용) — 사용자·오브젝트 이름. IN 목록은 500개씩 끊는다
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.repository;

import com.dongkuk.dmes.mcm.csa.commPermBench.service.PermImpactNames;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** {@link PermImpactNames} 의 Oracle 구현(Oracle IN 1,000 한도 → 500개씩). */
@Repository
public class PermImpactNameRepository implements PermImpactNames {

    private static final String S = "MCMAPUSER.";
    private static final int CHUNK = 500;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    @Override
    public Map<String, String> userNames(Collection<String> userIds) {
        return names("SELECT USER_ID, USER_NM FROM " + S + "TB_MCM_SEC_USER WHERE USER_ID IN (:ids)", userIds);
    }

    @Override
    public Map<String, String> objectNames(Collection<String> objectIds) {
        return names("SELECT OBJECT_ID, OBJECT_NM FROM " + S + "TB_MCM_SEC_OBJ WHERE OBJECT_ID IN (:ids)", objectIds);
    }

    @SuppressWarnings("unchecked")
    private Map<String, String> names(String sql, Collection<String> ids) {
        Map<String, String> out = new LinkedHashMap<>();
        List<String> all = new ArrayList<>(ids);
        for (int i = 0; i < all.size(); i += CHUNK) {
            List<String> part = all.subList(i, Math.min(all.size(), i + CHUNK));
            List<Object[]> rows = entityManager.createNativeQuery(sql).setParameter("ids", part).getResultList();
            for (Object[] r : rows) {
                out.put(String.valueOf(r[0]), r[1] == null ? null : String.valueOf(r[1]));
            }
        }
        return out;
    }
}
