package com.dongkuk.dmes.mdm.contract.mastercode;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.util.List;

/** 확정 검사 8항 결과 표(화면 06-05) — results 는 {@link MasterCodeConfirmCheckItem} 순서대로 10행을 모두 담는다. */
public record MasterCodeConfirmCheckReport(VersionRef draft, List<MasterCodeCheckItemResult> results) {
}
