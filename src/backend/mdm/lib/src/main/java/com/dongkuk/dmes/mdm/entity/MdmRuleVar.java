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

/**
 * 룰 변수(열) — {@code TB_MDM_RULE_VAR}(TSK-08-01 design.md §6.0 ④·§6.2). 복합 PK 는 {@link MdmRuleVarId}.
 *
 * <p>감사 카운터는 {@code AUD_VER}(D-034, 불변 규칙 2). JSON 칼럼({@code VAR_AST}·{@code PRIO_LIST}·{@code GRP_COND_AST})은
 * 일반 {@code String} 으로 매핑한다(V3 {@code MdmTerm.synonyms} 관례). {@code DISP_TYPE} 은 06 표기
 * ({@code Equal}·{@code 1}·{@code 2}·{@code Expression}·{@code Value})로 저장한다(D4). {@code DOMAIN_ID} 는 원시 필드다.
 *
 * <p>JPA 는 모든 칼럼을 INSERT 에 넣으므로 {@code collectAgg} 가 null 이면 DB 기본값 {@code 'LIST'} 가 아니라 NULL 이
 * 들어간다. 기본값은 저장 로직(TSK-08-03)이 채운다.
 */
@Entity
@Table(name = "TB_MDM_RULE_VAR")
@IdClass(MdmRuleVarId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmRuleVar extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_RULE_ID", length = 50)
    private String maruRuleId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Id
    @Column(name = "VAR_ID")
    private Integer varId;

    @Column(name = "VAR_KIND", length = 20, nullable = false)
    private String varKind;

    @Column(name = "DISP_TYPE", length = 20)
    private String dispType;

    /** 변수 이름 또는 식 텍스트. {@code VAR_AST} 가 NULL 이면 이름이다(06:1012). */
    @Column(name = "VAR_NAME", length = 1000)
    private String varName;

    @Column(name = "VAR_AST")
    private String varAst;

    /** {@code TB_MDM_DOMAIN.DOMAIN_ID} 를 가리키는 FK. 원시 필드로만 둔다. */
    @Column(name = "DOMAIN_ID")
    private Long domainId;

    @Column(name = "DATA_TYPE", length = 20)
    private String dataType;

    @Column(name = "COLLECT_AGG", length = 20)
    private String collectAgg;

    @Column(name = "PRIO_LIST")
    private String prioList;

    @Column(name = "RES_GRP", length = 50)
    private String resGrp;

    @Column(name = "GRP_COND")
    private String grpCond;

    @Column(name = "GRP_COND_AST")
    private String grpCondAst;

    @Column(name = "SEQ", nullable = false)
    private int seq;

    @Column(name = "LABEL")
    private String label;

    @Column(name = "DESCRIPTION")
    private String description;

    protected MdmRuleVar() {
        // JPA 기본 생성자
    }

    public MdmRuleVar(String maruRuleId, BigDecimal ver, Integer varId, String varKind, int seq) {
        this.maruRuleId = maruRuleId;
        this.ver = VersionNumbers.scaled(ver);
        this.varId = varId;
        this.varKind = varKind;
        this.seq = seq;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public Integer getVarId() { return varId; }
    public String getVarKind() { return varKind; }
    public String getDispType() { return dispType; }
    public String getVarName() { return varName; }
    public String getVarAst() { return varAst; }
    public Long getDomainId() { return domainId; }
    public String getDataType() { return dataType; }
    public String getCollectAgg() { return collectAgg; }
    public String getPrioList() { return prioList; }
    public String getResGrp() { return resGrp; }
    public String getGrpCond() { return grpCond; }
    public String getGrpCondAst() { return grpCondAst; }
    public int getSeq() { return seq; }
    public String getLabel() { return label; }
    public String getDescription() { return description; }

    public void setVarKind(String v) { this.varKind = v; }
    public void setDispType(String v) { this.dispType = v; }
    public void setVarName(String v) { this.varName = v; }
    public void setVarAst(String v) { this.varAst = v; }
    public void setDomainId(Long v) { this.domainId = v; }
    public void setDataType(String v) { this.dataType = v; }
    public void setCollectAgg(String v) { this.collectAgg = v; }
    public void setPrioList(String v) { this.prioList = v; }
    public void setResGrp(String v) { this.resGrp = v; }
    public void setGrpCond(String v) { this.grpCond = v; }
    public void setGrpCondAst(String v) { this.grpCondAst = v; }
    public void setSeq(int v) { this.seq = v; }
    public void setLabel(String v) { this.label = v; }
    public void setDescription(String v) { this.description = v; }
}
