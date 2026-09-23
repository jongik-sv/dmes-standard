package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 도메인(값 정의) — {@code TB_MDM_DOMAIN}(TSK-04-01 design.md §2, ERD {@code 02-term-domain-column.sql}).
 *
 * <p>mdm 은 MES 모듈이라 {@code @ManyToOne}/{@code @OneToMany} 연관관계 매핑을 쓰지 않는다(불변 규칙 9,
 * naming-dialect-rules F16) — 자기참조({@code PARENT_DOMAIN_ID})·{@code UNIT_CODE}·{@code MARU_CODE_ID}
 * 모두 원시 ID 필드로만 매핑한다.
 *
 * <p><b>{@code MARU_CODE_ID} 는 {@code TB_MDM_CODE} 를 가리키는 FK 이지만 이번 V3 에 DB FK 제약을 걸지
 * 않는다</b>(D1) — {@code TB_MDM_CODE}(04 영역)가 아직 없어 걸면 이 테이블에 대한 모든 쓰기가 막힌다.
 * 유효성 검사는 TSK-04-02 이후가 {@code MaruIdNamespace} SPI 로 한다(§8 인계).
 *
 * <p>ID 채번은 {@link GenerationType#IDENTITY} 로 고정한다(불변 규칙 10).
 */
@Entity
@Table(name = "TB_MDM_DOMAIN")
public class MdmDomain extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "DOMAIN_ID")
    private Long domainId;

    @Column(name = "DOMAIN_NAME", nullable = false)
    private String domainName;

    @Column(name = "STD_NAME", length = 50, nullable = false)
    private String stdName;

    /** 자기참조 FK. 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 ID 필드로만 둔다. */
    @Column(name = "PARENT_DOMAIN_ID")
    private Long parentDomainId;

    @Column(name = "DOMAIN_KIND", length = 20, nullable = false)
    private String domainKind;

    @Column(name = "DATA_TYPE", length = 20, nullable = false)
    private String dataType;

    @Column(name = "LENGTH")
    private Integer length;

    @Column(name = "SCALE")
    private Integer scale;

    @Column(name = "UNIT_CODE", length = 20)
    private String unitCode;

    /** {@code TB_MDM_CODE.MARU_CODE_ID} 를 가리키지만 DB FK 없음(D1) — 원시 ID 필드. */
    @Column(name = "MARU_CODE_ID", length = 50)
    private String maruCodeId;

    @Column(name = "CATE_ID", length = 50)
    private String cateId;

    @Column(name = "STD_RULE")
    private String stdRule;

    @Column(name = "STD_AST")
    private String stdAst;

    @Column(name = "BIZ_RULE")
    private String bizRule;

    @Column(name = "BIZ_AST")
    private String bizAst;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "EXAMPLES")
    private String examples;

    @Column(name = "TEST_CASES")
    private String testCases;

    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmDomain() {
        // JPA 기본 생성자
    }

    public MdmDomain(String domainName, String stdName, String domainKind, String dataType) {
        this.domainName = domainName;
        this.stdName = stdName;
        this.domainKind = domainKind;
        this.dataType = dataType;
    }

    public Long getDomainId() { return domainId; }
    public String getDomainName() { return domainName; }
    public String getStdName() { return stdName; }
    public Long getParentDomainId() { return parentDomainId; }
    public String getDomainKind() { return domainKind; }
    public String getDataType() { return dataType; }
    public Integer getLength() { return length; }
    public Integer getScale() { return scale; }
    public String getUnitCode() { return unitCode; }
    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public String getStdRule() { return stdRule; }
    public String getStdAst() { return stdAst; }
    public String getBizRule() { return bizRule; }
    public String getBizAst() { return bizAst; }
    public String getDescription() { return description; }
    public String getExamples() { return examples; }
    public String getTestCases() { return testCases; }
    public long getChgSeq() { return chgSeq; }

    public void setDomainName(String v) { this.domainName = v; }
    public void setStdName(String v) { this.stdName = v; }
    public void setParentDomainId(Long v) { this.parentDomainId = v; }
    public void setDomainKind(String v) { this.domainKind = v; }
    public void setDataType(String v) { this.dataType = v; }
    public void setLength(Integer v) { this.length = v; }
    public void setScale(Integer v) { this.scale = v; }
    public void setUnitCode(String v) { this.unitCode = v; }
    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setStdRule(String v) { this.stdRule = v; }
    public void setStdAst(String v) { this.stdAst = v; }
    public void setBizRule(String v) { this.bizRule = v; }
    public void setBizAst(String v) { this.bizAst = v; }
    public void setDescription(String v) { this.description = v; }
    public void setExamples(String v) { this.examples = v; }
    public void setTestCases(String v) { this.testCases = v; }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
