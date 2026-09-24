package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeConventions;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * 코드 행 — {@code TB_MDM_CODE_ITEM}(TSK-06-01 design.md §6.0.4). 복합 PK 는 {@link MdmCodeItemId}.
 *
 * <p>선분 [fromVer, toVer) 행이다. {@code (MARU_CODE_ID, FROM_VER)} 는 {@code TB_MDM_CODE_VER} FK 이지만 연관관계 없이
 * 원시 필드로만 둔다. 새 행의 to_ver 는 열린 {@link MasterCodeConventions#OPEN_TO_VER} 다(04:64, DDL DEFAULT 9999 와 같음).
 */
@Entity
@Table(name = "TB_MDM_CODE_ITEM")
@IdClass(MdmCodeItemId.class)
public class MdmCodeItem extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Id
    @Column(name = "CODE", length = 50)
    private String code;

    @Id
    @Column(name = "FROM_VER", precision = 7, scale = 3)
    private BigDecimal fromVer;

    @Column(name = "TO_VER", precision = 7, scale = 3, nullable = false)
    private BigDecimal toVer = MasterCodeConventions.OPEN_TO_VER;

    @Column(name = "NAME")
    private String name;

    @Column(name = "ALTER_NAME")
    private String alterName;

    @Column(name = "SEQ")
    private Integer seq;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "LVL1", length = 50)
    private String lvl1;
    @Column(name = "LVL2", length = 50)
    private String lvl2;
    @Column(name = "LVL3", length = 50)
    private String lvl3;
    @Column(name = "LVL4", length = 50)
    private String lvl4;
    @Column(name = "LVL5", length = 50)
    private String lvl5;

    @Column(name = "ATTR01")
    private String attr01;
    @Column(name = "ATTR02")
    private String attr02;
    @Column(name = "ATTR03")
    private String attr03;
    @Column(name = "ATTR04")
    private String attr04;
    @Column(name = "ATTR05")
    private String attr05;
    @Column(name = "ATTR06")
    private String attr06;
    @Column(name = "ATTR07")
    private String attr07;
    @Column(name = "ATTR08")
    private String attr08;
    @Column(name = "ATTR09")
    private String attr09;
    @Column(name = "ATTR10")
    private String attr10;

    protected MdmCodeItem() {
        // JPA 기본 생성자
    }

    public MdmCodeItem(String maruCodeId, String code, BigDecimal fromVer) {
        this.maruCodeId = maruCodeId;
        this.code = code;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCode() { return code; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }
    public BigDecimal getToVer() { return MdmCodeVerNumbers.scaled(toVer); }
    public String getName() { return name; }
    public String getAlterName() { return alterName; }
    public Integer getSeq() { return seq; }
    public String getDescription() { return description; }
    public String getLvl1() { return lvl1; }
    public String getLvl2() { return lvl2; }
    public String getLvl3() { return lvl3; }
    public String getLvl4() { return lvl4; }
    public String getLvl5() { return lvl5; }
    public String getAttr01() { return attr01; }
    public String getAttr02() { return attr02; }
    public String getAttr03() { return attr03; }
    public String getAttr04() { return attr04; }
    public String getAttr05() { return attr05; }
    public String getAttr06() { return attr06; }
    public String getAttr07() { return attr07; }
    public String getAttr08() { return attr08; }
    public String getAttr09() { return attr09; }
    public String getAttr10() { return attr10; }

    public void setToVer(BigDecimal v) { this.toVer = MdmCodeVerNumbers.scaled(v); }
    public void setName(String v) { this.name = v; }
    public void setAlterName(String v) { this.alterName = v; }
    public void setSeq(Integer v) { this.seq = v; }
    public void setDescription(String v) { this.description = v; }
    public void setLvl1(String v) { this.lvl1 = v; }
    public void setLvl2(String v) { this.lvl2 = v; }
    public void setLvl3(String v) { this.lvl3 = v; }
    public void setLvl4(String v) { this.lvl4 = v; }
    public void setLvl5(String v) { this.lvl5 = v; }
    public void setAttr01(String v) { this.attr01 = v; }
    public void setAttr02(String v) { this.attr02 = v; }
    public void setAttr03(String v) { this.attr03 = v; }
    public void setAttr04(String v) { this.attr04 = v; }
    public void setAttr05(String v) { this.attr05 = v; }
    public void setAttr06(String v) { this.attr06 = v; }
    public void setAttr07(String v) { this.attr07 = v; }
    public void setAttr08(String v) { this.attr08 = v; }
    public void setAttr09(String v) { this.attr09 = v; }
    public void setAttr10(String v) { this.attr10 = v; }
}
