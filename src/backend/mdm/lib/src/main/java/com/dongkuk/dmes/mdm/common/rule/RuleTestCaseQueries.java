package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * TB_MDM_RULE_TEST_CASE 조회(TSK-08-04 design §2.3). 리포지토리에 메서드를 선언하지 않는다(가드 {@code MdmRuleContractOnlyArchitectureTest}).
 * 케이스는 버전과 무관하다(06:1058).
 */
@Component
public class RuleTestCaseQueries {

    private final EntityManager entityManager;

    public RuleTestCaseQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 한 룰의 케이스 — case_id 오름차순, 룰당 상한({@link RuleLimits#MAX_CASES_PER_RULE})까지. */
    public List<MdmRuleTestCase> cases(String ruleId) {
        return entityManager.createQuery("SELECT c FROM MdmRuleTestCase c WHERE c.maruRuleId = :id ORDER BY c.caseId", MdmRuleTestCase.class)
                .setParameter("id", ruleId).setMaxResults(RuleLimits.MAX_CASES_PER_RULE).getResultList();
    }

    /** 한 룰의 케이스 수. */
    public long count(String ruleId) {
        return entityManager.createQuery("SELECT COUNT(c) FROM MdmRuleTestCase c WHERE c.maruRuleId = :id", Long.class)
                .setParameter("id", ruleId).getSingleResult();
    }
}
