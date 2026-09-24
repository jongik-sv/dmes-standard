package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.List;

/** 확정 검사 결과 표의 한 행. issues 의 code 는 {@code item.name()}, itemKey 는 {@link MasterCodeDiffConventions} 키다. */
public record MasterCodeCheckItemResult(MasterCodeConfirmCheckItem item, MasterCodeCheckStatus status,
                                        List<MdmCheckIssue> issues) {
}
