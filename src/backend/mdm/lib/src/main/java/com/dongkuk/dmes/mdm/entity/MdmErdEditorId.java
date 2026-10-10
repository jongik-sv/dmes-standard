package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Objects;

/** {@link MdmErdEditor} 복합 PK(ERD_MODEL_ID, VER, USER_ID). 같음은 VER 값 비교(scale 무관). */
public class MdmErdEditorId implements Serializable {

    private String erdModelId;
    private BigDecimal ver;
    private String userId;

    public MdmErdEditorId() {
    }

    public MdmErdEditorId(String erdModelId, BigDecimal ver, String userId) {
        this.erdModelId = erdModelId;
        this.ver = VersionNumbers.scaled(ver);
        this.userId = userId;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdEditorId other && Objects.equals(erdModelId, other.erdModelId)
                && VersionNumbers.same(ver, other.ver) && Objects.equals(userId, other.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(erdModelId, ver == null ? null : ver.stripTrailingZeros(), userId);
    }
}
