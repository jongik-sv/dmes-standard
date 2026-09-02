package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * MasterRuleColList PK 복합키 — (RULE_ID, COL_SEQ).
 *
 * <p>사용자 제공 테이블 명세서 2026-06-05: RULE_ID VARCHAR(10) PK1 / COL_SEQ NUMBER(3) PK2.
 * 화면 cmb/masterRuleFrame·masterRuleFrameColListPopup·masterRuleData 공유.
 */
@Embeddable
public class MasterRuleColListId implements Serializable {

    /** PK 1 — 업무기준ID (TB_MCA_RULE_MASTER.RULE_ID 논리 FK). VARCHAR(10). */
    @Column(name = "RULE_ID", length = 10, nullable = false)
    private String ruleId;

    /** PK 2 — 항목순서. NUMBER(3). */
    @Column(name = "COL_SEQ", nullable = false)
    private Integer colSeq;

    public MasterRuleColListId() {}

    public MasterRuleColListId(String ruleId, Integer colSeq) {
        this.ruleId = ruleId;
        this.colSeq = colSeq;
    }

    public String getRuleId() { return ruleId; }
    public void setRuleId(String ruleId) { this.ruleId = ruleId; }

    public Integer getColSeq() { return colSeq; }
    public void setColSeq(Integer colSeq) { this.colSeq = colSeq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MasterRuleColListId other)) return false;
        return Objects.equals(ruleId, other.ruleId) && Objects.equals(colSeq, other.colSeq);
    }

    @Override
    public int hashCode() { return Objects.hash(ruleId, colSeq); }
}
