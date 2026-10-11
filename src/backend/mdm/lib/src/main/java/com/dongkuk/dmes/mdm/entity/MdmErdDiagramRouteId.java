package com.dongkuk.dmes.mdm.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link MdmErdDiagramRoute} 복합 PK(DIAGRAM_ID, REL_UUID). */
public class MdmErdDiagramRouteId implements Serializable {

    private String diagramId;
    private String relUuid;

    public MdmErdDiagramRouteId() {
    }

    public MdmErdDiagramRouteId(String diagramId, String relUuid) {
        this.diagramId = diagramId;
        this.relUuid = relUuid;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof MdmErdDiagramRouteId other && Objects.equals(diagramId, other.diagramId)
                && Objects.equals(relUuid, other.relUuid);
    }

    @Override
    public int hashCode() {
        return Objects.hash(diagramId, relUuid);
    }
}
