package com.dongkuk.dmes.mqc.qpr.qualityCertificate.domain;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 품질보증서(TB_MQC_QLTY_CERT, 주문·PO 단위). DOC_REV 는 재발행할 때 1씩 오른다. */
@Entity
@Table(name = "TB_MQC_QLTY_CERT")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualityCertificate extends CactusAuditEntity {

    @Id
    @Column(name = "QC_NO", length = 20)
    private String qcNo;

    @Column(name = "DOC_REV", nullable = false)
    private Integer docRev;

    @Column(name = "ORD_NO", nullable = false, length = 20)
    private String ordNo;

    @Column(name = "CUS_NM", length = 50)
    private String cusNm;

    @Column(name = "PO_NO", length = 30)
    private String poNo;

    @Column(name = "TMPL_CD", length = 10)
    private String tmplCd;

    @Column(name = "LANG_CD", length = 5)
    private String langCd;

    @Enumerated(EnumType.STRING)
    @Column(name = "STAT_CD", nullable = false, length = 10)
    private QcStatus statCd;

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

    /** 발행 요청으로 초안을 만든다. */
    public static QualityCertificate draft(String qcNo, String ordNo, String cusNm, String poNo, String tmplCd, String langCd,
                                           String note, String by, LocalDateTime at) {
        QualityCertificate q = new QualityCertificate();
        q.qcNo = qcNo;
        q.docRev = 1;
        q.ordNo = ordNo;
        q.cusNm = cusNm;
        q.poNo = poNo;
        q.tmplCd = tmplCd;
        q.langCd = langCd;
        q.statCd = QcStatus.DRAFT;
        q.reqBy = by;
        q.reqAt = at;
        q.note = note;
        return q;
    }

    /** 시험용: 상태를 정해 만든다. */
    public static QualityCertificate of(String qcNo, String ordNo, QcStatus status) {
        QualityCertificate q = draft(qcNo, ordNo, "수요가 A", "PO-A-1", "KS", "KO", null, "tester", null);
        q.statCd = status;
        return q;
    }

    public void issue(String by, LocalDateTime at) {
        this.statCd = QcStatus.ISSUED;
        this.issueBy = by;
        this.issueAt = at;
    }

    public void reissue(String by, LocalDateTime at) {
        this.statCd = QcStatus.REISSUED;
        this.docRev = docRev == null ? 2 : docRev + 1;
        this.issueBy = by;
        this.issueAt = at;
    }

    public void recall() {
        this.statCd = QcStatus.RECALLED;
    }
}
