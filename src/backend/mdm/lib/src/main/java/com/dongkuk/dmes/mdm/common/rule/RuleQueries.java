package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleRow;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Repository;

/**
 * 06 룰 조회 전용(TSK-08-02 design §2.1-C, D12). 06 리포지토리 6개는 메서드를 선언하지 않으므로(TSK-08-01 가드) 조회는 여기에
 * JPQL 로 모은다. JPQL 은 SQLite·MSSQL 에서 같은 코드로 돈다. 버전 비교는 정수 VER 라 SQL 에서 해도 된다.
 */
@Repository
public class RuleQueries {

    private final EntityManager entityManager;

    public RuleQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /**
     * 룰 목록 필터(design I29). 빈 값은 조건에서 뺀다. 키워드는 룰 ID·룰명을 대문자로 바꿔 부분 일치로 보고 {@code %}·{@code _}·{@code \}
     * 는 글자 그대로다. 상태는 계산 상태로 거른다(TSK-08-05 design §6.7, I19) — {@code now} 는 그 기준 시각이다.
     */
    public record RuleFilter(String keyword, String ruleKind, String status, LocalDateTime now) {
    }

    /** 적용된 RELEASED 가 있다 — {@link RuleVersions#effectiveStatus} 의 JPQL 판(경계 포함). */
    private static final String APPLIED_RELEASED = "EXISTS (SELECT v.ver FROM MdmRuleVer v WHERE v.maruRuleId = r.maruRuleId "
            + "AND v.status = 'RELEASED' AND v.applyFrom <= :now)";

    /** 한 페이지 — 정렬 {@code maruRuleId}, JPQL {@code setFirstResult/setMaxResults}(SQLite·MSSQL 같은 코드). */
    public List<MdmRule> pageRules(RuleFilter filter, int page, int size) {
        TypedQuery<MdmRule> q = entityManager.createQuery("SELECT r FROM MdmRule r" + where(filter) + " ORDER BY r.maruRuleId", MdmRule.class);
        bind(filter).forEach(q::setParameter);
        return q.setFirstResult(page * size).setMaxResults(size).getResultList();
    }

    /** 같은 필터의 전체 건수. */
    public long countRules(RuleFilter filter) {
        TypedQuery<Long> q = entityManager.createQuery("SELECT COUNT(r) FROM MdmRule r" + where(filter), Long.class);
        bind(filter).forEach(q::setParameter);
        return q.getSingleResult();
    }

    /** 여러 룰의 버전 전부(룰 ID·VER 내림차순). 목록 한 페이지의 RELEASED·미적용 칸을 한 번에 채운다. */
    public List<MdmRuleVer> versionsOf(Collection<String> ruleIds) {
        if (ruleIds.isEmpty()) {
            return List.of();
        }
        return entityManager.createQuery("SELECT v FROM MdmRuleVer v WHERE v.maruRuleId IN :ids ORDER BY v.maruRuleId, v.ver DESC",
                MdmRuleVer.class).setParameter("ids", ruleIds).getResultList();
    }

    /** 룰 고르기 — 룰 ID·룰명 앞부분(대문자 비교, {@code %}·{@code _} 는 글자 그대로), 룰 ID 순 {@code limit} 건. 키워드가 없으면 앞에서부터. */
    public List<MdmRule> searchPrefix(String keyword, int limit) {
        String jpql = "SELECT r FROM MdmRule r"
                + (keyword == null ? "" : " WHERE UPPER(r.maruRuleId) LIKE :kw ESCAPE '\\' OR UPPER(r.maruRuleName) LIKE :kw ESCAPE '\\'")
                + " ORDER BY r.maruRuleId";
        TypedQuery<MdmRule> q = entityManager.createQuery(jpql, MdmRule.class);
        if (keyword != null) {
            q.setParameter("kw", escapeLike(keyword.toUpperCase(Locale.ROOT)) + "%");
        }
        return q.setMaxResults(limit).getResultList();
    }

    /** 한 룰의 버전 전부 — VER 내림차순. */
    public List<MdmRuleVer> versions(String ruleId) {
        return entityManager.createQuery("SELECT v FROM MdmRuleVer v WHERE v.maruRuleId = :id ORDER BY v.ver DESC", MdmRuleVer.class)
                .setParameter("id", ruleId).getResultList();
    }

    /** 한 버전의 변수 — COND 먼저, seq·var_id 순. */
    public List<MdmRuleVar> vars(String ruleId, int ver) {
        return entityManager.createQuery("SELECT v FROM MdmRuleVar v WHERE v.maruRuleId = :id AND v.ver = :ver "
                        + "ORDER BY CASE WHEN v.varKind = 'COND' THEN 0 ELSE 1 END, v.seq, v.varId", MdmRuleVar.class)
                .setParameter("id", ruleId).setParameter("ver", ver).getResultList();
    }

    /** 한 버전의 행 — NORMAL 먼저 seq·row_id 순, 기본 행은 마지막(06:942). */
    public List<MdmRuleRow> rows(String ruleId, int ver) {
        return entityManager.createQuery("SELECT r FROM MdmRuleRow r WHERE r.maruRuleId = :id AND r.ver = :ver "
                        + "ORDER BY CASE WHEN r.rowKind = 'NORMAL' THEN 0 ELSE 1 END, r.seq, r.rowId", MdmRuleRow.class)
                .setParameter("id", ruleId).setParameter("ver", ver).getResultList();
    }

    /** 한 버전의 row_id — 엔티티를 영속성 컨텍스트에 올리지 않는다(같은 트랜잭션에서 행을 지우고 다시 넣는다). */
    public List<Integer> rowIds(String ruleId, int ver) {
        return entityManager.createQuery("SELECT r.rowId FROM MdmRuleRow r WHERE r.maruRuleId = :id AND r.ver = :ver", Integer.class)
                .setParameter("id", ruleId).setParameter("ver", ver).getResultList();
    }

    /** 한 버전의 행을 모두 지운다(표 저장의 전체 교체, I8). 호출자 트랜잭션 안에서만 쓴다. */
    public int deleteRows(String ruleId, int ver) {
        return entityManager.createQuery("DELETE FROM MdmRuleRow r WHERE r.maruRuleId = :id AND r.ver = :ver")
                .setParameter("id", ruleId).setParameter("ver", ver).executeUpdate();
    }

    /** 룰 세트 전부(작다) — 세트 ID 순. */
    public List<MdmRuleSet> allSets() {
        return entityManager.createQuery("SELECT s FROM MdmRuleSet s ORDER BY s.maruRuleSetId", MdmRuleSet.class).getResultList();
    }

    /** 룰마다 RELEASED 가운데 가장 큰 VER. RELEASED 가 없는 룰은 빠진다. */
    public Map<String, Integer> latestReleasedVers(Collection<String> ruleIds) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (ruleIds.isEmpty()) {
            return out;
        }
        List<Object[]> rows = entityManager.createQuery("SELECT v.maruRuleId, MAX(v.ver) FROM MdmRuleVer v "
                        + "WHERE v.status = 'RELEASED' AND v.maruRuleId IN :ids GROUP BY v.maruRuleId", Object[].class)
                .setParameter("ids", ruleIds).getResultList();
        for (Object[] row : rows) {
            out.put((String) row[0], ((Number) row[1]).intValue());
        }
        return out;
    }

    private static String escapeLike(String s) {
        return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static String where(RuleFilter f) {
        StringBuilder sb = new StringBuilder(" WHERE 1 = 1");
        if (f.keyword() != null) {
            sb.append(" AND (UPPER(r.maruRuleId) LIKE :kw ESCAPE '\\' OR UPPER(r.maruRuleName) LIKE :kw ESCAPE '\\')");
        }
        if (f.ruleKind() != null) {
            sb.append(" AND r.ruleKind = :kind");
        }
        if ("INUSE".equals(f.status())) {
            sb.append(" AND (r.status = 'INUSE' OR (r.status = 'CREATED' AND " + APPLIED_RELEASED + "))");
        } else if ("CREATED".equals(f.status())) {
            sb.append(" AND r.status = 'CREATED' AND NOT " + APPLIED_RELEASED);
        } else if (f.status() != null) {
            sb.append(" AND r.status = :status");
        }
        return sb.toString();
    }

    private static Map<String, Object> bind(RuleFilter f) {
        Map<String, Object> params = new LinkedHashMap<>();
        if (f.keyword() != null) {
            params.put("kw", "%" + escapeLike(f.keyword().toUpperCase(Locale.ROOT)) + "%");
        }
        if (f.ruleKind() != null) {
            params.put("kind", f.ruleKind());
        }
        if ("INUSE".equals(f.status()) || "CREATED".equals(f.status())) {
            params.put("now", f.now());
        } else if (f.status() != null) {
            params.put("status", f.status());
        }
        return params;
    }

    /** 다른 룰들의 최신 RELEASED 버전(VER 최대) 결과 변수 — 변수 타입 해석 갈래 5(design §6.4). */
    public List<MdmRuleVar> latestReleasedResultVarsExcept(String ruleId) {
        return entityManager.createQuery("""
                SELECT v FROM MdmRuleVar v, MdmRuleVer r
                WHERE r.maruRuleId = v.maruRuleId AND r.ver = v.ver AND r.status = 'RELEASED' AND v.varKind = 'RESULT'
                  AND v.maruRuleId <> :ruleId
                  AND r.ver = (SELECT MAX(r2.ver) FROM MdmRuleVer r2 WHERE r2.maruRuleId = r.maruRuleId AND r2.status = 'RELEASED')
                ORDER BY v.maruRuleId, v.seq, v.varId
                """, MdmRuleVar.class).setParameter("ruleId", ruleId).getResultList();
    }

    /**
     * DEPRECATED 가 아닌 룰들의 최신 RELEASED 버전(VER 최대) 결과 변수 — 룰 ID·seq·var_id 순(TSK-08-06 design §6.1-7·§6.4, I16).
     * 룰 세트 구성 지침이 결과 이름 → 만드는 룰을 찾을 때 쓴다.
     */
    public List<MdmRuleVar> latestReleasedResultVarsOfActiveRules() {
        return entityManager.createQuery("""
                SELECT v FROM MdmRuleVar v, MdmRuleVer r, MdmRule m
                WHERE r.maruRuleId = v.maruRuleId AND r.ver = v.ver AND r.status = 'RELEASED' AND v.varKind = 'RESULT'
                  AND m.maruRuleId = v.maruRuleId AND m.status <> 'DEPRECATED'
                  AND r.ver = (SELECT MAX(r2.ver) FROM MdmRuleVer r2 WHERE r2.maruRuleId = r.maruRuleId AND r2.status = 'RELEASED')
                ORDER BY v.maruRuleId, v.seq, v.varId
                """, MdmRuleVar.class).getResultList();
    }
}
