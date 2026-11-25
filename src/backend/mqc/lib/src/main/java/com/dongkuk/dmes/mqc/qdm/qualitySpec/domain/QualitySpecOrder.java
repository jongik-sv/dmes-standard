package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 주문 적용 시뮬레이션 표본 주문(OMS 수신). attrsJson = {"항목코드":"값"}. */
@Entity
@Table(name = "TB_MQC_QSPEC_ORD")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecOrder {

    @Id
    @Column(name = "ORD_NO", length = 20)
    private String ordNo;

    @Column(name = "CUS_CD", nullable = false, length = 10)
    private String cusCd;

    @Column(name = "PRD_NM_CD", nullable = false, length = 2)
    private String prdNmCd;

    @Column(name = "QTY", length = 20)
    private String qty;

    @Column(name = "ATTRS_JSON", nullable = false, length = 2000)
    private String attrsJson;

    @Column(name = "RECV_DTTM", nullable = false)
    private LocalDateTime recvDttm;

    public static QualitySpecOrder of(String ordNo, String cusCd, String prdNmCd, String qty, String attrsJson, LocalDateTime recvDttm) {
        QualitySpecOrder o = new QualitySpecOrder();
        o.ordNo = ordNo; o.cusCd = cusCd; o.prdNmCd = prdNmCd; o.qty = qty; o.attrsJson = attrsJson; o.recvDttm = recvDttm;
        return o;
    }
}
