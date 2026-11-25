package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 제강 Heat 화학 성분(TB_MQC_HEAT_CHEM, wt%). 읽기 전용. */
@Entity
@Table(name = "TB_MQC_HEAT_CHEM")
@IdClass(HeatChemistryId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class HeatChemistry {

    @Id
    @Column(name = "HEAT_NO", length = 20)
    private String heatNo;

    @Id
    @Column(name = "ELEM_CD", length = 5)
    private String elemCd;

    @Column(name = "SEQ", nullable = false)
    private Integer seq;

    @Column(name = "CONT_VAL", precision = 8, scale = 4)
    private BigDecimal contVal;

    /** 시험용 생성. */
    public static HeatChemistry of(String heatNo, String elemCd, int seq, BigDecimal value) {
        HeatChemistry h = new HeatChemistry();
        h.heatNo = heatNo;
        h.elemCd = elemCd;
        h.seq = seq;
        h.contVal = value;
        return h;
    }
}
