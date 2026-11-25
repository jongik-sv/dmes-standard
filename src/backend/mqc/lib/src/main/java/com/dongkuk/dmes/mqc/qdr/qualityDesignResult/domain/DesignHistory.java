package com.dongkuk.dmes.mqc.qdr.qualityDesignResult.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 품질설계 이력(TB_MQC_DSN_HIST) — CALC 계산 · CONF 확정 · HOLD 보류 · UNHOLD 보류 해제. */
@Entity
@Table(name = "TB_MQC_DSN_HIST")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class DesignHistory {

    public static final String CALC = "CALC";
    public static final String CONF = "CONF";
    public static final String HOLD = "HOLD";
    public static final String UNHOLD = "UNHOLD";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "HIST_ID")
    private Long histId;

    @Column(name = "ORD_KEY", nullable = false, length = 30)
    private String ordKey;

    @Column(name = "ACTION_CD", nullable = false, length = 10)
    private String actionCd;

    @Column(name = "BEFORE_STAT", length = 10)
    private String beforeStat;

    @Column(name = "AFTER_STAT", nullable = false, length = 10)
    private String afterStat;

    @Column(name = "NOTE", length = 500)
    private String note;

    @Column(name = "ACT_BY", nullable = false, length = 50)
    private String actBy;

    @Column(name = "ACT_DTTM", nullable = false)
    private LocalDateTime actDttm;

    public static DesignHistory of(String ordKey, String action, DesignStatus before, DesignStatus after, String note, String by, LocalDateTime at) {
        DesignHistory h = new DesignHistory();
        h.ordKey = ordKey;
        h.actionCd = action;
        h.beforeStat = before == null ? null : before.name();
        h.afterStat = after.name();
        h.note = note;
        h.actBy = by;
        h.actDttm = at;
        return h;
    }
}
