package com.dongkuk.dmes.mqc.qjd.qualityJudgment.service;

import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.Coil;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.CoilJudgment;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.InspectionItem;
import com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain.JudgmentStatus;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;

/** 시험용 코일·검사 항목·판정 만들기. 기준은 KSG-SGC340(도금량 80/120, 표면 B, YP 245~, TS 340~, EL 20~, 두께 ±0.020). */
public final class CoilFixtures {

    public static final Clock CLOCK = Clock.fixed(ZonedDateTime.of(2026, 9, 2, 10, 0, 0, 0, ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));

    private CoilFixtures() {
    }

    public static Coil coil(String coilNo, String ordNo) {
        return Coil.of(coilNo, ordNo, "수요가 A", "PO-A-1", "G", "GI", "KSG-SGC340", new BigDecimal("0.440"), new BigDecimal("1225"),
                new BigDecimal("7800"), "2CGL", "5A1198", "검사자", LocalDateTime.of(2026, 9, 1, 10, 0));
    }

    /** values: 도금량, 표면, YP, TS, EL, 두께 편차 순(null 은 미검). */
    public static List<InspectionItem> items(String coilNo, String... values) {
        List<InspectionItem> out = new ArrayList<>();
        out.add(InspectionItem.of(coilNo, "COAT", 1, "도금량", "COAT", "RANGE", new BigDecimal("80"), new BigDecimal("120"), null, values[0]));
        out.add(InspectionItem.of(coilNo, "SURF", 2, "표면 결함", "SURF", "GRADE", null, null, "B", values[1]));
        out.add(InspectionItem.of(coilNo, "YP", 3, "YP", "MECH", "RANGE", new BigDecimal("245"), null, null, values[2]));
        out.add(InspectionItem.of(coilNo, "TS", 4, "TS", "MECH", "RANGE", new BigDecimal("340"), null, null, values[3]));
        out.add(InspectionItem.of(coilNo, "EL", 5, "EL", "MECH", "RANGE", new BigDecimal("20"), null, null, values[4]));
        out.add(InspectionItem.of(coilNo, "THK", 6, "두께 편차", "DIM", "RANGE", new BigDecimal("-0.020"), new BigDecimal("0.020"), null, values[5]));
        return out;
    }

    public static List<InspectionItem> passingItems(String coilNo) {
        return items(coilNo, "104", "A", "312", "398", "29", "+0.002");
    }

    public static CoilSnapshot snapshot(String coilNo, String ordNo, JudgmentStatus status, JudgmentStatus suggestion) {
        return new CoilSnapshot(coil(coilNo, ordNo), CoilJudgment.of(coilNo, status, suggestion), passingItems(coilNo));
    }
}
