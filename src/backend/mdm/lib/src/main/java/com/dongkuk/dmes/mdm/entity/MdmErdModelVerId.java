package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/** {@link MdmErdModelVer} 복합 PK(ERD_MODEL_ID, VER). 같음은 VER 값 비교(scale 무관). */
public class MdmErdModelVerId implements Serializable {

    private String erdModelId;
    private BigDecimal ver;

    public MdmErdModelVerId() {
    }

    public MdmErdModelVerId(String erdModelId, BigDecimal ver) {
        this.erdModelId = erdModelId;
        this.ver = VersionNumbers.scaled(ver);
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdModelVerId other && Objects.equals(erdModelId, other.erdModelId)
                && VersionNumbers.same(ver, other.ver);
    }

    @Override
    public int hashCode() {
        return Objects.hash(erdModelId, ver == null ? null : ver.stripTrailingZeros());
    }
}
