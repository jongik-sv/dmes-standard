package com.dongkuk.dmes.mdm.dmc.codeCateEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCatePreviewRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateRevertRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateSaveRequest;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto.CodeCateViewRequest;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.function.Executable;

/** TSK-06-04 design.md §2·§3 — codeCateEdit 서비스 시험의 요청·행 만들기와 오류 단언. */
final class CodeCateEditRequests {

    private CodeCateEditRequests() {
    }

    static CodeCateViewRequest view(String id, String ver) {
        CodeCateViewRequest r = new CodeCateViewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        return r;
    }

    static CodeCatePreviewRequest preview(String id, String ver, String cateId, String defExpr, String defTarget) {
        CodeCatePreviewRequest r = new CodeCatePreviewRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setCateId(cateId);
        r.setDefExpr(defExpr);
        r.setDefTarget(defTarget);
        return r;
    }

    static CodeCateSaveRequest save(String id, String ver, Long rowVersion) {
        CodeCateSaveRequest r = new CodeCateSaveRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        return r;
    }

    static CodeCateRevertRequest revert(String id, String ver, long rowVersion, String table, String cateId,
                                        String code) {
        CodeCateRevertRequest r = new CodeCateRevertRequest();
        r.setMaruCodeId(id);
        r.setVer(ver);
        r.setRowVersion(rowVersion);
        r.setTable(table);
        r.setCateId(cateId);
        r.setCode(code);
        return r;
    }

    /** categories 그리드 행. */
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

    static Map<String, Object> cateDeleted(String cateId) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowStatus", "DELETED");
        m.put("cateId", cateId);
        return m;
    }

    /** members 그리드 행. */
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

    static Map<String, Object> byCateId(List<Map<String, Object>> rows, String cateId) {
        return rows.stream().filter(r -> cateId.equals(r.get("cateId"))).findFirst()
                .orElseThrow(() -> new AssertionError(cateId + " 없음: " + rows));
    }
}
