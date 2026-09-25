package com.dongkuk.dmes.mdm.dmc.codeConfirm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dmc.codeConfirm.dto.CodeConfirmViewRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.function.Executable;

/**
 * TSK-06-05 design.md §2·§3.2 — codeConfirm 서비스 시험의 요청 만들기와 오류 단언. codeItemEdit·codeCateEdit 그리드 행
 * 도우미({@code CodeItemEditRequests.row}·{@code CodeCateEditRequests.cateRow}·{@code memberRow})는 다른 패키지의
 * package-private 이라 같은 모양을 여기 둔다.
 */
final class CodeConfirmRequests {

    private CodeConfirmRequests() {
    }

    static CodeConfirmSearchRequest search(String keyword) {
        CodeConfirmSearchRequest r = new CodeConfirmSearchRequest();
        r.setKeyword(keyword);
        return r;
    }

    static CodeConfirmViewRequest view(String id, String ver) {
        CodeConfirmViewRequest r = new CodeConfirmViewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        return r;
    }

    static CodeConfirmValidateRequest validate(String id, String ver, String applyFrom) {
        CodeConfirmValidateRequest r = new CodeConfirmValidateRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setApplyFrom(applyFrom);
        return r;
    }

    static CodeConfirmRequest confirm(String id, String ver, Long rowVersion, String applyFrom, Boolean ack) {
        CodeConfirmRequest r = new CodeConfirmRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(ack);
        return r;
    }

    /** codeItemEdit items 그리드 행(모든 값 칸). */
    static Map<String, Object> itemRow(String status, String code, String name, String alterName, Integer seq) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("code", code);
        m.put("name", name);
        m.put("alterName", alterName);
        m.put("seq", seq);
        return m;
    }

    /** codeCateEdit categories 그리드 행. */
    static Map<String, Object> cateRow(String status, String cateId, String cateName, String defKind, String defExpr,
                                       String defTarget) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("cateId", cateId);
        m.put("cateName", cateName);
        m.put("defKind", defKind);
        m.put("defExpr", defExpr);
        m.put("defTarget", defTarget);
        return m;
    }

    /** codeCateEdit members 그리드 행. */
    static Map<String, Object> memberRow(String cateId, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", "ADDED");
        m.put("cateId", cateId);
        m.put("code", code);
        return m;
    }

    static BusinessException assertMdm(MdmErrorCode code, Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals(code.code(), e.getErrors().get(0).code(), e.getMessage());
        return e;
    }

    @SuppressWarnings("unchecked")
    static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> map(Map<String, Object> result, String key) {
        return (Map<String, Object>) result.get(key);
    }

    /** validate 결과 rows 에서 항목 번호({@code "3"}, {@code "2-2"})의 행. */
    static Map<String, Object> checkRow(Map<String, Object> result, String no) {
        return list(result, "rows").stream().filter(r -> no.equals(r.get("no"))).findFirst()
                .orElseThrow(() -> new AssertionError(no + " 없음: " + result.get("rows")));
    }

    static String status(Map<String, Object> result, String no) {
        return (String) checkRow(result, no).get("status");
    }
}
