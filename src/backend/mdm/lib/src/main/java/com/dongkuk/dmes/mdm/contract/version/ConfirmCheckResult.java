package com.dongkuk.dmes.mdm.contract.version;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.List;

/** 확정 검사 SPI 결과. errors 가 비면 통과, warnings 는 담당자 확인 대상(ADR-0002 D4). */
public record ConfirmCheckResult(List<MdmCheckIssue> errors, List<MdmCheckIssue> warnings) {
}
