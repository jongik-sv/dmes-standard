package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 코일(생산 실적 사본, TB_MQC_COIL). 판정·출력물 화면은 읽기만 한다. 주문 키 ORD_NO 는 문자열로만 잇는다. */
@Entity
@Table(name = "TB_MQC_COIL")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Coil {

    @Id
    @Column(name = "COIL_NO", length = 20)
    private String coilNo;

    @Column(name = "ORD_NO", nullable = false, length = 20)
    private String ordNo;

    @Column(name = "CUS_NM", length = 50)
    private String cusNm;

    @Column(name = "PO_NO", length = 30)
    private String poNo;

    @Column(name = "PRD_CD", nullable = false, length = 5)
    private String prdCd;

    @Column(name = "PRD_NM", length = 30)
    private String prdNm;

    @Column(name = "SPEC_CD", length = 30)
    private String specCd;

    @Column(name = "THK", precision = 6, scale = 3)
    private BigDecimal thk;

    @Column(name = "WTH", precision = 6)
    private BigDecimal wth;

    @Column(name = "WGT", precision = 8)
    private BigDecimal wgt;

    @Column(name = "LINE_CD", length = 10)
    private String lineCd;

    @Column(name = "HEAT_NO", length = 20)
    private String heatNo;

    @Column(name = "PROD_AT")
    private LocalDateTime prodAt;

    @Column(name = "INSP_BY", length = 50)
    private String inspBy;

    @Column(name = "INSP_AT")
    private LocalDateTime inspAt;

    /** 시험용 생성. 운영 데이터는 생산 실적에서 들어온다. */
    public static Coil of(String coilNo, String ordNo, String cusNm, String poNo, String prdCd, String prdNm, String specCd,
                          BigDecimal thk, BigDecimal wth, BigDecimal wgt, String lineCd, String heatNo,
                          String inspBy, LocalDateTime inspAt) {
        Coil c = new Coil();
        c.coilNo = coilNo;
        c.ordNo = ordNo;
        c.cusNm = cusNm;
        c.poNo = poNo;
        c.prdCd = prdCd;
        c.prdNm = prdNm;
        c.specCd = specCd;
        c.thk = thk;
        c.wth = wth;
        c.wgt = wgt;
        c.lineCd = lineCd;
        c.heatNo = heatNo;
        c.prodAt = inspAt;
        c.inspBy = inspBy;
        c.inspAt = inspAt;
        return c;
    }

    /** 「3 : CCGI」 처럼 코드 : 이름. */
    public String prdLabel() {
        return prdNm == null ? prdCd : prdCd + " : " + prdNm;
    }

    /** 「0.450 × 1490」 두께(소수 3자리) × 폭. */
    public String sizeText() {
        String t = thk == null ? "—" : thk.setScale(3, java.math.RoundingMode.HALF_UP).toPlainString();
        String w = wth == null ? "—" : wth.stripTrailingZeros().toPlainString();
        return t + " × " + w;
    }
}
