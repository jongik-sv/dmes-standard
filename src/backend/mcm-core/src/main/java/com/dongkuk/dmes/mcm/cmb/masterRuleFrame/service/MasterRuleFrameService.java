package com.dongkuk.dmes.mcm.cmb.masterRuleFrame.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleFrame.dto.MasterRuleFrameSearchRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.entity.MasterRuleColList;
import com.dongkuk.dmes.mcm.entity.MasterRuleColListId;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 업무기준 구조관리 — cmb/masterRuleFrame OASIS 서비스 (Spring bean = {@code masterRuleFrameService}).
 *
 * <p>BPMN {@code masterRuleFrame.bpmn} 의 두 ServiceTask 진입점:
 * <ul>
 *   <li>{@link #search(MasterRuleFrameSearchRequest)} — action=search
 *       (분석 §6.1 GetRuleColInList + GetRuleColOutList — IN/OUT 2 조회)</li>
 *   <li>{@link #save(MasterRuleFrameSearchRequest, List, List)} — action=save
 *       (분석 §7.2 SaveMasterRuleColList.run() delete-all-then-insert + 재조회)</li>
 * </ul>
 *
 * <p>저장 = <b>delete-all-then-insert</b> (BR-003, As-Is java:31~91 보존):
 * RULE_ID 단위 전체 삭제 후 IN+OUT 전량 재삽입. COL_SEQ 는 IN/OUT 통합 단일 순번 (BR-004),
 * RULE_VER 공란→"1" 보정 (BR-005). delete 반환값 미검증 (BR-015 — As-Is 검증 블록 주석 보존).
 *
 * <p>서버 필수검증 (VAL-01 — 기능 §4.5/§10.1, 시점=클라이언트+서버):
 * 각 행 COL_NM/COL_ID/MASTER_CODE_DIV/COL_TYPE/COL_LEN → REQUIRED_VALUE (MSG-001~005 문구 보존).
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용 (CGLIB proxy → OASIS 실패). OASIS
 * {@code SpringTransactionHandler} 가 BPMN process 단위로 트랜잭션 wrap — delete+insert 원자성 (BR-014).
 */
@Service("masterRuleFrameService")
public class MasterRuleFrameService {

    private static final Logger log = LoggerFactory.getLogger(MasterRuleFrameService.class);

    private static final String IO_IN = "IN";
    private static final String IO_OUT = "OUT";

    private final MasterRuleColListRepository repository;

    public MasterRuleFrameService(MasterRuleColListRepository repository) {
        this.repository = repository;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — As-Is GetRuleColInList + GetRuleColOutList 1:1 (분석 §6.1 / BPMN §3.1).
     *
     * <p>IN/OUT 각 12 컬럼 camelCase row 변환, ORDER BY COL_SEQ (BR-016).
     * 응답 = {@code { ds_GetRuleColInList: [...], ds_GetRuleColOutList: [...], cnt }}
     * (As-Is resultKey 보존 — BPMN설계서 §2.2. cnt = IN 건수, MSG-010 As-Is xfdl:382).
     */
    public Map<String, Object> search(MasterRuleFrameSearchRequest request) {
        String pRuleId = request == null ? null : blankToNull(request.getPRuleId());

        List<Map<String, Object>> inList = toRows(repository.searchRuleColList(pRuleId, IO_IN));
        List<Map<String, Object>> outList = toRows(repository.searchRuleColList(pRuleId, IO_OUT));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetRuleColInList", inList);
        out.put("ds_GetRuleColOutList", outList);
        out.put("cnt", inList.size());
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — As-Is {@code SaveMasterRuleColList.run()} (java:20~100) JPA 직역 + 후속 재조회.
     *
     * <p>처리 순서 (BPMN §4.1 / 분석 §7.2):
     * <ol>
     *   <li>ruleId 확정 — sArgument pRuleId 우선, 없으면 첫 행 ruleId (As-Is ds_grdIn[0].RULE_ID).
     *       공란 → REQUIRED_VALUE (BR-012 서버 가드)</li>
     *   <li>서버 필수검증 — IN 5종 → OUT 5종 (VAL-01, MSG-001~005 문구)</li>
     *   <li>delete-all — {@code deleteByRuleId(ruleId)} 반환값 미검증 (BR-015 As-Is 보존)</li>
     *   <li>IN insert 루프 → OUT insert 루프 — COL_SEQ 통합 순번 1부터 (BR-004),
     *       RULE_VER 공란→1 (BR-005), IO_FLAG 는 그리드 소속으로 확정 (As-Is 행추가 set 과 동치)</li>
     *   <li>cnt_save = 삽입 행수 (As-Is java:93) + 재조회 (As-Is save → Task_1j1g5cn/Task_1c4n8uv)</li>
     * </ol>
     *
     * <p>insert 실패(JPA 예외) 시 즉시 전파 → OASIS process 트랜잭션 전체 롤백 (BR-014 delete 포함).
     *
     * @param request 재조회/삭제 기준 (As-Is sArgument = pRuleId)
     * @param inList  ds_grdIn 전량 (grids.inList — 전체 송신, As-Is xfdl:363 보존)
     * @param outList ds_grdOut 전량 (grids.outList)
     */
    public Map<String, Object> save(MasterRuleFrameSearchRequest request,
                                    List<Map<String, Object>> inList,
                                    List<Map<String, Object>> outList) {
        if (inList == null) inList = List.of();
        if (outList == null) outList = List.of();

        // 1. ruleId 확정 (BR-012) — pRuleId 우선, 없으면 첫 행 RULE_ID (As-Is java:33)
        String ruleId = request == null ? null : blankToNull(request.getPRuleId());
        if (ruleId == null) ruleId = firstRuleId(inList, outList);
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 선택 후 진행해주세요.");
        }

        // 2. 서버 필수검증 (VAL-01) — IN 5종 → OUT 5종 순차 (As-Is fn_save 검증 순서 보존)
        validateRows(inList, "조건항목(IN)");
        validateRows(outList, "결과항목(OUT)");

        // 3. delete-all (BR-003) — 반환값 미검증 (BR-015 As-Is java:35~40 주석 보존)
        repository.deleteByRuleId(ruleId);

        // 4. IN → OUT 전량 재삽입 — COL_SEQ 통합 단일 순번 (BR-004, As-Is java:51/76)
        List<MasterRuleColList> entities = new ArrayList<>(inList.size() + outList.size());
        int cnt = 0;
        for (Map<String, Object> row : inList) {
            entities.add(toEntity(row, ruleId, ++cnt, IO_IN));
        }
        for (Map<String, Object> row : outList) {
            entities.add(toEntity(row, ruleId, ++cnt, IO_OUT));
        }
        repository.saveAll(entities);
        log.debug("##########\tSaveMasterRuleColList 저장 완료 — ruleId={}, cnt_save={}", ruleId, cnt);

        // 5. cnt_save + 재조회 (As-Is save → 조회 IN → 조회 OUT 합류 — BPMN §3.2)
        MasterRuleFrameSearchRequest reload = new MasterRuleFrameSearchRequest();
        reload.setPRuleId(ruleId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        out.putAll(search(reload));
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** 엔티티 → camelCase 12 컬럼 row (분석 §6.1 SELECT 컬럼 1:1). */
    private static List<Map<String, Object>> toRows(List<MasterRuleColList> entities) {
        List<Map<String, Object>> rows = new ArrayList<>(entities.size());
        for (MasterRuleColList e : entities) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleId", e.getId().getRuleId());          // RULE_ID (hidden)
            row.put("colSeq", e.getId().getColSeq());          // COL_SEQ (hidden — ORDER BY 키)
            row.put("colId", e.getColId());                    // col 2 영문항목명
            row.put("colNm", e.getColNm());                    // col 1 한글항목명
            row.put("colLen", e.getColLen());                  // col 5 총길이
            row.put("mesColId", e.getMesColId());              // MES_COL_ID (hidden)
            row.put("masterCodeDiv", e.getMasterCodeDiv());    // col 3 코드여부
            row.put("colPrecLen", e.getColPrecLen());          // col 6 소수점길이
            row.put("ioFlag", e.getIoFlag());                  // IO_FLAG (hidden)
            row.put("colType", e.getColType());                // col 4 유형
            row.put("oldColId", e.getOldColId());              // OLD_COL_ID (hidden)
            row.put("ruleVer", e.getRuleVer());                // RULE_VER (hidden)
            rows.add(row);
        }
        return rows;
    }

    /** 행 필수검증 (VAL-01) — COL_NM/COL_ID/MASTER_CODE_DIV/COL_TYPE/COL_LEN (MSG-001~005 문구 보존). */
    private static void validateRows(List<Map<String, Object>> rows, String gridLabel) {
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            if (row == null) continue;
            String pos = gridLabel + " " + (i + 1) + "행: ";
            if (isBlank(strOf(row.get("colNm")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "한글항목명을 입력해 주십시오.");   // MSG-001
            }
            if (isBlank(strOf(row.get("colId")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "영문항목명을 입력해 주십시오.");   // MSG-002
            }
            if (isBlank(strOf(row.get("masterCodeDiv")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "코드여부를 선택해 주십시오.");     // MSG-003
            }
            if (isBlank(strOf(row.get("colType")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "유형을 선택해 주십시오.");         // MSG-004
            }
            if (isBlank(strOf(row.get("colLen")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "총길이를 입력해 주십시오.");       // MSG-005
            }
        }
    }

    /** row Map → 엔티티 (As-Is insert entrySet 전체 — java:46~56. IO_FLAG 는 그리드 소속 확정). */
    private static MasterRuleColList toEntity(Map<String, Object> row, String ruleId, int colSeq, String ioFlag) {
        MasterRuleColList e = new MasterRuleColList();
        e.setId(new MasterRuleColListId(ruleId, colSeq));      // COL_SEQ 재계산 (BR-004)
        e.setRuleVer(defaultVer(row.get("ruleVer")));          // 공란→1 (BR-005, As-Is java:53~55)
        e.setColId(strOf(row.get("colId")));
        e.setColNm(strOf(row.get("colNm")));
        e.setOldColId(strOf(row.get("oldColId")));
        e.setIoFlag(ioFlag);
        e.setColType(strOf(row.get("colType")));
        e.setColLen(toInt(row.get("colLen"), "총길이"));
        e.setColPrecLen(toInt(row.get("colPrecLen"), "소수점길이"));
        e.setMesColId(strOf(row.get("mesColId")));
        e.setMasterCodeDiv(strOf(row.get("masterCodeDiv")));
        return e;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s.trim();
    }

    private static String strOf(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }

    /** IN 우선 첫 행 ruleId (As-Is ds_grdIn[0].RULE_ID — java:33. IN 공백이면 OUT 첫 행). */
    private static String firstRuleId(List<Map<String, Object>> inList, List<Map<String, Object>> outList) {
        for (List<Map<String, Object>> rows : List.of(inList, outList)) {
            for (Map<String, Object> row : rows) {
                if (row == null) continue;
                String v = blankToNull(strOf(row.get("ruleId")));
                if (v != null) return v;
            }
        }
        return null;
    }

    /** RULE_VER 공란→1 보정 (BR-005). NUMBER(8,2) → BigDecimal. */
    private static BigDecimal defaultVer(Object v) {
        String s = strOf(v);
        if (isBlank(s)) return BigDecimal.ONE;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return BigDecimal.ONE;
        }
    }

    /** 정수 변환 (BR-009 — mask integer). 공란 → null (colPrecLen 선택 입력 BR-007). */
    private static Integer toInt(Object v, String label) {
        String s = strOf(v);
        if (isBlank(s)) return null;
        try {
            return Integer.valueOf(s.replace(",", ""));       // As-Is mask ##,##9 콤마 허용
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, label + "은(는) 정수만 입력 가능합니다.");
        }
    }
}
