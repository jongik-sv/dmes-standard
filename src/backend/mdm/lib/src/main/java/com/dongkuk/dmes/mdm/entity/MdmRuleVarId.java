package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmRuleVar} 복합 PK({@code MARU_RULE_ID, VER, VAR_ID}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmRuleVar} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmRuleVarId implements Serializable {

    private String maruRuleId;
    private BigDecimal ver;
    private Integer varId;

    public MdmRuleVarId() {
        // JPA 기본 생성자
    }

    public MdmRuleVarId(String maruRuleId, BigDecimal ver, Integer varId) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
        this.varId = varId;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public Integer getVarId() { return varId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmRuleVarId other)) {
            return false;
        }
        return Objects.equals(maruRuleId, other.maruRuleId) && VersionNumbers.same(ver, other.ver)
                && Objects.equals(varId, other.varId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleId, ver == null ? null : ver.stripTrailingZeros(), varId);
    }
}
