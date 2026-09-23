package com.dongkuk.dmes.mdm.contract.version;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.List;

/** 확정 결과 — ADR-0002 D4. closedPrevious 가 null 이면 최초 버전(닫은 직전 버전 없음). */
public record ConfirmResult(VersionRef confirmed, long rowVersion, VersionRef closedPrevious,
                            List<MdmCheckIssue> warnings) {
}
