package com.dongkuk.dmes.mqc.qdm.qualitySpec.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** 사양 조건(IF)·설계결과(THEN) 한 줄. attrCd 가 null 이면 항목 사전에 없는(미매핑) 항목이다. */
@Entity
@Table(name = "TB_MQC_QSPEC_TERM")
@IdClass(QualitySpecTerm.Key.class)
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class QualitySpecTerm {

    public static final String IF = "IF";
    public static final String THEN = "THEN";

    @Id
    @Column(name = "SPEC_NO", length = 20)
    private String specNo;

    @Id
    @Column(name = "SIDE", length = 4)
    private String side;

    @Id
    @Column(name = "SEQ")
    private int seq;

    @Column(name = "ATTR_CD", length = 20)
    private String attrCd;

    @Column(name = "ATTR_NM", nullable = false, length = 50)
    private String attrNm;

    @Column(name = "OP", nullable = false, length = 2)
    private String op;

    @Column(name = "VAL", nullable = false, length = 200)
    private String val;

    @Column(name = "UNIT", length = 10)
    private String unit;

    public static QualitySpecTerm of(String specNo, String side, int seq, String attrCd, String attrNm, String op, String val, String unit) {
        QualitySpecTerm t = new QualitySpecTerm();
        t.specNo = specNo; t.side = side; t.seq = seq; t.attrCd = attrCd; t.attrNm = attrNm; t.op = op; t.val = val;
        t.unit = unit == null || unit.isBlank() ? null : unit;
        return t;
    }

    public boolean isIf() { return IF.equals(side); }

    /** 복합 키(SPEC_NO, SIDE, SEQ). */
    @Getter
    @NoArgsConstructor
    public static class Key implements Serializable {
        private String specNo;
        private String side;
        private int seq;

        public Key(String specNo, String side, int seq) { this.specNo = specNo; this.side = side; this.seq = seq; }

        @Override public boolean equals(Object o) {
            return o instanceof Key k && seq == k.seq && Objects.equals(specNo, k.specNo) && Objects.equals(side, k.side);
        }
        @Override public int hashCode() { return Objects.hash(specNo, side, seq); }
    }
}
