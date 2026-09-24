package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import java.util.ArrayList;
import java.util.List;

/**
 * 오프셋·총 길이 순수 계산(TSK-05-02 design.md F7·F8, 불변 I1~I4). 오프셋은 0부터 센다(위치 표시 "131-150" 은 화면 몫).
 * 헤더 항목 오프셋은 그 헤더 안 상대값, 본문 항목 오프셋은 메시지 절대값, 헤더의 메시지 시작 위치는 앞 헤더 길이 합이다.
 * m-mdm {@code src/layout/layout-calc.ts} 가 같은 규칙으로 즉시 재계산한다.
 */
public final class LayoutOffsetCalculator {

    /** 헤더 한 벌 — 항목 상대 오프셋과 헤더 길이. */
    public record Placed(List<Integer> offsets, int total) {
    }

    /** 전문 한 벌 — 헤더 절대 시작 위치·헤더 합·본문 절대 오프셋·총 길이. */
    public record Stacked(List<Integer> headerOffsets, int headerLength, List<Integer> bodyOffsets, int total) {
    }

    private LayoutOffsetCalculator() {
    }

    /**
     * 항목 길이(불변 I4): FILLER → FILLER 길이(1 이상), 숫자 표현 형식이 있으면 그 표현 자리수, 아니면 도메인 조립기의 유효 길이.
     *
     * @throws IllegalArgumentException 길이를 정할 수 없다(L03·L07 원인)
     */
    public static int itemLength(MdmFillKind kind, Integer fillerLength, LayoutNumFormat numFormat, Integer derivedLength) {
        if (kind == MdmFillKind.FILLER) {
            if (fillerLength == null || fillerLength < 1) {
                throw new IllegalArgumentException("FILLER 길이는 1 이상이어야 한다: " + fillerLength);
            }
            return fillerLength;
        }
        if (numFormat != null) {
            return numFormat.width();
        }
        if (derivedLength == null || derivedLength < 1) {
            throw new IllegalArgumentException("도메인 길이를 파생할 수 없다");
        }
        return derivedLength;
    }

    public static Placed placeHeader(List<Integer> itemLengths) {
        List<Integer> offsets = new ArrayList<>(itemLengths.size());
        int at = 0;
        for (int len : itemLengths) {
            offsets.add(at);
            at += len;
        }
        return new Placed(List.copyOf(offsets), at);
    }

    public static Stacked placeMessage(List<Integer> headerTotals, List<Integer> bodyLengths) {
        Placed headers = placeHeader(headerTotals);
        int base = headers.total();
        List<Integer> body = new ArrayList<>(bodyLengths.size());
        int at = base;
        for (int len : bodyLengths) {
            body.add(at);
            at += len;
        }
        return new Stacked(headers.offsets(), base, List.copyOf(body), at);
    }
}
