package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

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

/** 코일 판정(TB_MQC_COIL_JDG). suggStat 은 검사 항목으로 계산한 시스템 제안, jdgStat 은 검사자가 확정한 상태다. */
@Entity
@Table(name = "TB_MQC_COIL_JDG")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CoilJudgment extends CactusAuditEntity {

    @Id
    @Column(name = "COIL_NO", length = 20)
    private String coilNo;

    @Enumerated(EnumType.STRING)
    @Column(name = "JDG_STAT", nullable = false, length = 10)
    private JudgmentStatus jdgStat;

    @Enumerated(EnumType.STRING)
    @Column(name = "SUGG_STAT", length = 10)
    private JudgmentStatus suggStat;

    @Column(name = "JUDGE_AT")
    private LocalDateTime judgeAt;

    @Column(name = "DCSN_BY", length = 50)
    private String dcsnBy;

    @Column(name = "DCSN_AT")
    private LocalDateTime dcsnAt;

    @Column(name = "NOTE", length = 500)
    private String note;

    /** 판정 행이 아직 없는 코일의 시작 상태(판정대기). */
    public static CoilJudgment waiting(String coilNo) {
        CoilJudgment j = new CoilJudgment();
        j.coilNo = coilNo;
        j.jdgStat = JudgmentStatus.WAIT;
        return j;
    }

    /** 시험용 생성. */
    public static CoilJudgment of(String coilNo, JudgmentStatus jdgStat, JudgmentStatus suggStat) {
        CoilJudgment j = waiting(coilNo);
        j.jdgStat = jdgStat;
        j.suggStat = suggStat;
        return j;
    }

    /** 다시 판정할 수 있는 상태(판정대기·보류)인지. 합격·불합격은 확정이다. */
    public boolean isOpen() {
        return jdgStat == JudgmentStatus.WAIT || jdgStat == JudgmentStatus.HOLD;
    }

    /** 시스템 제안을 기록한다. 확정 상태는 바꾸지 않는다. */
    public void suggest(JudgmentStatus suggestion, LocalDateTime at) {
        this.suggStat = suggestion;
        this.judgeAt = at;
    }

    /** 검사자가 판정을 확정한다. */
    public void confirm(JudgmentStatus status, String by, LocalDateTime at, String note) {
        this.jdgStat = status;
        this.dcsnBy = by;
        this.dcsnAt = at;
        this.note = note;
    }
}
