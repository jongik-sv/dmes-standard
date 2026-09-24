package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 룰 행 — {@code TB_MDM_RULE_ROW}(TSK-08-01 design.md §6.0 ⑤·§6.2). 복합 PK 는 {@link MdmRuleRowId}.
 *
 * <p>감사 카운터는 {@code AUD_VER}(D-034, 불변 규칙 2). {@code CELLS} 는 셀 JSON(키 = var_id 문자열)이고 일반
 * {@code String} 으로 매핑한다. DEFAULT 행은 {@code SEQ = 0} 이다.
 */
@Entity
@Table(name = "TB_MDM_RULE_ROW")
@IdClass(MdmRuleRowId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmRuleRow extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_ID", length = 50)
    private String maruRuleId;

    @Id
    @Column(name = "VER")
    private Integer ver;

    @Id
    @Column(name = "ROW_ID")
    private Integer rowId;

    @Column(name = "SEQ", nullable = false)
    private int seq;

    @Column(name = "ROW_KIND", length = 20, nullable = false)
    private String rowKind;

    @Column(name = "CELLS", nullable = false)
    private String cells;

    @Column(name = "NOTE")
    private String note;

    @Column(name = "TAG", length = 50)
    private String tag;

    protected MdmRuleRow() {
        // JPA 기본 생성자
    }

    public MdmRuleRow(String maruRuleId, Integer ver, Integer rowId, String rowKind, int seq, String cells) {
        this.maruRuleId = maruRuleId;
        this.ver = ver;
        this.rowId = rowId;
        this.rowKind = rowKind;
        this.seq = seq;
        this.cells = cells;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Integer getRowId() { return rowId; }
    public int getSeq() { return seq; }
    public String getRowKind() { return rowKind; }
    public String getCells() { return cells; }
    public String getNote() { return note; }
    public String getTag() { return tag; }

    public void setSeq(int v) { this.seq = v; }
    public void setRowKind(String v) { this.rowKind = v; }
    public void setCells(String v) { this.cells = v; }
    public void setNote(String v) { this.note = v; }
    public void setTag(String v) { this.tag = v; }
}
