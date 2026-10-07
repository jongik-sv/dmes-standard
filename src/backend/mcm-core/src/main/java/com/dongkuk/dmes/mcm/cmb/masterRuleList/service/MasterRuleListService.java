package com.dongkuk.dmes.mcm.cmb.masterRuleList.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleList.dto.MasterRuleListSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.RuleMaster;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOfTrim;
import static com.dongkuk.dmes.mcm.common.util.McmValues.blankToNullTrim;

/**
 * 업무기준 목록조회 — cmb/masterRuleList OASIS 서비스 (Spring bean = {@code masterRuleListService}).
 *
 * <p>BPMN {@code masterRuleList.bpmn} 의 두 ServiceTask 진입점:
 * <ul>
 *   <li>{@link #search(MasterRuleListSearchRequest)} — action=search (분석 §6.1 GetRuleMasterList)</li>
 *   <li>{@link #save(MasterRuleListSearchRequest, List)} — action=save (분석 §7.2 SaveMasterRule.run() + 재조회)</li>
 * </ul>
 *
 * <p>As-Is {@code SaveMasterRule}(Java Wow) 의 nativeeditor_status 분기(inserted/updated) 를
 * To-Be rowStatus(C/U) 로 매핑. <b>deleted 분기 부재</b>(As-Is 보존 — 기존행 서버 삭제 없음, USE_TP 논리삭제).
 *
 * <p>중복 PK 사전체크 (BR-001/013 / As-Is java:48~54) — INSERT 전 {@code existsById} →
 * 존재 시 {@code "[{RULE_ID}] 동일한 업무기준ID가 존재합니다."} (DUPLICATE_DATA) 즉시 throw → 전체 롤백.
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용 (CGLIB proxy → OASIS 실패). OASIS
 * {@code SpringTransactionHandler} 가 BPMN process 단위로 트랜잭션 자동 wrap — save 의 rows[] 가 원자적.
 */
@Service("masterRuleListService")
public class MasterRuleListService {

    private static final Logger log = LoggerFactory.getLogger(MasterRuleListService.class);

    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final RuleMasterRepository repository;

    public MasterRuleListService(RuleMasterRepository repository) {
        this.repository = repository;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — As-Is GetRuleMasterList 1:1 (분석 §6.1).
     *
     * <p>이력행 제외 + 활성 필터(Repository) 후 12 컬럼 camelCase row 로 변환.
     * 응답 = {@code { list: [...], cnt }}. FE ds_grdMain ← list.
     */
    public Map<String, Object> search(MasterRuleListSearchRequest request) {
        if (request == null) request = new MasterRuleListSearchRequest();
        String pRuleId = blankToNullTrim(request.getPRuleId());
        String pRuleNm = blankToNullTrim(request.getPRuleNm());

        List<Object[]> raw = repository.searchRuleMasterList(pRuleId, pRuleNm);

        List<Map<String, Object>> list = new ArrayList<>(raw.size());
        for (Object[] r : raw) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleId", r[0]);                          // RULE_ID (col 2)
            row.put("oldRuleId", r[1]);                       // OLD_RULE_ID (미표시 — 필터 전용)
            row.put("ruleNm", r[2]);                          // RULE_NM (col 3)
            row.put("ruleDesc", r[3]);                        // RULE_DESC (col 4)
            row.put("ruleVer", r[4]);                         // RULE_VER (col 6)
            row.put("ruleTp", r[5]);                          // RULE_TP (미표시 — rowAdd 'A')
            row.put("ruleOwnerDeptNm", r[6]);                 // RULE_OWNER_DEPT_NM (미표시)
            row.put("ruleOwnerEmpNo", r[7]);                  // RULE_OWNER_EMP_NO (col 7 담당자)
            row.put("useTp", r[8]);                           // USE_TP (col 5 사용여부)
            row.put("creationTimestamp", formatTs(r[9]));     // CREATION_TIMESTAMP (col 8 시작일자)
            row.put("lastUpdatedObjectId", r[10]);            // LAST_UPDATED_OBJECT_ID (col 9 최종수정자)
            row.put("lastUpdateTimestamp", formatTs(r[11]));  // LAST_UPDATE_TIMESTAMP (col 10 최종수정일)
            list.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("list", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — As-Is {@code SaveMasterRule.run()} (java:20~90) JPA 직역 + 후속 재조회.
     *
     * <p>master 각 row.rowStatus 분기 (deleted 부재 — As-Is 보존):
     * <ul>
     *   <li>"C" → INSERT 7 컬럼 (RULE_ID/RULE_TP/RULE_DESC/RULE_OWNER_EMP_NO/RULE_NM/USE_TP/RULE_VER).
     *       INSERT 전 {@code existsById} 중복체크 → 존재 시 DUPLICATE_DATA 즉시 throw (As-Is java:48~54)</li>
     *   <li>"U" → UPDATE 3 컬럼 (RULE_NM/RULE_DESC/USE_TP — As-Is java:70~72)</li>
     * </ul>
     *
     * <p>RULE_ID 공란 행 → REQUIRED_VALUE (BR-005). cnt_save = 전체 송신 행수(As-Is java:82).
     * 저장 후 {@link #search(MasterRuleListSearchRequest)} 재호출(As-Is BPMN save → Task_2).
     *
     * @param request 재조회용 검색조건 (As-Is save sArgument = scanOpenerComponent(div_search))
     * @param master  ds_grdMain 변경행 (rowStatus C/U — grids.master 자동 binding)
     */
    public Map<String, Object> save(MasterRuleListSearchRequest request, List<Map<String, Object>> master) {
        if (master == null) master = List.of();

        for (int i = 0; i < master.size(); i++) {
            Map<String, Object> row = master.get(i);
            if (row == null) continue;
            String rowStatus = strOfTrim(row.get("rowStatus"));
            String ruleId = strOfTrim(row.get("ruleId"));

            // BR-005 RULE_ID 필수 (updated/inserted 행)
            if (("C".equals(rowStatus) || "U".equals(rowStatus)) && isBlank(ruleId)) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준ID는 필수입니다.");
            }
            // RULE_NM 필수 (NOT NULL) — null·공백을 함께 거른다. Oracle 은 '' 를 NULL 로 받아 저장 때 ORA-01400 으로
            // 실패하므로(oracle-1007), DB 오류 대신 업무 메시지로 먼저 막는다. 예전 MSSQL 은 '' 가 그대로 들어갔다.
            if (("C".equals(rowStatus) || "U".equals(rowStatus)) && isBlank(strOfTrim(row.get("ruleNm")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, "[" + ruleId + "] 업무기준명은 필수입니다.");
            }

            if ("C".equals(rowStatus)) {
                // INSERT — As-Is "inserted" 분기 (java:43~65)
                if (repository.existsById(ruleId)) {                                  // BR-001/013 중복체크
                    throw new BusinessException(ErrorCode.DUPLICATE_DATA,
                            "[" + ruleId + "] 동일한 업무기준ID가 존재합니다.");        // As-Is java:52 보존
                }
                RuleMaster e = new RuleMaster();
                e.setRuleId(ruleId);
                e.setRuleTp(strOfTrim(row.get("ruleTp")));
                e.setRuleDesc(strOfTrim(row.get("ruleDesc")));
                e.setRuleOwnerEmpNo(strOfTrim(row.get("ruleOwnerEmpNo")));
                e.setRuleNm(strOfTrim(row.get("ruleNm")));
                e.setUseTp(strOfTrim(row.get("useTp")));
                e.setRuleVer(defaultVer(row.get("ruleVer")));                         // As-Is INSERT '1' (xfdl:231)
                repository.save(e);
            } else if ("U".equals(rowStatus)) {
                // UPDATE — As-Is "updated" 분기 (java:67~78) — SET 3 컬럼만
                RuleMaster e = repository.findById(ruleId).orElseThrow(() ->
                        new BusinessException(ErrorCode.BUSINESS_ERROR,
                                "[" + ruleId + "] 수정 대상 업무기준이 존재하지 않습니다."));
                e.setRuleNm(strOfTrim(row.get("ruleNm")));
                e.setRuleDesc(strOfTrim(row.get("ruleDesc")));
                e.setUseTp(strOfTrim(row.get("useTp")));
                repository.save(e);
            }
            // 그 외 rowStatus(빈 문자열 등) → 변경 없음 skip
        }

        int cntSave = master.size();   // As-Is cnt_save = grdMainList.size() (전체 송신 행수, java:82)
        log.debug("##########\tSaveMasterRule 저장 완료 — cnt_save={}", cntSave);

        // 후속 재조회 — As-Is BPMN save → Task_2(Main조회) 정합
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cntSave);
        Map<String, Object> reloaded = search(request);
        out.put("list", reloaded.get("list"));
        out.put("cnt", reloaded.get("cnt"));
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    /** RULE_VER 기본값 — 공란/비숫자 시 1 (As-Is rowAdd xfdl:231). NUMBER(8,2) → BigDecimal. */
    private static BigDecimal defaultVer(Object v) {
        String s = strOfTrim(v);
        if (isBlank(s)) return BigDecimal.ONE;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return BigDecimal.ONE;
        }
    }

    /** 타임스탬프 표시 — "yyyy-MM-dd HH:mm:ss" (As-Is calendardateformat). Instant/Timestamp/LocalDateTime 혼재 처리. */
    private static String formatTs(Object v) {
        if (v == null) return null;
        LocalDateTime ldt;
        if (v instanceof Instant inst) {
            ldt = LocalDateTime.ofInstant(inst, ZoneId.systemDefault());
        } else if (v instanceof java.sql.Timestamp ts) {
            ldt = ts.toLocalDateTime();
        } else if (v instanceof LocalDateTime l) {
            ldt = l;
        } else if (v instanceof java.util.Date d) {
            ldt = LocalDateTime.ofInstant(d.toInstant(), ZoneId.systemDefault());
        } else {
            return String.valueOf(v);
        }
        return TS_FMT.format(ldt);
    }
}
