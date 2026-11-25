package com.dongkuk.dmes.mqc.qcd.designSimulation.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Lob;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 시뮬레이션 케이스(TB_MQC_SIM_CASE). LAST_STAT = NOT_RUN · PASS · WARN · FAIL. */
@Entity
@Table(name = "TB_MQC_SIM_CASE")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class SimCase {

    @Id
    @Column(name = "CASE_ID", length = 20)
    private String caseId;

    @Column(name = "CASE_NM", nullable = false, length = 100)
    private String caseNm;

    @Column(name = "BASE_ORD_REF", length = 30)
    private String baseOrdRef;

    @Lob
    @Column(name = "ORDER_JSON", nullable = false)
    private String orderJson;

    @Lob
    @Column(name = "PINS_JSON")
    private String pinsJson;

    @Lob
    @Column(name = "VERDICTS_JSON")
    private String verdictsJson;

    @Lob
    @Column(name = "GOLDEN_JSON")
    private String goldenJson;

    @Column(name = "GOLDEN_DTTM")
    private LocalDateTime goldenDttm;

    @Column(name = "LAST_STAT", nullable = false, length = 10)
    private String lastStat;

    @Lob
    @Column(name = "LAST_RUN_JSON")
    private String lastRunJson;

    @Column(name = "LAST_RUN_DTTM")
    private LocalDateTime lastRunDttm;

    @Column(name = "AUTHOR_NM", nullable = false, length = 50)
    private String authorNm;

    @Column(name = "REG_DTTM", nullable = false)
    private LocalDateTime regDttm;

    @Column(name = "MOD_DTTM", nullable = false)
    private LocalDateTime modDttm;

    public static SimCase create(String caseId, String author, LocalDateTime at) {
        SimCase c = new SimCase();
        c.caseId = caseId;
        c.authorNm = author;
        c.regDttm = at;
        c.modDttm = at;
        c.lastStat = "NOT_RUN";
        return c;
    }

    /** 이름·주문·기대값을 바꾼다. 주문이 바뀌면 마지막 실행은 그대로 두되 상태는 미실행이 된다. */
    public void edit(String caseNm, String baseOrdRef, String orderJson, String pinsJson, String verdictsJson, LocalDateTime at) {
        boolean changed = this.orderJson == null || !this.orderJson.equals(orderJson)
                || !java.util.Objects.equals(this.pinsJson, pinsJson) || !java.util.Objects.equals(this.verdictsJson, verdictsJson);
        this.caseNm = caseNm;
        this.baseOrdRef = baseOrdRef;
        this.orderJson = orderJson;
        this.pinsJson = pinsJson;
        this.verdictsJson = verdictsJson;
        if (changed) this.lastStat = "NOT_RUN";
        this.modDttm = at;
    }

    public void ran(String status, String evalJson, LocalDateTime at) {
        this.lastStat = status;
        this.lastRunJson = evalJson;
        this.lastRunDttm = at;
    }

    public void golden(String snapshotJson, LocalDateTime at) {
        this.goldenJson = snapshotJson;
        this.goldenDttm = at;
        this.modDttm = at;
    }
}
