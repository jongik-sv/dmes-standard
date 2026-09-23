package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 용어 사전 — {@code TB_MDM_TERM}(TSK-04-01 design.md §2, ERD {@code 02-term-domain-column.sql}).
 *
 * <p>ID 채번은 {@link GenerationType#IDENTITY} 로 고정한다 — SQLite community dialect·MSSQL 모두 이 전략만
 * {@code AUTOINCREMENT}/{@code IDENTITY(1,1)} DDL 과 대응한다(불변 규칙 10).
 *
 * <p><b>{@code EMBEDDING}/{@code EMBEDDING_MODEL} 은 이 엔티티에 매핑하지 않는다</b>(불변 규칙 7, D7,
 * term-embedding.md) — 값은 L2 정규화 float32 little-endian 1024개(4,096바이트)로 고정된 이진 포맷이라
 * 네이티브 SQL 로만 다룬다.
 */
@Entity
@Table(name = "TB_MDM_TERM")
public class MdmTerm extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "TERM_ID")
    private Long termId;

    @Column(name = "TERM_NAME", nullable = false)
    private String termName;

    @Column(name = "SENSE_NO", nullable = false)
    private int senseNo;

    @Column(name = "DEFINITION", nullable = false)
    private String definition;

    @Column(name = "CONTEXT")
    private String context;

    @Column(name = "ENG_NAME")
    private String engName;

    @Column(name = "ENG_ABBR", length = 50)
    private String engAbbr;

    /** 정규화 직렬화(키 정렬·공백 없음) JSON 문자열. DB CHECK(json_valid/ISJSON)가 형식을 강제한다(규칙표 §3 #3). */
    @Column(name = "SYNONYMS")
    private String synonyms;

    @Column(name = "ALIASES")
    private String aliases;

    @Column(name = "SYSTEMS")
    private String systems;

    @Column(name = "STD_BASIS")
    private String stdBasis;

    @Column(name = "OWNER_DEPT")
    private String ownerDept;

    @Column(name = "OWNER_ID", length = 50)
    private String ownerId;

    @Column(name = "SRC_ORIGIN")
    private String srcOrigin;

    protected MdmTerm() {
        // JPA 기본 생성자
    }

    public MdmTerm(String termName, int senseNo, String definition) {
        this.termName = termName;
        this.senseNo = senseNo;
        this.definition = definition;
    }

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public int getSenseNo() { return senseNo; }
    public String getDefinition() { return definition; }
    public String getContext() { return context; }
    public String getEngName() { return engName; }
    public String getEngAbbr() { return engAbbr; }
    public String getSynonyms() { return synonyms; }
    public String getAliases() { return aliases; }
    public String getSystems() { return systems; }
    public String getStdBasis() { return stdBasis; }
    public String getOwnerDept() { return ownerDept; }
    public String getOwnerId() { return ownerId; }
    public String getSrcOrigin() { return srcOrigin; }

    public void setTermName(String v) { this.termName = v; }
    public void setSenseNo(int v) { this.senseNo = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setContext(String v) { this.context = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setEngAbbr(String v) { this.engAbbr = v; }
    public void setSynonyms(String v) { this.synonyms = v; }
    public void setAliases(String v) { this.aliases = v; }
    public void setSystems(String v) { this.systems = v; }
    public void setStdBasis(String v) { this.stdBasis = v; }
    public void setOwnerDept(String v) { this.ownerDept = v; }
    public void setOwnerId(String v) { this.ownerId = v; }
    public void setSrcOrigin(String v) { this.srcOrigin = v; }
}
