package com.dongkuk.dmes.mcm.cmb.masterRuleListPop.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleListPop.dto.MasterRuleListPopSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 업무기준 List조회 — cmb/masterRuleListPop OASIS 서비스 (Spring bean = {@code masterRuleListPopService}).
 *
 * <p><b>조회 전용 LoV 팝업</b> (분석 §0 — Java UserTask·쓰기 트랜잭션 없음). BPMN
 * {@code masterRuleListPop.bpmn} 의 단일 ServiceTask 진입점:
 * <ul>
 *   <li>{@link #search(MasterRuleListPopSearchRequest)} — action=search
 *       (분석 §6.1 GetRuleMasterList — SELECT 9 컬럼, 고정 필터 BR-001)</li>
 * </ul>
 *
 * <p><b>sSchema 동적 스키마 (Q-002 확정 — As-Is 유지 + 화이트리스트 가드)</b>:
 * To-Be DB 스키마는 {@code MCAAPUSER} 단일이므로 화이트리스트 = 공란(기본) / MCAAPUSER /
 * MCA_SOURCE(As-Is Oracle synonym — To-Be 전환 규칙 §11 에 따라 MCAAPUSER 동의어 취급).
 * 그 외 값 → INVALID_VALUE (As-Is {@code ${sSchema}} 문자열 치환의 SQL injection 표면 차단 — 분석 §6 비고).
 * 허용 값은 모두 동일 스키마(MCAAPUSER)로 귀결되므로 JPA 기본 경로(@Table schema) 단일 구현.
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용. 읽기 전용 단일 SELECT (BPMN §5).
 */
@Service("masterRuleListPopService")
public class MasterRuleListPopService {

    /** sSchema 화이트리스트 — Q-002 (MCA_SOURCE 는 As-Is synonym → MCAAPUSER 동의어). */
    private static final Set<String> SCHEMA_WHITELIST = Set.of("MCAAPUSER", "MCA_SOURCE");

    private final RuleMasterRepository repository;

    public MasterRuleListPopService(RuleMasterRepository repository) {
        this.repository = repository;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — As-Is GetRuleMasterList 1:1 (분석 §6.1 / BPMN §3.1).
     *
     * <p>고정 필터 {@code RULE_ID != COALESCE(OLD_RULE_ID,' ')} (BR-001 — USE_TP 무관 전체 현행) +
     * 동적 UPPER LIKE 2 (BR-002/003) + ORDER BY RULE_ID (BR-004). 9 컬럼 camelCase row.
     * 응답 = {@code { ds_GetRuleMasterList: [...], cnt }} (As-Is resultKey 보존 — BPMN §2.2.
     * cnt = 건수, MSG-001 "{n}건 조회 되었습니다.").
     */
    public Map<String, Object> search(MasterRuleListPopSearchRequest request) {
        if (request == null) request = new MasterRuleListPopSearchRequest();
        validateSchema(request.getSSchema());   // BR-005 / Q-002 화이트리스트 가드

        String pRuleId = blankToNull(request.getPRuleId());
        String pRuleNm = blankToNull(request.getPRuleNm());

        List<Object[]> raw = repository.searchRuleMasterListPop(pRuleId, pRuleNm);

        List<Map<String, Object>> list = new ArrayList<>(raw.size());
        for (Object[] r : raw) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleId", r[0]);            // RULE_ID (col 1 표시 / 반환 sRuleId)
            row.put("oldRuleId", r[1]);         // OLD_RULE_ID (미표시 — BR-001 필터 근거)
            row.put("ruleNm", r[2]);            // RULE_NM (col 2 표시 / 반환 sRuleNm)
            row.put("ruleDesc", r[3]);          // RULE_DESC (미표시 — As-Is 9컬럼 보존)
            row.put("ruleVer", r[4]);           // RULE_VER (미표시)
            row.put("ruleTp", r[5]);            // RULE_TP (미표시)
            row.put("ruleOwnerDeptNm", r[6]);   // RULE_OWNER_DEPT_NM (미표시)
            row.put("ruleOwnerEmpNo", r[7]);    // RULE_OWNER_EMP_NO (미표시)
            row.put("useTp", r[8]);             // USE_TP (미표시 — 필터 아님, As-Is)
            list.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetRuleMasterList", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** sSchema 화이트리스트 검증 (Q-002) — 공란 = 기본 스키마(MCAAPUSER). */
    private static void validateSchema(String sSchema) {
        if (sSchema == null || sSchema.isBlank()) return;
        if (!SCHEMA_WHITELIST.contains(sSchema.trim().toUpperCase(Locale.ROOT))) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "[" + sSchema + "] 허용되지 않은 스키마입니다.");
        }
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }
}
