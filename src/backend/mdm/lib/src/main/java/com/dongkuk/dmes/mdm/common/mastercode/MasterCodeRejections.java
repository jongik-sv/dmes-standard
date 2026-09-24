package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 코드 행 저장·경미 수정 거부 예외(TSK-06-03 design.md §6.3, D5). OASIS 는 serviceTask 예외의 {@code meta.message} 만 화면에
 * 싣고 {@code errors[]} 를 비우므로(F11), message 는 기본 문구로 시작하고 {@code ": "} 뒤에
 * {@code "<코드>[<칸>] <이슈 코드> <문구>; …"} 를 잇는다({@code DomainRejections} 선례).
 */
public final class MasterCodeRejections {

    private MasterCodeRejections() {
    }

    /** MDM022 — 저장 검사 이슈. */
    public static BusinessException saveRejected(List<MdmCheckIssue> issues) {
        return MdmErrors.of(MdmErrorCode.CODE_SAVE_REJECTED, detail(issues), issues);
    }

    /** MDM023 — 경미 수정 거부. */
    public static BusinessException patchRejected(List<MdmCheckIssue> issues) {
        return MdmErrors.of(MdmErrorCode.CODE_PATCH_REJECTED, detail(issues), issues);
    }

    static String detail(List<MdmCheckIssue> issues) {
        return issues.stream()
                .map(i -> i.itemKey() + "[" + i.field() + "] " + i.code() + " " + i.message())
                .collect(Collectors.joining("; "));
    }
}
