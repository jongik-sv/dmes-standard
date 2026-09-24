package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmRuleTestCase} 복합 PK({@code MARU_RULE_ID, CASE_ID}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmRuleTestCase} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmRuleTestCaseId implements Serializable {

    private String maruRuleId;
    private Integer caseId;

    public MdmRuleTestCaseId() {
        // JPA 기본 생성자
    }

    public MdmRuleTestCaseId(String maruRuleId, Integer caseId) {
        this.maruRuleId = maruRuleId;
        this.caseId = caseId;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getCaseId() { return caseId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmRuleTestCaseId other)) {
            return false;
        }
        return Objects.equals(maruRuleId, other.maruRuleId) && Objects.equals(caseId, other.caseId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleId, caseId);
    }
}
