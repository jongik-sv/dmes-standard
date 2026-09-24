package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.persistence.MdmLocalDateTimeIdUserType;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import org.hibernate.annotations.Type;

/**
 * 마스터데이터 항목 — {@code TB_MDM_DATA_ITEM}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 복합 PK 는 {@link MdmDataItemId} 로 표현한다(F6, 「원래 키 + valid_from」).
 *
 * <p>{@code MARU_DATA_ID}({@code TB_MDM_DATA}) 는 FK 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9)
 * — 원시 필드로만 둔다. {@code ROW_VERSION} 은 낙관적 잠금 칼럼이지만 {@code @Version} 으로 매핑하지
 * 않는다(F9) — "수정"이 PK(validFrom 포함)가 바뀌는 새 행 INSERT 라 JPA {@code @Version} 의미론과
 * 맞지 않는다. {@code VALID_TO} 기본값 {@code '9999-12-31 00:00:00'} 은 {@link
 * com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentRules#OPEN_END} 와 같은 값이다(F6).
 */
@Entity
@Table(name = "TB_MDM_DATA_ITEM")
@IdClass(MdmDataItemId.class)
public class MdmDataItem extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    @Id
    @Column(name = "CODE", length = 50)
    private String code;

    /** PK 구성 요소라 {@code AttributeConverter}(auto-apply 포함)를 쓸 수 없다(Hibernate 7 제약, D3)
     *  — {@code disableConversion=true}로 auto-apply 대상에서 빼고 {@link MdmLocalDateTimeIdUserType}
     *  로 대신한다. */
    @Id
    @Column(name = "VALID_FROM")
    @Convert(disableConversion = true)
    @Type(MdmLocalDateTimeIdUserType.class)
    private LocalDateTime validFrom;

    @Column(name = "NAME", nullable = false)
    private String name;

    @Column(name = "ALTER_NAME")
    private String alterName;

    @Column(name = "SEQ")
    private Integer seq;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "VALID_TO", nullable = false)
    private LocalDateTime validTo;

    /** 낙관적 잠금 칼럼 — plain int, {@code @Version} 아님(F9). */
    @Column(name = "ROW_VERSION", nullable = false)
    private int rowVersion;

    /** 원시 long — Hibernate INSERT 는 매핑 칼럼을 전부 명시하므로 DB DEFAULT(0)에 기대지 않는다. */
    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

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

    protected MdmDataItem() {
        // JPA 기본 생성자
    }

    public MdmDataItem(String maruDataId, String code, LocalDateTime validFrom, String name) {
        this.maruDataId = maruDataId;
        this.code = code;
        this.validFrom = validFrom;
        this.name = name;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public LocalDateTime getValidFrom() { return validFrom; }
    public String getName() { return name; }
    public String getAlterName() { return alterName; }
    public Integer getSeq() { return seq; }
    public String getDescription() { return description; }
    public LocalDateTime getValidTo() { return validTo; }
    public int getRowVersion() { return rowVersion; }
    public long getChgSeq() { return chgSeq; }
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

    public void setName(String v) { this.name = v; }
    public void setAlterName(String v) { this.alterName = v; }
    public void setSeq(Integer v) { this.seq = v; }
    public void setDescription(String v) { this.description = v; }
    public void setValidTo(LocalDateTime v) { this.validTo = v; }
    public void setRowVersion(int v) { this.rowVersion = v; }
    public void setChgSeq(long v) { this.chgSeq = v; }
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
