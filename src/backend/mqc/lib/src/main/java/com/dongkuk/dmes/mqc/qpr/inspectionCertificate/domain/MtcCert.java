package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 검사증명서 원천(TB_MQC_MTC_CERT) — 인터페이스로 받은 증명서 데이터. 본문 = 목업 CERTS[id] { head, at, kind, cust, coils, … }.
 * MTC_NO = head.mtc(증명서번호), CERT_KND = kind, CUS_CD = cust.
 */
@Entity
@Table(name = "TB_MQC_MTC_CERT")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcCert implements MtcDoc {

    @Id
    @Column(name = "CERT_ID", length = 20)
    private String certId;

    @Column(name = "SORT_SEQ", nullable = false)
    private Integer sortSeq;

    @Column(name = "MTC_NO", length = 30)
    private String mtcNo;

    @Column(name = "CERT_KND", length = 10)
    private String certKnd;

    @Column(name = "CUS_CD", length = 30)
    private String cusCd;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    public static MtcCert create(String certId, int sortSeq) {
        MtcCert c = new MtcCert();
        c.certId = certId;
        c.sortSeq = sortSeq;
        return c;
    }

    public void write(String bodyJson, String mtcNo, String certKnd, String cusCd, String by, LocalDateTime at) {
        this.bodyJson = bodyJson;
        this.mtcNo = mtcNo;
        this.certKnd = certKnd;
        this.cusCd = cusCd;
        this.updBy = by;
        this.updAt = at;
    }

    @Override
    public String docKey() {
        return certId;
    }
}
