package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 레이아웃(전문/헤더) — {@code TB_MDM_LAYOUT}(TSK-05-01 design.md §2·§6.0, ERD {@code
 * 03-interface-layout.sql}). {@code LAYOUT_KIND}(HEADER/MESSAGE)로 헤더 레이아웃과 전문 레이아웃을
 * 같은 테이블에 둔다(D4 적층 모델).
 *
 * <p>업무 버전은 {@code TB_MDM_LAYOUT_VER}(D-144 3단계). 형식 속성(EAI·길이)도 버전 행에 있다. 감사 {@code VER} 는
 * 상위 클래스 {@code version} 이다.
 *
 * <p>{@code SND_SYSTEM}·{@code RCV_SYSTEM}은 FK 이지만 연관관계 매핑을 쓰지
 * 않는다(불변 규칙 9) — 원시 필드로만 둔다. ID 채번은 {@link GenerationType#IDENTITY}로 고정한다(불변
 * 규칙 10).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT")
public class MdmLayout extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Column(name = "LAYOUT_KIND", length = 20, nullable = false)
    private String layoutKind;

    @Column(name = "LAYOUT_NAME", nullable = false)
    private String layoutName;

    @Column(name = "SND_SYSTEM", length = 20)
    private String sndSystem;

    @Column(name = "RCV_SYSTEM", length = 20)
    private String rcvSystem;

    /** CREATED → INUSE(첫 확정, 공통 엔진) → DEPRECATED. 엔티티 저장으로 바꾸지 않는다. */
    @Column(name = "STATUS", length = 20, nullable = false, updatable = false)
    private String status = "CREATED";

    protected MdmLayout() {
        // JPA 기본 생성자
    }

    public MdmLayout(String layoutKind, String layoutName) {
        this.layoutKind = layoutKind;
        this.layoutName = layoutName;
    }

    public Long getLayoutId() { return layoutId; }
    public String getLayoutKind() { return layoutKind; }
    public String getLayoutName() { return layoutName; }
    public String getSndSystem() { return sndSystem; }
    public String getRcvSystem() { return rcvSystem; }
    public String getStatus() { return status; }

    public void setLayoutKind(String v) { this.layoutKind = v; }
    public void setLayoutName(String v) { this.layoutName = v; }
    public void setSndSystem(String v) { this.sndSystem = v; }
    public void setRcvSystem(String v) { this.rcvSystem = v; }
}
