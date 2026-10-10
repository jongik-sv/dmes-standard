package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link MdmErdClaim} 복합 PK(ERD_MODEL_ID, TABLE_UUID). */
public class MdmErdClaimId implements Serializable {

    private String erdModelId;
    private String tableUuid;

    public MdmErdClaimId() {
    }

    public MdmErdClaimId(String erdModelId, String tableUuid) {
        this.erdModelId = erdModelId;
        this.tableUuid = tableUuid;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdClaimId other && Objects.equals(erdModelId, other.erdModelId)
                && Objects.equals(tableUuid, other.tableUuid);
    }

    @Override
    public int hashCode() {
        return Objects.hash(erdModelId, tableUuid);
    }
}
