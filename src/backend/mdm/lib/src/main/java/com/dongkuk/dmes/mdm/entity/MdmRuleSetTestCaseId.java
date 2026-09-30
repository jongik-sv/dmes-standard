package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmRuleSetTestCase} 복합 PK({@code MARU_RULE_SET_ID, CASE_ID}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmRuleSetTestCase} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmRuleSetTestCaseId implements Serializable {

    private String maruRuleSetId;
    private Integer caseId;

    public MdmRuleSetTestCaseId() {
        // JPA 기본 생성자
    }

    public MdmRuleSetTestCaseId(String maruRuleSetId, Integer caseId) {
        this.maruRuleSetId = maruRuleSetId;
        this.caseId = caseId;
    }

    public String getMaruRuleSetId() { return maruRuleSetId; }
    public Integer getCaseId() { return caseId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmRuleSetTestCaseId other)) {
            return false;
        }
        return Objects.equals(maruRuleSetId, other.maruRuleSetId) && Objects.equals(caseId, other.caseId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleSetId, caseId);
    }
}
