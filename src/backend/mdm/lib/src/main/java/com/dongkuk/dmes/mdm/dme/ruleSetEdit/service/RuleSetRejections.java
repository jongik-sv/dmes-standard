package com.dongkuk.dmes.mdm.dme.ruleSetEdit.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 룰 세트 저장·되살리기 거부 예외(TSK-08-06 design §2.1, D8). OASIS 는 serviceTask 예외의 {@code meta.message} 만 화면에 싣으므로 message 는
 * 기본 문구로 시작하고 {@code ": "} 뒤에 {@code "<룰 ID>[<변수>] <검사 코드> <문구>; …"} 를 잇는다({@code MasterCodeRejections} 선례).
 * 룰 ID·변수가 없는 칸(EMPTY·1단계 검사)은 {@code -} 로 적는다.
 */
public final class RuleSetRejections {

    private RuleSetRejections() {
    }

    /** MDM024 — 거부(REJECT) 검사들. issue = (검사 코드, 문구, 변수, 룰 ID). */
    public static BusinessException saveRejected(List<RuleSetCheck> rejects) {
        List<MdmCheckIssue> issues = rejects.stream()
                .map(c -> new MdmCheckIssue(c.code(), c.message(), c.varName(), c.ruleId()))
                .toList();
        return MdmErrors.of(MdmErrorCode.RULE_SET_SAVE_REJECTED, detail(rejects), issues);
    }

    static String detail(List<RuleSetCheck> rejects) {
        return rejects.stream()
                .map(c -> dash(c.ruleId()) + "[" + dash(c.varName()) + "] " + c.code() + " " + c.message())
                .collect(Collectors.joining("; "));
    }

    private static String dash(String s) {
        return s == null ? "-" : s;
    }
}
