/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: 역할 그룹마다 받은 사람 수·연결된 역할 수(perm-crudfix c1 — 그룹 끄기 확인 창 문구용)
 */
package com.dongkuk.dmes.mcm.csa.commPerm;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 역할 그룹 사용 현황 — 그룹 목록 한 번 조회에 쿼리 두 번(그룹마다 세지 않는다). */
@Repository
public class GroupUsageQuery {

    /** 그룹 하나의 사용 현황. */
    public record Usage(long userCnt, long roleCnt) {
        public static final Usage NONE = new Usage(0, 0);
    }

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /** 그룹 ID → 받은 사람 수(USER_MAPPING 행 수)·연결된 역할 수(ROLEGROUP_MAPPING 행 수). 없는 그룹 = 결과에 없음. */
    public Map<String, Usage> byGroup() {
        Map<String, Long> users = counts(
                "SELECT ROLE_GROUP_ID, COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING GROUP BY ROLE_GROUP_ID");
        Map<String, Long> roles = counts(
                "SELECT ROLE_GROUP_ID, COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING GROUP BY ROLE_GROUP_ID");
        Map<String, Usage> out = new HashMap<>();
        users.forEach((g, n) -> out.put(g, new Usage(n, roles.getOrDefault(g, 0L))));
        roles.forEach((g, n) -> out.putIfAbsent(g, new Usage(0, n)));
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Long> counts(String sql) {
        List<Object[]> rows = entityManager.createNativeQuery(sql).getResultList();
        Map<String, Long> out = new HashMap<>();
        for (Object[] r : rows) {
            if (r[0] != null) out.put(String.valueOf(r[0]), ((Number) r[1]).longValue());
        }
        return out;
    }
}
