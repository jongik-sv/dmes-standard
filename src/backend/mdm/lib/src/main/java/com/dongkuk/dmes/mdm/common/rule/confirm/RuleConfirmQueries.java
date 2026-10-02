package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * 룰 버전 확정 조회(TSK-08-05 design §2) — JPQL 전용, 네이티브 SQL 없음(I15). 리포지토리에 메서드를 선언하지 않는다(08-01 가드).
 */
@Component
public class RuleConfirmQueries {

    private final EntityManager entityManager;

    public RuleConfirmQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 확정 대기 한 행 — MDM 원천 룰과 그 DRAFT 버전. */
    public record Pending(MdmRule rule, MdmRuleVer version) {
    }

    /**
     * 이름 → 그 이름을 만드는 다른 룰 ID(I10) — {@code ruleId} 가 아닌 룰의 <b>모든 버전</b>에서 RESULT 변수의 {@code VAR_NAME} 또는
     * {@code RES_GRP} 가 그 이름인 룰. 만드는 룰이 없는 이름은 빠진다.
     */
    public Map<String, Set<String>> producers(String ruleId, Collection<String> names) {
        Map<String, Set<String>> out = new LinkedHashMap<>();
        if (names.isEmpty()) {
            return out;
        }
        List<Object[]> rows = entityManager.createQuery("""
                SELECT DISTINCT v.maruRuleId, v.varName, v.resGrp FROM MdmRuleVar v
                WHERE v.varKind = 'RESULT' AND v.maruRuleId <> :ruleId AND (v.varName IN :names OR v.resGrp IN :names)
                ORDER BY v.maruRuleId
                """, Object[].class).setParameter("ruleId", ruleId).setParameter("names", names).getResultList();
        for (Object[] row : rows) {
            for (Object name : new Object[] {row[1], row[2]}) {
                if (name instanceof String n && names.contains(n)) {
                    out.computeIfAbsent(n, k -> new LinkedHashSet<>()).add((String) row[0]);
                }
            }
        }
        return out;
    }

    /**
     * 확정 대기 목록 — MDM 원천 룰의 DRAFT 버전, 룰 ID·VER 오름차순. 키워드는 룰 ID·룰명 부분 일치(대문자 비교, {@code %}·{@code _}·{@code \} 는
     * 글자 그대로). 빈 키워드는 조건에서 뺀다. VER 정렬은 Java 에서 한다 — SQLite 가 1.000·1.001 을 INTEGER·REAL 로 섞어 저장한다(D-144).
     */
    public List<Pending> drafts(String keyword) {
        String kw = keyword == null || keyword.isBlank() ? null : keyword.trim().toUpperCase(Locale.ROOT);
        TypedQuery<Object[]> q = entityManager.createQuery("SELECT r, v FROM MdmRule r, MdmRuleVer v "
                + "WHERE v.maruRuleId = r.maruRuleId AND v.status = 'DRAFT' AND r.sourceKind = 'MDM'"
                + (kw == null ? "" : " AND (UPPER(r.maruRuleId) LIKE :kw ESCAPE '\\' OR UPPER(r.maruRuleName) LIKE :kw ESCAPE '\\')")
                + " ORDER BY r.maruRuleId", Object[].class);
        if (kw != null) {
            q.setParameter("kw", "%" + kw.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
        }
        List<Pending> out = new ArrayList<>();
        for (Object[] row : q.getResultList()) {
            out.add(new Pending((MdmRule) row[0], (MdmRuleVer) row[1]));
        }
        out.sort(Comparator.comparing((Pending p) -> p.rule().getMaruRuleId()).thenComparing(p -> p.version().getVer()));
        return out;
    }
}
