package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/** {@link MdmRuleSetVer} 복합 PK(MARU_RULE_SET_ID, VER). 같음은 VER 값 비교(scale 무관). */
public class MdmRuleSetVerId implements Serializable {

    private String maruRuleSetId;
    private BigDecimal ver;

    public MdmRuleSetVerId() {
    }

    public MdmRuleSetVerId(String maruRuleSetId, BigDecimal ver) {
        this.maruRuleSetId = maruRuleSetId;
        this.ver = VersionNumbers.scaled(ver);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmRuleSetVerId other && Objects.equals(maruRuleSetId, other.maruRuleSetId)
                && VersionNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(maruRuleSetId, ver == null ? null : ver.stripTrailingZeros());
    }
}
