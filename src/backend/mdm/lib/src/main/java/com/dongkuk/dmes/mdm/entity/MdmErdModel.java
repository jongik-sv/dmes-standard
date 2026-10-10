package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * ERD 모델 부모 — {@code TB_MDM_ERD_MODEL}. 모듈 하나 = 모델 하나(ERD 설계 스펙 D2). 감사 카운터는 {@code VER}(부모 관례, D-034).
 * 상태·{@code REV}(모델 단위 명령 순번)는 공통 버전 엔진·명령 서비스가 네이티브 SQL 로만 바꾼다({@code updatable = false}).
 */
@Entity
@Table(name = "TB_MDM_ERD_MODEL")
public class MdmErdModel extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID", length = 50) private String erdModelId;
    @Column(name = "MODULE_ID", nullable = false) private String moduleId;
    @Column(name = "SCHEMA_NAME", nullable = false) private String schemaName;
    @Column(name = "MODEL_NAME", nullable = false) private String modelName;
    @Column(name = "STATUS", nullable = false, updatable = false) private String status;
    @Column(name = "REV", nullable = false, updatable = false) private long rev;

    protected MdmErdModel() {
        // JPA 기본 생성자
    }

    /** 새 모델. 상태 CREATED·rev 0. */
    public MdmErdModel(String erdModelId, String moduleId, String schemaName, String modelName) {
        this.erdModelId = erdModelId;
        this.moduleId = moduleId;
        this.schemaName = schemaName;
        this.modelName = modelName;
        this.status = "CREATED";
        this.rev = 0;
    }

    public String getErdModelId() { return erdModelId; }
    public String getModuleId() { return moduleId; }
    public String getSchemaName() { return schemaName; }
    public String getModelName() { return modelName; }
    public String getStatus() { return status; }
    public long getRev() { return rev; }
}
