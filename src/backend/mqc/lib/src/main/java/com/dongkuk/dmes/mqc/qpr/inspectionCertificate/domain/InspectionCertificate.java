package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 검사증명서(MTC, TB_MQC_INSP_CERT) — 코일·적용 규격 단위. YP·TS·EL·도금량은 발행할 때 코일 검사값을 옮겨 고정한다.
 * 검토중·보류 상태에서는 비어 있고 화면은 코일의 지금 검사값을 보인다.
 */
@Entity
@Table(name = "TB_MQC_INSP_CERT")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InspectionCertificate extends CactusAuditEntity {

    @Id
    @Column(name = "MTC_NO", length = 20)
    private String mtcNo;

    @Column(name = "COIL_NO", nullable = false, length = 20)
    private String coilNo;

    @Column(name = "STD_CD", nullable = false, length = 20)
    private String stdCd;

    @Column(name = "HEAT_NO", length = 20)
    private String heatNo;

    @Column(name = "SRC_CD", length = 10)
    private String srcCd;

    @Column(name = "LANG_CD", length = 5)
    private String langCd;

    @Enumerated(EnumType.STRING)
    @Column(name = "STAT_CD", nullable = false, length = 10)
    private MtcStatus statCd;

    @Column(name = "DOC_REV", nullable = false)
    private Integer docRev;

    @Column(name = "YP_VAL", precision = 8, scale = 1)
    private BigDecimal ypVal;

    @Column(name = "TS_VAL", precision = 8, scale = 1)
    private BigDecimal tsVal;

    @Column(name = "EL_VAL", precision = 6, scale = 1)
    private BigDecimal elVal;

    @Column(name = "COAT_VAL", precision = 8, scale = 1)
    private BigDecimal coatVal;

    @Column(name = "REQ_BY", length = 50)
    private String reqBy;

    @Column(name = "REQ_AT")
    private LocalDateTime reqAt;

    @Column(name = "ISSUE_BY", length = 50)
    private String issueBy;

    @Column(name = "ISSUE_AT")
    private LocalDateTime issueAt;

    @Column(name = "NOTE", length = 500)
    private String note;

    /** 발행 요청으로 검토중 증명서를 만든다. */
    public static InspectionCertificate request(String mtcNo, String coilNo, String stdCd, String heatNo, String srcCd, String langCd,
                                                String note, String by, LocalDateTime at) {
        InspectionCertificate m = new InspectionCertificate();
        m.mtcNo = mtcNo;
        m.coilNo = coilNo;
        m.stdCd = stdCd;
        m.heatNo = heatNo;
        m.srcCd = srcCd;
        m.langCd = langCd;
        m.statCd = MtcStatus.REVIEW;
        m.docRev = 1;
        m.reqBy = by;
        m.reqAt = at;
        m.note = note;
        return m;
    }

    /** 시험용: 상태를 정해 만든다. */
    public static InspectionCertificate of(String mtcNo, String coilNo, MtcStatus status) {
        InspectionCertificate m = request(mtcNo, coilNo, "KS D 3506", "H1", "SELF", "KO", null, "tester", null);
        m.statCd = status;
        return m;
    }

    /** 발행 — 검사값을 고정한다. */
    public void issue(BigDecimal yp, BigDecimal ts, BigDecimal el, BigDecimal coat, String by, LocalDateTime at) {
        this.ypVal = yp;
        this.tsVal = ts;
        this.elVal = el;
        this.coatVal = coat;
        this.statCd = MtcStatus.ISSUED;
        this.issueBy = by;
        this.issueAt = at;
    }

    /** 재발행 — 판 +1, 검사값을 다시 고정한다. */
    public void reissue(BigDecimal yp, BigDecimal ts, BigDecimal el, BigDecimal coat, String by, LocalDateTime at) {
        issue(yp, ts, el, coat, by, at);
        this.docRev = docRev == null ? 2 : docRev + 1;
    }

    /** 보류 — 고정한 값은 지우지 않는다(이력 대조용). */
    public void hold() {
        this.statCd = MtcStatus.HOLD;
    }
}
