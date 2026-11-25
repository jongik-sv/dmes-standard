package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 판정 처리 이력(TB_MQC_COIL_JDG_HIST). ACT_CD: JUDGE 판정 계산 · CONFIRM 판정 확정. 쌓기만 한다. */
@Entity
@Table(name = "TB_MQC_COIL_JDG_HIST")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class JudgmentHistory {

    public static final String JUDGE = "JUDGE";
    public static final String CONFIRM = "CONFIRM";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "HIST_NO")
    private Long histNo;

    @Column(name = "COIL_NO", nullable = false, length = 20)
    private String coilNo;

    @Column(name = "ACT_CD", nullable = false, length = 10)
    private String actCd;

    @Enumerated(EnumType.STRING)
    @Column(name = "STAT_BEF", length = 10)
    private JudgmentStatus statBef;

    @Enumerated(EnumType.STRING)
    @Column(name = "STAT_AFT", length = 10)
    private JudgmentStatus statAft;

    @Enumerated(EnumType.STRING)
    @Column(name = "SUGG_STAT", length = 10)
    private JudgmentStatus suggStat;

    @Column(name = "NOTE", length = 500)
    private String note;

    @Column(name = "ACT_BY", length = 50)
    private String actBy;

    @Column(name = "ACT_AT", nullable = false)
    private LocalDateTime actAt;

    public static JudgmentHistory of(String coilNo, String actCd, JudgmentStatus before, JudgmentStatus after,
                                     JudgmentStatus suggestion, String note, String by, LocalDateTime at) {
        JudgmentHistory h = new JudgmentHistory();
        h.coilNo = coilNo;
        h.actCd = actCd;
        h.statBef = before;
        h.statAft = after;
        h.suggStat = suggestion;
        h.note = note;
        h.actBy = by;
        h.actAt = at;
        return h;
    }
}
