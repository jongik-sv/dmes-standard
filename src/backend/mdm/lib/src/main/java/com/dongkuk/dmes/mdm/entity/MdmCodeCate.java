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
 * 카테고리 행 — {@code TB_MDM_CODE_CATE}(TSK-06-01 design.md §6.0.5). 복합 PK 는 {@link MdmCodeCateId}.
 *
 * <p>정의 종류·대상 칸은 전사 계약 {@code CategoryKind}·{@code CategoryDefTarget} 의 {@code name()} 을 문자열로 담는다
 * (mdm 엔티티는 상태·종류 칼럼을 {@code String} 으로 매핑하는 관례, F27 ①). {@code DEF_EXPR} 는 한글 정규식을 담는 길이
 * 제한 없는 문자열이다(D6).
 */
@Entity
@Table(name = "TB_MDM_CODE_CATE")
@IdClass(MdmCodeCateId.class)
public class MdmCodeCate extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Id
    @Column(name = "CATE_ID", length = 50)
    private String cateId;

    @Id
    @Column(name = "FROM_VER", precision = 7, scale = 3)
    private BigDecimal fromVer;

    @Column(name = "TO_VER", precision = 7, scale = 3, nullable = false)
    private BigDecimal toVer = MasterCodeConventions.OPEN_TO_VER;

    @Column(name = "CATE_NAME")
    private String cateName;

    @Column(name = "DEF_KIND", length = 20, nullable = false)
    private String defKind;

    @Column(name = "DEF_EXPR")
    private String defExpr;

    @Column(name = "DEF_TARGET", length = 20)
    private String defTarget;

    @Column(name = "DESCRIPTION")
    private String description;

    protected MdmCodeCate() {
        // JPA 기본 생성자
    }

    public MdmCodeCate(String maruCodeId, String cateId, BigDecimal fromVer, String defKind) {
        this.maruCodeId = maruCodeId;
        this.cateId = cateId;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
        this.defKind = defKind;
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }
    public BigDecimal getToVer() { return MdmCodeVerNumbers.scaled(toVer); }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }
    public String getDescription() { return description; }

    public void setToVer(BigDecimal v) { this.toVer = MdmCodeVerNumbers.scaled(v); }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefKind(String v) { this.defKind = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
    public void setDescription(String v) { this.description = v; }
}
