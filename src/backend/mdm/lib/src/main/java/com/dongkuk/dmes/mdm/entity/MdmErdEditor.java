package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** ERD 공동 편집자 — {@code TB_MDM_ERD_EDITOR}(스펙 D15). 소유자는 버전 행의 OWNER_ID 에 있다. 업무 칼럼 VER 와 겹치지 않게 감사 카운터는 {@code AUD_VER}(D-034). */
@Entity
@Table(name = "TB_MDM_ERD_EDITOR")
@IdClass(MdmErdEditorId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmErdEditor extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID", length = 50) private String erdModelId;
    @Id @Column(name = "VER", nullable = false, precision = 7, scale = 3) private BigDecimal ver;
    @Id @Column(name = "USER_ID", length = 50) private String userId;

    protected MdmErdEditor() {
        // JPA 기본 생성자
    }

    public MdmErdEditor(String erdModelId, BigDecimal ver, String userId) {
        this.erdModelId = erdModelId;
        this.ver = VersionNumbers.scaled(ver);
        this.userId = userId;
    }

    public String getErdModelId() { return erdModelId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public String getUserId() { return userId; }
}
