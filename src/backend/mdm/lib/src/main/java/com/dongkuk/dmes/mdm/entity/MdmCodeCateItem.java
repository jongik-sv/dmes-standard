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
 * TABLE 카테고리 소속 행 — {@code TB_MDM_CODE_CATE_ITEM}(TSK-06-01 design.md §6.0.6). 복합 PK 는 {@link MdmCodeCateItemId}.
 *
 * <p>{@code CATE_ID}·{@code CODE} 는 FK 가 아니다(불변 규칙 7 — 저장 시·상신 시 앱 검사). {@code (MARU_CODE_ID, FROM_VER)}
 * 만 {@code TB_MDM_CODE_VER} FK 이며 원시 필드로만 둔다.
 */
@Entity
@Table(name = "TB_MDM_CODE_CATE_ITEM")
@IdClass(MdmCodeCateItemId.class)
public class MdmCodeCateItem extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Id
    @Column(name = "CATE_ID", length = 50)
    private String cateId;

    @Id
    @Column(name = "CODE", length = 50)
    private String code;

    @Id
    @Column(name = "FROM_VER", precision = 7, scale = 3)
    private BigDecimal fromVer;

    @Column(name = "TO_VER", precision = 7, scale = 3, nullable = false)
    private BigDecimal toVer = MasterCodeConventions.OPEN_TO_VER;

    protected MdmCodeCateItem() {
        // JPA 기본 생성자
    }

    public MdmCodeCateItem(String maruCodeId, String cateId, String code, BigDecimal fromVer) {
        this.maruCodeId = maruCodeId;
        this.cateId = cateId;
        this.code = code;
        this.fromVer = MdmCodeVerNumbers.scaled(fromVer);
    }

    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public String getCode() { return code; }
    public BigDecimal getFromVer() { return MdmCodeVerNumbers.scaled(fromVer); }
    public BigDecimal getToVer() { return MdmCodeVerNumbers.scaled(toVer); }

    public void setToVer(BigDecimal v) { this.toVer = MdmCodeVerNumbers.scaled(v); }
}
