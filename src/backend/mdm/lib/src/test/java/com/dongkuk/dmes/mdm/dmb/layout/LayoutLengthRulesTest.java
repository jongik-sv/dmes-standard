package com.dongkuk.dmes.mdm.dmb.layout;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class LayoutLengthRulesTest {

    private static MdmLayoutSnapshot withTotal(int total, int msgLengthWidth) {
        MdmLayoutItemSnapshot len = new MdmLayoutItemSnapshot(1, MdmFillKind.AUTO, MdmLayoutItemType.NUM, "SNT_LTH", null, null, null,
                "MSG_LENGTH", null, null, 0, msgLengthWidth, null, 0);
        MdmLayoutHeaderRef h = new MdmLayoutHeaderRef(1, 100L, "H", 0, msgLengthWidth, List.of(len), new BigDecimal("1.000"));
        return new MdmLayoutSnapshot(201L, "M", null, null, null, null, null, new BigDecimal("1.000"), total, List.of(h), List.of());
    }

    @Test
    void msgLengthFieldMustHoldTotalLength() {
        assertThat(LayoutLengthRules.msgLengthIssues(withTotal(999, 3))).isEmpty();
        assertThat(LayoutLengthRules.msgLengthIssues(withTotal(1000, 3)))
                .singleElement().satisfies(i -> assertThat(i.code()).isEqualTo(LayoutIssueCode.L16));
    }
}
