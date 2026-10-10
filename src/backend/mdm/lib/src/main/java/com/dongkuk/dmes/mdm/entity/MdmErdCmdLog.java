package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/** ERD 명령 기록 — {@code TB_MDM_ERD_CMD_LOG}(버전 밖). REV 는 {@code TB_MDM_ERD_MODEL.REV} 와 같은 순번, CHANGES_JSON 이 델타(스펙 4.4). 감사 카운터는 {@code VER}. */
@Entity
@Table(name = "TB_MDM_ERD_CMD_LOG")
@IdClass(MdmErdCmdLogId.class)
public class MdmErdCmdLog extends CactusAuditEntity {

    @Id @Column(name = "ERD_MODEL_ID", length = 50) private String erdModelId;
    @Id @Column(name = "REV", nullable = false) private long rev;
    @Column(name = "MODEL_VER", precision = 7, scale = 3) private BigDecimal modelVer;
    @Column(name = "USER_ID", nullable = false) private String userId;
    @Column(name = "SESSION_NM", nullable = false) private String sessionNm;
    @Column(name = "SOURCE", nullable = false) private String source;
    @Lob @Column(name = "CMD_JSON", nullable = false) private String cmdJson;
    @Lob @Column(name = "INVERSE_JSON", nullable = false) private String inverseJson;
    @Lob @Column(name = "CHANGES_JSON", nullable = false) private String changesJson;

    protected MdmErdCmdLog() {
        // JPA 기본 생성자
    }

    public MdmErdCmdLog(String erdModelId, long rev, BigDecimal modelVer, String userId, String sessionNm, String source,
                        String cmdJson, String inverseJson, String changesJson) {
        this.erdModelId = erdModelId;
        this.rev = rev;
        this.modelVer = modelVer;
        this.userId = userId;
        this.sessionNm = sessionNm;
        this.source = source;
        this.cmdJson = cmdJson;
        this.inverseJson = inverseJson;
        this.changesJson = changesJson;
    }

    public String getErdModelId() { return erdModelId; }
    public long getRev() { return rev; }
    public BigDecimal getModelVer() { return modelVer; }
    public String getUserId() { return userId; }
    public String getSessionNm() { return sessionNm; }
    public String getSource() { return source; }
    public String getCmdJson() { return cmdJson; }
    public String getInverseJson() { return inverseJson; }
    public String getChangesJson() { return changesJson; }
}
