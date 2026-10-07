package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * MasterRuleColList PK 복합키 — (RULE_ID, COL_SEQ).
 *
 * <p>사용자 제공 테이블 명세서 2026-06-05: RULE_ID VARCHAR(10) PK1 / COL_SEQ NUMBER(3) PK2.
 * RULE_ID 는 2026-10-07 TB_MCA_RULE_MASTER 와 같은 50자로 넓혔다(Oracle 은 길이를 강제한다).
 * 화면 cmb/masterRuleFrame·masterRuleFrameColListPopup·masterRuleData 공유.
 */
@Embeddable
public class MasterRuleColListId implements Serializable {

    /** PK 1 — 업무기준ID (TB_MCA_RULE_MASTER.RULE_ID 논리 FK). VARCHAR(50) — 마스터와 같은 길이(oracle-1007 조정 결정, 명세서 10자에서 넓힘). */
    @Column(name = "RULE_ID", length = 50, nullable = false)
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
