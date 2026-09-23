package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 헤더 적층 부착 — {@code TB_MDM_LAYOUT_HEADER}(신설, D4, TSK-05-01 design.md §2·§6.0). 전문 레이아웃에
 * 헤더 레이아웃을 순서대로 여러 겹 부착한다. N=1 이면 md 「전문당 헤더 하나」와 동일하게 동작한다.
 * 복합 PK 는 {@link MdmLayoutHeaderId} 로 표현한다.
 *
 * <p>{@code LAYOUT_ID}(MESSAGE 측)·{@code HEADER_LAYOUT_ID}(HEADER 측) 모두 {@code TB_MDM_LAYOUT} 을
 * 가리키는 FK 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 필드로만 둔다. {@code
 * LAYOUT_KIND='HEADER'} 검증은 앱 검사다(DB CHECK 로 강제하지 않는다).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_HEADER")
@IdClass(MdmLayoutHeaderId.class)
public class MdmLayoutHeader extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "SEQ")
    private Integer seq;

    @Column(name = "HEADER_LAYOUT_ID", nullable = false)
    private Long headerLayoutId;

    protected MdmLayoutHeader() {
        // JPA 기본 생성자
    }

    public MdmLayoutHeader(Long layoutId, Integer seq, Long headerLayoutId) {
        this.layoutId = layoutId;
        this.seq = seq;
        this.headerLayoutId = headerLayoutId;
    }

    public Long getLayoutId() { return layoutId; }
    public Integer getSeq() { return seq; }
    public Long getHeaderLayoutId() { return headerLayoutId; }
}
