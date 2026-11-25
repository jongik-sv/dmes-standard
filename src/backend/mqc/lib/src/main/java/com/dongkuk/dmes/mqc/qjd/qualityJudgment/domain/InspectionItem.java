package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * 코일 검사 항목(TB_MQC_COIL_INSP) — 도금량·표면·YP·TS·EL·두께 편차. 기준(CRIT_*)은 품질설계결과에서 내려온 값의 사본이다.
 * ITEM_GRP 는 목록 배지 묶음이다: COAT 도금량 · SURF 표면 · MECH 기계적성질 · DIM 치수.
 */
@Entity
@Table(name = "TB_MQC_COIL_INSP")
@IdClass(InspectionItemId.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class InspectionItem extends CactusAuditEntity {

    @Id
    @Column(name = "COIL_NO", length = 20)
    private String coilNo;

    @Id
    @Column(name = "ITEM_CD", length = 10)
    private String itemCd;

    @Column(name = "SEQ", nullable = false)
    private Integer seq;

    @Column(name = "ITEM_NM", nullable = false, length = 30)
    private String itemNm;

    @Column(name = "ITEM_GRP", nullable = false, length = 10)
    private String itemGrp;

    @Column(name = "UNIT_NM", length = 10)
    private String unitNm;

    @Column(name = "CRIT_TP", nullable = false, length = 10)
    private String critTp;

    @Column(name = "CRIT_TXT", length = 30)
    private String critTxt;

    @Column(name = "LOWER_VAL", precision = 12, scale = 4)
    private BigDecimal lowerVal;

    @Column(name = "UPPER_VAL", precision = 12, scale = 4)
    private BigDecimal upperVal;

    @Column(name = "GRADE_LMT", length = 2)
    private String gradeLmt;

    @Column(name = "MEAS_VAL", length = 20)
    private String measVal;

    @Enumerated(EnumType.STRING)
    @Column(name = "RSLT_CD", nullable = false, length = 10)
    private ItemResult rsltCd;

    /** 시험용 생성. */
    public static InspectionItem of(String coilNo, String itemCd, int seq, String itemNm, String itemGrp, String critTp,
                                    BigDecimal lower, BigDecimal upper, String gradeLmt, String measVal) {
        InspectionItem i = new InspectionItem();
        i.coilNo = coilNo;
        i.itemCd = itemCd;
        i.seq = seq;
        i.itemNm = itemNm;
        i.itemGrp = itemGrp;
        i.critTp = critTp;
        i.critTxt = itemNm;
        i.lowerVal = lower;
        i.upperVal = upper;
        i.gradeLmt = gradeLmt;
        i.measVal = measVal;
        i.rsltCd = InspectionEvaluator.evaluate(critTp, lower, upper, gradeLmt, measVal);
        return i;
    }

    /** 검사값을 바꾸고 기준으로 다시 판정한다. value 는 InspectionEvaluator.normalize 를 거친 값이다. */
    public void record(String value) {
        this.measVal = value;
        reevaluate();
    }

    /** 지금 검사값으로 다시 판정한다. */
    public void reevaluate() {
        this.rsltCd = InspectionEvaluator.evaluate(critTp, lowerVal, upperVal, gradeLmt, measVal);
    }

    /** 숫자 검사값. 숫자가 아니거나 비었으면 null. */
    public BigDecimal numericValue() {
        if (measVal == null || measVal.isBlank()) return null;
        try {
            return new BigDecimal(measVal.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
