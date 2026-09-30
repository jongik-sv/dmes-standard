package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.entity.MdmRuleSetTestCase;
import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * TB_MDM_RULE_SET_TEST_CASE 조회(흐름도 3단계 P7). 리포지토리에 메서드를 선언하지 않는다(가드 {@code MdmRuleContractOnlyArchitectureTest}).
 */
@Component
public class RuleSetTestCaseQueries {

    private final EntityManager entityManager;

    public RuleSetTestCaseQueries(EntityManager entityManager) {
        this.entityManager = entityManager;
    }

    /** 한 세트의 케이스 — case_id 오름차순. 상한 없이 읽는다(일괄 실행의 50건 검사가 닿게 하려고 여기서 자르지 않는다). */
    public List<MdmRuleSetTestCase> cases(String setId) {
        return entityManager.createQuery("SELECT c FROM MdmRuleSetTestCase c WHERE c.maruRuleSetId = :id ORDER BY c.caseId",
                MdmRuleSetTestCase.class).setParameter("id", setId).getResultList();
    }

    /** 한 세트의 케이스 수. */
    public long count(String setId) {
        return entityManager.createQuery("SELECT COUNT(c) FROM MdmRuleSetTestCase c WHERE c.maruRuleSetId = :id", Long.class)
                .setParameter("id", setId).getSingleResult();
    }

    /** 한 세트에서 가장 큰 case_id, 없으면 0. */
    public int maxCaseId(String setId) {
        Integer max = entityManager.createQuery("SELECT MAX(c.caseId) FROM MdmRuleSetTestCase c WHERE c.maruRuleSetId = :id", Integer.class)
                .setParameter("id", setId).getSingleResult();
        return max == null ? 0 : max;
    }
}
