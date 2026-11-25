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

/** 검사증명서 단건 수정(TB_MQC_MTC_CERT_OVR). 키 = 증명서 id. 본문 = 목업 S.ovr[id] { form, head, f, remark, coil, … }. */
@Entity
@Table(name = "TB_MQC_MTC_CERT_OVR")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MtcCertOverride implements MtcDoc {

    @Id
    @Column(name = "CERT_ID", length = 20)
    private String certId;

    @Column(name = "SORT_SEQ", nullable = false)
    private Integer sortSeq;

    @Lob
    @Column(name = "BODY_JSON", nullable = false)
    private String bodyJson;

    @Column(name = "UPD_BY", length = 50)
    private String updBy;

    @Column(name = "UPD_AT", nullable = false)
    private LocalDateTime updAt;

    public static MtcCertOverride create(String certId, int sortSeq) {
        MtcCertOverride o = new MtcCertOverride();
        o.certId = certId;
        o.sortSeq = sortSeq;
        return o;
    }

    public void write(String bodyJson, String by, LocalDateTime at) {
        this.bodyJson = bodyJson;
        this.updBy = by;
        this.updAt = at;
    }

    @Override
    public String docKey() {
        return certId;
    }
}
