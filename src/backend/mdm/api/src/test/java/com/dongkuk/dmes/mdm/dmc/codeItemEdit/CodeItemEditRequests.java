package com.dongkuk.dmes.mdm.dmc.codeItemEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPatchRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemPreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto.CodeItemViewRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.function.Executable;

/** TSK-06-03 design.md §4.4·§4.5 — codeItemEdit 서비스 시험의 요청·행 만들기와 오류 단언. */
final class CodeItemEditRequests {

    private CodeItemEditRequests() {
    }

    static CodeItemViewRequest view(String id, String ver) {
        CodeItemViewRequest r = new CodeItemViewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        return r;
    }

    static CodeItemPreviewRequest preview(String id, String ver, String cateId) {
        CodeItemPreviewRequest r = new CodeItemPreviewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setCateId(cateId);
        return r;
    }

    static CodeItemSaveRequest save(String id, String ver, Long rowVersion) {
        CodeItemSaveRequest r = new CodeItemSaveRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        return r;
    }

    static CodeItemRevertRequest revert(String id, String ver, long rowVersion, String code) {
        CodeItemRevertRequest r = new CodeItemRevertRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        r.setCode(code);
        return r;
    }

    static CodeItemPatchRequest patch(String id, String code, String fromVer, String name, String alterName, Integer seq,
                                      String description) {
        CodeItemPatchRequest r = new CodeItemPatchRequest();
        r.setMaruCodeId(id);
        r.setCode(code);
        r.setFromVer(fromVer);
        r.setName(name);
        r.setAlterName(alterName);
        r.setSeq(seq);
        r.setDescription(description);
        return r;
    }

    /** 요청 행 — lvls 는 lvl1 부터. */
    static Map<String, Object> row(String status, String code, String name, Integer seq, String... lvls) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
        m.put("code", code);
        m.put("name", name);
        m.put("seq", seq);
        for (int i = 0; i < lvls.length; i++) {
            m.put("lvl" + (i + 1), lvls[i]);
        }
        return m;
    }

    static Map<String, Object> deleted(String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", "DELETED");
        m.put("code", code);
        return m;
    }

    /** categories 그리드 행(합친 저장, 2026-09-28) — 모양은 codeCateEdit 와 같다. */
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

    /** members 그리드 행(합친 저장). */
    static Map<String, Object> memberRow(String status, String cateId, String code) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", status);
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

    static List<String> codes(List<Map<String, Object>> rows) {
        return rows.stream().map(r -> (String) r.get("code")).toList();
    }

    static Map<String, Object> byCode(List<Map<String, Object>> rows, String code) {
        return rows.stream().filter(r -> code.equals(r.get("code"))).findFirst()
                .orElseThrow(() -> new AssertionError(code + " 없음: " + rows));
    }
}
