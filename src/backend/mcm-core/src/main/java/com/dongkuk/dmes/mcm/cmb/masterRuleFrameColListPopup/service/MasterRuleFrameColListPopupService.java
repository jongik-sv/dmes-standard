package com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleFrameColListPopup.dto.MasterRuleFrameColListPopupSearchRequest;
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
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOfTrim;
import static com.dongkuk.dmes.mcm.common.util.McmValues.blankToNullTrim;
import static com.dongkuk.dmes.mcm.common.util.McmValues.toIntStrict;

/**
 * 업무기준 컬럼 리스트 등록 팝업 — cmb/masterRuleFrameColListPopup OASIS 서비스
 * (Spring bean = {@code masterRuleFrameColListPopupService}).
 *
 * <p>부모 masterRuleFrame 의 P-002(기초데이터 등록) 팝업. BPMN 2 ServiceTask 진입점:
 * <ul>
 *   <li>{@link #search(MasterRuleFrameColListPopupSearchRequest)} — action=search:
 *       소스 테이블("TB_MCA_"+sRuleId)의 컬럼 메타(Oracle ALL_TAB_COLUMNS·ALL_COL_COMMENTS — 분석 §6/§11)를 컬럼 리스트 초기값으로 반환.
 *       결과가 비면 "칸 없음" 과 "사전 뷰 권한 없음" 을 구분할 수 없다(ALL_* 뷰는 권한 없는 표를 오류 없이 뺀다)</li>
 *   <li>{@link #save(MasterRuleFrameColListPopupSearchRequest, List)} — action=save:
 *       TB_MCA_RULE_COL_LIST 를 RULE_ID 기준 <b>전체 삭제 후 재등록</b> (As-Is SaveMasterRuleBaseColList 1:1,
 *       XV-001 "기존 컬럼정보 모두 삭제" 확인 후 호출됨)</li>
 * </ul>
 *
 * <p>save 반환 = {@code { savedCount }} 만 (Q-002 확정 — As-Is 미사용 dataset 제거, 성공 시 FE 가 팝업 닫기.
 * 재조회 없음 — As-Is BPMN save→End 직행 정합). OLD_COL_ID/MES_COL_ID 는 As-Is 주석(INSERT 비포함) 보존 —
 * FE 행에 해당 필드가 없어 자연히 null 저장.
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용 — OASIS process wrap 이 delete+insert 원자성 보장.
 */
@Service("masterRuleFrameColListPopupService")
public class MasterRuleFrameColListPopupService {

    private static final Logger log = LoggerFactory.getLogger(MasterRuleFrameColListPopupService.class);

    private final MasterRuleColListRepository repository;

    public MasterRuleFrameColListPopupService(MasterRuleColListRepository repository) {
        this.repository = repository;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — As-Is GetRuleColList 1:1 (분석 §6, Oracle 사전 뷰 §11.1 — oracle-1007).
     *
     * <p>응답 = {@code { ds_grdRuleCol: [...], cnt }} (As-Is resultKey 보존 — BPMN §8.3).
     * 9 컬럼 camelCase row (ruleVer '1' / ruleId / colId / colNm / colType / colLen / colPrecLen /
     * ioFlag 'OUT' / masterCodeDiv 'N' — SELECT 기본값 As-Is 보존).
     */
    public Map<String, Object> search(MasterRuleFrameColListPopupSearchRequest request) {
        if (request == null) request = new MasterRuleFrameColListPopupSearchRequest();
        String pRuleId = blankToNullTrim(request.getPRuleId());
        String pTable = blankToNullTrim(request.getPTable());
        if (pRuleId == null || pTable == null) {
            // As-Is 는 부모 가드(BR-013)로 ruleId 보장 — 서버 방어 (직접 호출 대비)
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 선택 후 진행해주세요.");
        }

        List<Object[]> raw = repository.searchSourceTableColumns(pRuleId, pTable);

        List<Map<String, Object>> list = new ArrayList<>(raw.size());
        for (Object[] r : raw) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("ruleVer", r[0]);          // '1' 고정 (As-Is Mapper:9)
            row.put("ruleId", r[1]);           // 파라미터 상수 (As-Is Mapper:10)
            row.put("colId", r[2]);            // COLUMN_NAME → 영문항목명
            row.put("colNm", r[3]);            // ALL_COL_COMMENTS.COMMENTS → 한글항목명
            row.put("colType", r[4]);          // Oracle DATA_TYPE → VARCHAR2/NUMBER/DATE 도메인 (C-002)
            row.put("colLen", r[5]);           // CHAR_LENGTH·DATA_PRECISION·DATA_LENGTH 중 첫 값 (C-003)
            row.put("colPrecLen", r[6]);       // DATA_PRECISION (C-003)
            row.put("ioFlag", r[7]);           // 'OUT' 기본 (As-Is Mapper:16)
            row.put("masterCodeDiv", r[8]);    // 'N' 기본 (As-Is Mapper:17)
            list.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_grdRuleCol", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — As-Is {@code SaveMasterRuleBaseColList.run()} (분석 §5.3) JPA 직역.
     *
     * <p>처리: ruleId 가드 → 서버 필수검증(V-003~V-007 — masterRuleFrame VAL-01 정책 정합) →
     * {@code deleteByRuleId} → 전량 재삽입 (COL_SEQ 1부터 재채번 / RULE_VER "1" 고정 —
     * As-Is Java:42~43). 반환 {@code { savedCount }} (Q-002 확정 — 재조회 없음).
     *
     * @param request 부모 전달 pRuleId (delete 기준)
     * @param rows    ds_grdRuleCol 전량 (grids.rows — 전체 재등록)
     */
    public Map<String, Object> save(MasterRuleFrameColListPopupSearchRequest request,
                                    List<Map<String, Object>> rows) {
        if (rows == null) rows = List.of();
        String ruleId = request == null ? null : blankToNullTrim(request.getPRuleId());
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 선택 후 진행해주세요.");
        }

        validateRows(rows);   // V-003~V-007 (서버 이중화 — masterRuleFrame VAL-01 정합)

        repository.deleteByRuleId(ruleId);   // As-Is Java:35 — RULE_ID 기준 전체 삭제

        List<MasterRuleColList> entities = new ArrayList<>(rows.size());
        int cnt = 0;
        for (Map<String, Object> row : rows) {
            MasterRuleColList e = new MasterRuleColList();
            e.setId(new MasterRuleColListId(ruleId, ++cnt));   // COL_SEQ 재채번 (As-Is Java:43)
            e.setRuleVer(BigDecimal.ONE);                      // RULE_VER "1" 고정 (As-Is Java:42)
            e.setColId(strOfTrim(row.get("colId")));
            e.setColNm(strOfTrim(row.get("colNm")));
            e.setIoFlag(strOfTrim(row.get("ioFlag")));
            e.setColType(strOfTrim(row.get("colType")));
            e.setColLen(toIntStrict(row.get("colLen"), "총길이"));
            e.setColPrecLen(toIntStrict(row.get("colPrecLen"), "소수점길이"));
            e.setMasterCodeDiv(strOfTrim(row.get("masterCodeDiv")));
            // OLD_COL_ID / MES_COL_ID — As-Is 주석(INSERT 비포함, Java:46/51) 보존 → 미설정(null)
            entities.add(e);
        }
        repository.saveAll(entities);
        log.debug("##########\tSaveMasterRuleBaseColList 저장 완료 — ruleId={}, savedCount={}", ruleId, cnt);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("savedCount", cnt);   // Q-002 확정 — { savedCount } 표준화
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** 행 필수검증 — V-003 COL_NM → V-004 COL_ID → V-005 MASTER_CODE_DIV → V-006 COL_TYPE → V-007 COL_LEN (기능 §6.3 순서). */
    private static void validateRows(List<Map<String, Object>> rows) {
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            if (row == null) continue;
            String pos = (i + 1) + "행: ";
            if (isBlank(strOfTrim(row.get("colNm")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "한글항목명을 입력해 주십시오.");   // V-003
            }
            if (isBlank(strOfTrim(row.get("colId")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "영문항목명을 입력해 주십시오.");   // V-004
            }
            if (isBlank(strOfTrim(row.get("masterCodeDiv")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "코드여부를 선택해 주십시오.");     // V-005
            }
            if (isBlank(strOfTrim(row.get("colType")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "유형을 선택해 주십시오.");         // V-006
            }
            if (isBlank(strOfTrim(row.get("colLen")))) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, pos + "총길이를 입력해 주십시오.");       // V-007
            }
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

}
