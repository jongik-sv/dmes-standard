package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * EAI 인터페이스 — {@code TB_MDM_EAI}(TSK-05-01 design.md §2·§6.0, ERD {@code 03-interface-layout.sql}).
 *
 * <p>PK 는 서버·화면이 정하는 코드값({@code EAI_CODE})이라 채번 전략이 없다(mls {@code Notice}·{@code
 * MdmUnit} 과 같은 모양). {@code HEADER_LAYOUT_ID} 는 {@code TB_MDM_LAYOUT} 을 가리키는 순환 FK 이지만
 * D-144 3단계(Ruling P3-15)부터 서버가 읽지도 쓰지도 않는 옛 칼럼이다 — 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전의 {@code EAI_CODE}
 * 로 해석한다({@code LayoutVersions.eaiHeadersAt}).
 * mdm 은 MES 모듈이라 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 {@code Long} 필드로만 둔다.
 */
@Entity
@Table(name = "TB_MDM_EAI")
public class MdmEai extends CactusAuditEntity {

    @Id
    @Column(name = "EAI_CODE", length = 20, nullable = false)
    private String eaiCode;

    @Column(name = "EAI_NAME", nullable = false)
    private String eaiName;

    @Column(name = "ENCODING", length = 20, nullable = false)
    private String encoding;

    @Column(name = "PAD_RULE")
    private String padRule;

    /** {@code TB_MDM_LAYOUT.LAYOUT_ID} 를 가리키는 순환 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "HEADER_LAYOUT_ID")
    private Long headerLayoutId;

    protected MdmEai() {
        // JPA 기본 생성자
    }

    public MdmEai(String eaiCode, String eaiName, String encoding) {
        this.eaiCode = eaiCode;
        this.eaiName = eaiName;
        this.encoding = encoding;
    }

    public String getEaiCode() { return eaiCode; }
    public String getEaiName() { return eaiName; }
    public String getEncoding() { return encoding; }
    public String getPadRule() { return padRule; }
    public Long getHeaderLayoutId() { return headerLayoutId; }

    public void setEaiName(String v) { this.eaiName = v; }
    public void setEncoding(String v) { this.encoding = v; }
    public void setPadRule(String v) { this.padRule = v; }
    public void setHeaderLayoutId(Long v) { this.headerLayoutId = v; }
}
