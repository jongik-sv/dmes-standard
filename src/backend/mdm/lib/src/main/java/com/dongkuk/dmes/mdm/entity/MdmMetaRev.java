package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * MDM 메타 변경 기록 — {@code TB_MDM_META_REV}(spec 2026-10-02-mdm-meta-cache-design §3.1, V18). 쓰기는
 * {@code MetaRevisionRecorder} 의 네이티브 INSERT 가 하고, 이 엔티티는 읽기(metaFeed search)에만 쓴다.
 * {@code REV_SEQ} 는 IDENTITY(불변 규칙 10).
 */
@Entity
@Table(name = "TB_MDM_META_REV")
public class MdmMetaRev extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "REV_SEQ")
    private Long revSeq;

    @Column(name = "TARGET_TYPE", length = 20, nullable = false)
    private String targetType;

    @Column(name = "TARGET_KEY", length = 100, nullable = false)
    private String targetKey;

    @Column(name = "CHANGE_KIND", length = 10, nullable = false)
    private String changeKind;

    protected MdmMetaRev() {
        // JPA 기본 생성자
    }

    public Long getRevSeq() { return revSeq; }
    public String getTargetType() { return targetType; }
    public String getTargetKey() { return targetKey; }
    public String getChangeKind() { return changeKind; }
}
