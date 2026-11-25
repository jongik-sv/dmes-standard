package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 품질설계결과(TB_MQC_DSN_RSLT) — 파이프라인 실행 문서(JSON) 하나와 머리 칼럼. */
@Entity
@Table(name = "TB_MQC_DSN_RSLT")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DesignResult {

    @Id
    @Column(name = "ORD_KEY", length = 30)
    private String ordKey;

    @Column(name = "VERDICT", nullable = false, length = 5)
    private String verdict;

    @Column(name = "MAIN_LINE", length = 10)
    private String mainLine;

    @Column(name = "ROUTE_CD", length = 30)
    private String routeCd;

    @Column(name = "RAW_MAT_CD", length = 10)
    private String rawMatCd;

    @Column(name = "SET_THK", precision = 6, scale = 3)
    private BigDecimal setThk;

    @Column(name = "PLTCM_WID", precision = 7, scale = 1)
    private BigDecimal pltcmWid;

    @Column(name = "ERR_CNT", nullable = false)
    private Integer errCnt;

    @Column(name = "WARN_CNT", nullable = false)
    private Integer warnCnt;

    @Column(name = "EVAL_DTTM", nullable = false)
    private LocalDateTime evalDttm;

    @Lob
    @Column(name = "RESULT_JSON", nullable = false)
    private String resultJson;

    @Column(name = "CALC_BY", nullable = false, length = 50)
    private String calcBy;

    @Column(name = "CALC_DTTM", nullable = false)
    private LocalDateTime calcDttm;

    public static DesignResult of(String ordKey) {
        DesignResult r = new DesignResult();
        r.ordKey = ordKey;
        return r;
    }

    public void update(String verdict, String mainLine, String routeCd, String rawMatCd, BigDecimal setThk, BigDecimal pltcmWid,
                       int errCnt, int warnCnt, LocalDateTime evalDttm, String resultJson, String by, LocalDateTime at) {
        this.verdict = verdict;
        this.mainLine = mainLine;
        this.routeCd = routeCd;
        this.rawMatCd = rawMatCd;
        this.setThk = setThk;
        this.pltcmWid = pltcmWid;
        this.errCnt = errCnt;
        this.warnCnt = warnCnt;
        this.evalDttm = evalDttm;
        this.resultJson = resultJson;
        this.calcBy = by;
        this.calcDttm = at;
    }
}
