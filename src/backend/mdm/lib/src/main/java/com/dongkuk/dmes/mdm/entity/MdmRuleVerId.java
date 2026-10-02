package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/**
 * {@link MdmRuleVer} 복합 PK({@code MARU_RULE_ID, VER}) — {@code @IdClass} 대상.
 *
 * <p>필드명은 {@link MdmRuleVer} 의 {@code @Id} 필드명과 정확히 같아야 한다(JPA {@code @IdClass} 계약).
 */
public class MdmRuleVerId implements Serializable {

    private String maruRuleId;
    private BigDecimal ver;

    public MdmRuleVerId() {
        // JPA 기본 생성자
    }

    public MdmRuleVerId(String maruRuleId, BigDecimal ver) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
    }

    public String getMaruRuleId() { return maruRuleId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof MdmRuleVerId other)) {
            return false;
        }
        return Objects.equals(maruRuleId, other.maruRuleId) && VersionNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleId, ver == null ? null : ver.stripTrailingZeros());
    }
}
