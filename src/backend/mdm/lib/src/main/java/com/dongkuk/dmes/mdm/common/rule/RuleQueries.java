package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
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
     * 는 글자 그대로다.
     */
    public record RuleFilter(String keyword, String ruleKind, String status) {
    }

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

    private static String where(RuleFilter f) {
        StringBuilder sb = new StringBuilder(" WHERE 1 = 1");
        if (f.keyword() != null) {
            sb.append(" AND (UPPER(r.maruRuleId) LIKE :kw ESCAPE '\\' OR UPPER(r.maruRuleName) LIKE :kw ESCAPE '\\')");
        }
        if (f.ruleKind() != null) {
            sb.append(" AND r.ruleKind = :kind");
        }
        if (f.status() != null) {
            sb.append(" AND r.status = :status");
        }
        return sb.toString();
    }

    private static Map<String, Object> bind(RuleFilter f) {
        Map<String, Object> params = new LinkedHashMap<>();
        if (f.keyword() != null) {
            String escaped = f.keyword().toUpperCase(Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
            params.put("kw", "%" + escaped + "%");
        }
        if (f.ruleKind() != null) {
            params.put("kind", f.ruleKind());
        }
        if (f.status() != null) {
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
}
