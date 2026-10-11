package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;

/**
 * ERD 다이어그램 위 관계선의 꺾임점 — {@code TB_MDM_ERD_DIAGRAM_ROUTE}(V7). REL_UUID 는 모델 JSON 의 관계 키다(관계 FK 없음).
 * POINTS_JSON = {@code [{"x":정수,"y":정수},…]} 1~50개. 감사 카운터는 {@code VER}.
 */
@Entity
@Table(name = "TB_MDM_ERD_DIAGRAM_ROUTE")
@IdClass(MdmErdDiagramRouteId.class)
public class MdmErdDiagramRoute extends CactusAuditEntity {

    @Id @Column(name = "DIAGRAM_ID", length = 50) private String diagramId;
    @Id @Column(name = "REL_UUID", length = 50) private String relUuid;
    @Lob @Column(name = "POINTS_JSON", nullable = false) private String pointsJson;

    protected MdmErdDiagramRoute() {
        // JPA 기본 생성자
    }

    public MdmErdDiagramRoute(String diagramId, String relUuid, String pointsJson) {
        this.diagramId = diagramId;
        this.relUuid = relUuid;
        this.pointsJson = pointsJson;
    }

    public String getDiagramId() { return diagramId; }
    public String getRelUuid() { return relUuid; }
    public String getPointsJson() { return pointsJson; }
    public void setPointsJson(String v) { this.pointsJson = v; }
}
