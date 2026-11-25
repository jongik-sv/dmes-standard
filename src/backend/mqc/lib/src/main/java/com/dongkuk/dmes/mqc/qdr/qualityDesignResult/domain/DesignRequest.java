package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain;

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

/** 품질설계 의뢰(TB_MQC_DSN_REQ) — 주문 줄당 설계 상태. */
@Entity
@Table(name = "TB_MQC_DSN_REQ")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DesignRequest {

    @Id
    @Column(name = "ORD_KEY", length = 30)
    private String ordKey;

    @Column(name = "ORD_REQ_NO", nullable = false, length = 20)
    private String ordReqNo;

    @Column(name = "ORD_REQ_LN", nullable = false, length = 5)
    private String ordReqLn;

    @Column(name = "REQ_DT", nullable = false, length = 8)
    private String reqDt;

    @Enumerated(EnumType.STRING)
    @Column(name = "DSN_STAT", nullable = false, length = 10)
    private DesignStatus dsnStat;

    @Enumerated(EnumType.STRING)
    @Column(name = "PREV_STAT", length = 10)
    private DesignStatus prevStat;

    @Column(name = "CONF_BY", length = 50)
    private String confBy;

    @Column(name = "CONF_DTTM")
    private LocalDateTime confDttm;

    @Column(name = "MOD_BY", nullable = false, length = 50)
    private String modBy;

    @Column(name = "MOD_DTTM", nullable = false)
    private LocalDateTime modDttm;

    /** 의뢰 행이 없는 주문의 시작 상태(미설계). */
    public static DesignRequest waiting(String ordReqNo, String ordReqLn, String reqDt, String by, LocalDateTime at) {
        DesignRequest r = new DesignRequest();
        r.ordKey = ordReqNo + "-" + ordReqLn;
        r.ordReqNo = ordReqNo;
        r.ordReqLn = ordReqLn;
        r.reqDt = reqDt;
        r.dsnStat = DesignStatus.WAIT;
        r.modBy = by;
        r.modDttm = at;
        return r;
    }

    /** 시험용. */
    public static DesignRequest of(String ordReqNo, String ordReqLn, DesignStatus st) {
        DesignRequest r = waiting(ordReqNo, ordReqLn, "20260831", "system", LocalDateTime.of(2026, 8, 31, 9, 0));
        r.dsnStat = st;
        return r;
    }

    public void calculated(String by, LocalDateTime at) {
        if (dsnStat == DesignStatus.WAIT) dsnStat = DesignStatus.ING;
        touch(by, at);
    }

    public void confirm(String by, LocalDateTime at) {
        dsnStat = DesignStatus.CONF;
        confBy = by;
        confDttm = at;
        touch(by, at);
    }

    public void hold(String by, LocalDateTime at) {
        prevStat = dsnStat;
        dsnStat = DesignStatus.HOLD;
        touch(by, at);
    }

    public void unhold(String by, LocalDateTime at) {
        dsnStat = prevStat == null || prevStat == DesignStatus.HOLD ? DesignStatus.ING : prevStat;
        prevStat = null;
        touch(by, at);
    }

    private void touch(String by, LocalDateTime at) {
        modBy = by;
        modDttm = at;
    }
}
