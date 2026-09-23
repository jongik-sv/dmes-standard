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
 * <p>{@code TB_MDM_LAYOUT.VERSION}(업무 칼럼, 스냅샷 배포 번호)은 감사 {@code VER}(변경 카운터,
 * {@code CactusAuditEntity.version})과 다른 칼럼이다 — 상위 클래스가 이미 {@code version}
 * 프로퍼티·{@code getVersion()}을 갖고 있어 이름이 겹치므로 엔티티 필드명은 {@code layoutVersion}으로
 * 짓는다(F14·F19, 불변 규칙 6). {@code @Version}(JPA 낙관적 락)으로 매핑하지 않는다 — 증가는 저장 로직
 * (TSK-05-03)의 몫이다(불변 규칙 6). 예약어 칼럼 {@code VERSION}은 방언-중립 백틱 인용으로 매핑한다(D1,
 * 불변 규칙 7) — Hibernate 가 MSSQL {@code [VERSION]}·SQLite {@code "VERSION"}으로 자동 변환한다.
 *
 * <p>{@code EAI_CODE}·{@code SND_SYSTEM}·{@code RCV_SYSTEM}은 모두 FK 이지만 연관관계 매핑을 쓰지
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

    /** {@code TB_MDM_EAI.EAI_CODE} 를 가리키는 순환 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "EAI_CODE", length = 20)
    private String eaiCode;

    @Column(name = "SND_SYSTEM", length = 20)
    private String sndSystem;

    @Column(name = "RCV_SYSTEM", length = 20)
    private String rcvSystem;

    @Column(name = "TOTAL_LENGTH", nullable = false)
    private int totalLength;

    /** 업무 버전 칼럼(예약어 백틱 인용, D1). 감사 {@code VER}과 독립이며 {@code @Version} 이 아니다(F14·F19). */
    @Column(name = "`VERSION`", nullable = false)
    private long layoutVersion;

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
    public String getEaiCode() { return eaiCode; }
    public String getSndSystem() { return sndSystem; }
    public String getRcvSystem() { return rcvSystem; }
    public int getTotalLength() { return totalLength; }
    public long getLayoutVersion() { return layoutVersion; }

    public void setLayoutKind(String v) { this.layoutKind = v; }
    public void setLayoutName(String v) { this.layoutName = v; }
    public void setEaiCode(String v) { this.eaiCode = v; }
    public void setSndSystem(String v) { this.sndSystem = v; }
    public void setRcvSystem(String v) { this.rcvSystem = v; }
    public void setTotalLength(int v) { this.totalLength = v; }
    public void setLayoutVersion(long v) { this.layoutVersion = v; }
}
