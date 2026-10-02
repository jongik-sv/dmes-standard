package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.codec.LayoutAutoValues;
import java.util.ArrayList;
import java.util.List;

/**
 * 총 길이 규칙(D-144 3단계 — 스펙 §7 "헤더 변경 뒤 전문 총 길이 규칙"). 03 에 총 길이 상한은 없다 — 실제로 깨지는 것은 AUTO
 * MSG_LENGTH 칸이 합성 총 길이를 담지 못하는 경우다(직렬화가 넘침으로 실패한다). 부호 형식이면 한 자리를 부호가 쓴다.
 */
public final class LayoutLengthRules {

    private LayoutLengthRules() {
    }

    public static List<LayoutIssue> msgLengthIssues(MdmLayoutSnapshot s) {
        List<LayoutIssue> out = new ArrayList<>();
        int digits = String.valueOf(s.totalLength()).length();
        for (MdmLayoutHeaderRef h : s.headers()) {
            h.items().forEach(i -> check(i, digits, s.totalLength(), "헤더 " + h.headerLayoutName(), out));
        }
        s.items().forEach(i -> check(i, digits, s.totalLength(), "본문", out));
        return out;
    }

    private static void check(MdmLayoutItemSnapshot i, int digits, int total, String where, List<LayoutIssue> out) {
        if (i.fillKind() != MdmFillKind.AUTO || !LayoutAutoValues.MSG_LENGTH.equals(i.defaultValue())) {
            return;
        }
        int width = i.length() - (i.numFormat() != null && i.numFormat().sign() ? 1 : 0);
        if (digits > width) {
            out.add(LayoutIssue.of(LayoutIssueCode.L16, i.seq(), "LENGTH",
                    where + " 전문 길이 칸(" + i.columnPhys() + ", " + width + "자리)이 총 길이 " + total + " 를 담지 못합니다"));
        }
    }
}
