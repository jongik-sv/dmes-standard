package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link MdmRuleVer} 복합 PK({@code MARU_RULE_ID, VER}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmRuleVer} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmRuleVerId implements Serializable {

    private String maruRuleId;
    private Integer ver;

    public MdmRuleVerId() {
        // JPA 기본 생성자
    }

    public MdmRuleVerId(String maruRuleId, Integer ver) {
        this.maruRuleId = maruRuleId;
        this.ver = ver;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmRuleVerId other)) {
            return false;
        }
        return Objects.equals(maruRuleId, other.maruRuleId) && Objects.equals(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleId, ver);
    }
}
