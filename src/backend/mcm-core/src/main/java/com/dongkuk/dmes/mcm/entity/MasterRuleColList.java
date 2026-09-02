package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import java.math.BigDecimal;

/**
 * 업무기준 컬럼정의 — TB_MCA_RULE_COL_LIST (MCAAPUSER 스키마) JPA Entity.
 *
 * <p>설계서: `docs/mcm/design/masterRuleFrame/masterRuleFrame_분석리포트.md` §9.1 (업무 12 + audit).
 * 화면 cmb/masterRuleFrame(주) / masterRuleFrameColListPopup(주) / masterRuleData·masterRuleDataList(컬럼정의).
 *
 * <p>PK: (RULE_ID, COL_SEQ) — 복합키 ({@link MasterRuleColListId}). 사용자 제공 명세서 2026-06-05.
 *
 * <p>업무 컬럼 (명세서 — As-Is 1:1, RULE_ID/COL_SEQ 는 {@link MasterRuleColListId}):
 * RULE_VER NUMBER(8,2) / COL_ID VARCHAR(30) / COL_NM VARCHAR(100) / OLD_COL_ID VARCHAR(100) /
 * IO_FLAG VARCHAR(10) / COL_TYPE VARCHAR(10) / COL_LEN NUMBER(5) / COL_PREC_LEN NUMBER(5) /
 * MES_COL_ID VARCHAR(50) / MASTER_CODE_DIV VARCHAR(2).
 *
 * <p>AUDIT: As-Is 17 audit 컬럼 미매핑 — cactus-core 표준 {@link McmAuditEntity} 9 컬럼 대체 (사용자 지시 2026-06-05).
 */
@Entity
@Table(name = "TB_MCA_RULE_COL_LIST", schema = "MCAAPUSER")
public class MasterRuleColList extends McmAuditEntity {

    @EmbeddedId
    private MasterRuleColListId id;

    /** 업무기준 버전 — NUMBER(8,2). */
    @Column(name = "RULE_VER", precision = 8, scale = 2)
    private BigDecimal ruleVer;

    /** 항목ID (영문항목명) — VARCHAR(30). */
    @Column(name = "COL_ID", length = 30)
    private String colId;

    /** 항목명 (한글항목명) — VARCHAR(100). */
    @Column(name = "COL_NM", length = 100)
    private String colNm;

    /** 기존항목ID — VARCHAR(100). */
    @Column(name = "OLD_COL_ID", length = 100)
    private String oldColId;

    /** IN/OUT여부 — VARCHAR(10). */
    @Column(name = "IO_FLAG", length = 10)
    private String ioFlag;

    /** 항목형식 (DATE/NUMBER/VARCHAR2) — VARCHAR(10). */
    @Column(name = "COL_TYPE", length = 10)
    private String colType;

    /** 항목길이 (총길이) — NUMBER(5). */
    @Column(name = "COL_LEN")
    private Integer colLen;

    /** 항목소수점길이 — NUMBER(5). */
    @Column(name = "COL_PREC_LEN")
    private Integer colPrecLen;

    /** MES테이블항목명 — VARCHAR(50). */
    @Column(name = "MES_COL_ID", length = 50)
    private String mesColId;

    /** 코드여부 (N/Y) — VARCHAR(2). */
    @Column(name = "MASTER_CODE_DIV", length = 2)
    private String masterCodeDiv;

    // ── getter / setter ──

    public MasterRuleColListId getId() { return id; }
    public void setId(MasterRuleColListId id) { this.id = id; }

    public BigDecimal getRuleVer() { return ruleVer; }
    public void setRuleVer(BigDecimal ruleVer) { this.ruleVer = ruleVer; }

    public String getColId() { return colId; }
    public void setColId(String colId) { this.colId = colId; }

    public String getColNm() { return colNm; }
    public void setColNm(String colNm) { this.colNm = colNm; }

    public String getOldColId() { return oldColId; }
    public void setOldColId(String oldColId) { this.oldColId = oldColId; }

    public String getIoFlag() { return ioFlag; }
    public void setIoFlag(String ioFlag) { this.ioFlag = ioFlag; }

    public String getColType() { return colType; }
    public void setColType(String colType) { this.colType = colType; }

    public Integer getColLen() { return colLen; }
    public void setColLen(Integer colLen) { this.colLen = colLen; }

    public Integer getColPrecLen() { return colPrecLen; }
    public void setColPrecLen(Integer colPrecLen) { this.colPrecLen = colPrecLen; }

    public String getMesColId() { return mesColId; }
    public void setMesColId(String mesColId) { this.mesColId = mesColId; }

    public String getMasterCodeDiv() { return masterCodeDiv; }
    public void setMasterCodeDiv(String masterCodeDiv) { this.masterCodeDiv = masterCodeDiv; }
}
