package com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleDataUploadFilePopup.dto.MasterRuleDataUploadFilePopupSaveRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.repository.MasterRuleColListRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import jakarta.persistence.Tuple;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOfTrim;

/**
 * 일반 업무기준 등록(Excel Upload) — cmb/masterRuleDataUploadFilePopup OASIS 서비스
 * (Spring bean = {@code masterRuleDataUploadFilePopupService}).
 *
 * <p>★ <b>부모 masterRuleData 의 자식 modal 팝업</b> (분석 §1.2/§5 — P-002 엑셀업로드).
 * 동적 테이블 {@code MCAAPUSER.TB_MCA_<업무기준ID>}(DDL on-demand — 가족 확정)/동적 컬럼
 * (컬럼정의 기반) 화면. action = search(다운로드용 전건)/save(Excel 일괄 등록)/searchCol(컬럼정의) 3종.
 *
 * <p><b>동적 SQL 안전화 (Q-104 — 가족 Q-007 동일 패턴)</b>:
 * 테이블명 = pRuleId 형식 검증({@code ^[A-Za-z0-9_]{1,10}$}) 후 서버 재조립(pTable 은 대조만),
 * 저장 컬럼 = 컬럼정의 메타 화이트리스트(COL_ID 식별자 형식 강제 — 2차 stored injection 차단),
 * 값 = 전부 파라미터 바인딩 (As-Is {@code ${pTable}_Mapper.*} 동적 namespace 치환 제거 — C-006/C-007).
 *
 * <p><b>save (As-Is SaveMasterRuleFileUpload.run 1:1 — 분석 §7.2)</b>:
 * pRegFlag=true 면 전건 선삭제(R-107 — As-Is WHERE 1=1) 후, GetMaxRuleSeq 채번(<b>본 화면 일원화
 * — Q-103 확정</b>, As-Is 는 부모 매퍼 namespace 호출 F-004)하여 행마다 RULE_VER="1"/RULE_SEQ=++max
 * (R-109) + DATE 컬럼 {@code -} 제거·14자 절단(R-110) + To-Be audit C_ 계열·U_ 계열 8컬럼
 * (Q-105 — As-Is 미세팅 F-006 해소, PGM_ID='masterRuleDataUploadFilePopup') 로 INSERT.
 * 1행이라도 실패 시 행 번호 포함 예외(MT-003/RC-001 — F-001 해소) → OASIS process rollback
 * (atomic — 부분 성공 없음, §7.3). 빈 업로드 + pRegFlag=true 는 전건삭제 차단(Q-102 확정 —
 * 클라 confirm 가드의 서버 이중 방어). 응답 = {@code { cnt_import }} (As-Is resultKey).
 *
 * <p>search 는 {@code SELECT * FROM {table}} 전건 (As-Is Mapper #2 — WHERE/ORDER 없음 보존),
 * searchCol 은 컬럼정의+PK판정 — 가족 공용 {@link MasterRuleColListRepository#searchRuleColDefsWithPk}
 * 재사용 (As-Is Mapper #1 과 동일 SQL — JOIN RULE_MASTER/CODE_YN/PK_YN. COL_PREC_LEN 1컬럼 초과
 * 반환은 As-Is ds_RuleColData 미선언 컬럼과 동일하게 FE 미사용 — 무해).
 *
 * <p>가이드 §6-B-1: {@code @Transactional} 미사용 — OASIS process wrap (save 는 process 단위 atomic).
 */
@Service("masterRuleDataUploadFilePopupService")
public class MasterRuleDataUploadFilePopupService {

    private static final Logger log = LoggerFactory.getLogger(MasterRuleDataUploadFilePopupService.class);

    private static final String SCHEMA = "MCAAPUSER";
    private static final Pattern RULE_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_]{1,10}$");
    /** Q-104 2차 방어 — 화이트리스트 원천(사용자 편집 가능한 컬럼정의)의 COL_ID 도 식별자 형식 강제. */
    private static final Pattern COL_ID_PATTERN = Pattern.compile("^[A-Z0-9_]{1,30}$");
    /** 동적 테이블 고정 키 컬럼 (가족 공통 pkColSet). */
    private static final String PGM_ID = "masterRuleDataUploadFilePopup";

    @PersistenceContext
    private EntityManager em;

    private final MasterRuleColListRepository colListRepository;

    public MasterRuleDataUploadFilePopupService(MasterRuleColListRepository colListRepository) {
        this.colListRepository = colListRepository;
    }

    // ────────────────────────────── searchCol ──────────────────────────────

    /**
     * action=searchCol — 컬럼정의 + PK 판정 (As-Is GetRuleColList 1:1, 분석 §6.1 — R-103 진입 자동조회).
     * 응답 = {@code { ds_GetRuleColUploadList: [11키 대문자 rows], cnt }} (As-Is resultKey 보존).
     * FE 동적 그리드(업로드/다운로드 3행 헤더) 빌드 + save 의 DATE 절단 판정에 사용.
     */
    public Map<String, Object> searchCol(MasterRuleDataUploadFilePopupSaveRequest request) {
        String ruleId = requireRuleId(request);

        List<Object[]> raw = colListRepository.searchRuleColDefsWithPk(ruleId);
        String[] keys = {"RULE_ID", "COL_SEQ", "COL_ID", "COL_NM", "COL_LEN", "COL_PREC_LEN",
                "MES_COL_ID", "CODE_YN", "PK_YN", "COL_TYPE", "IO_FLAG"};
        List<Map<String, Object>> list = new ArrayList<>(raw.size());
        for (Object[] r : raw) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 0; i < keys.length; i++) row.put(keys[i], r[i]);
            list.add(row);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetRuleColUploadList", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — 다운로드용 전건 조회 (As-Is GetMasterRuleDataPopup.run + Mapper #2 1:1 —
     * {@code SELECT * FROM {table}}, WHERE/ORDER/페이징 없음 보존, R-104).
     * 응답 = {@code { ds_GetRuleDataUploadList: [rows — 대문자 키], cnt }}.
     */
    public Map<String, Object> search(MasterRuleDataUploadFilePopupSaveRequest request) {
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);

        Query q = em.createNativeQuery("SELECT * FROM " + table, Tuple.class);
        List<Map<String, Object>> list = toRows(q);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetRuleDataUploadList", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — Excel 일괄 등록 (As-Is SaveMasterRuleFileUpload.run 1:1 안전화 직역 — 분석 §7.2).
     *
     * <p>{@code rows} = FE ds_grdUpload (Excel import 미리보기 행 — 가족 To-Be grids 계약
     * {@code grids:{rows:{rows}}}). 컬럼 화이트리스트는 클라 ds_RuleColData 를 신뢰하지 않고
     * 서버가 컬럼정의를 직접 조회해 구성 (Q-104 — As-Is 는 클라 dataset 사용).
     */
    public Map<String, Object> save(MasterRuleDataUploadFilePopupSaveRequest request, List<Map<String, Object>> rows) {
        if (rows == null) rows = List.of();
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);
        Map<String, String> typeMap = colTypeMap(ruleId);
        String userId = currentUserId();
        boolean regFlag = "true".equalsIgnoreCase(nvl(request.getPRegFlag()));

        // Q-102 확정 — 빈 업로드 + 삭제등록 = 무경고 전체삭제 방지 (클라 가드의 서버 이중 방어)
        if (regFlag && rows.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "Excel 데이터가 없습니다. 삭제등록은 업로드 데이터가 있을 때만 가능합니다.");
        }

        // R-107 — 삭제등록: 본 테이블 전건 선삭제 (As-Is MYBATIS_WHERE "1 = 1" — java:46-53)
        if (regFlag) {
            int deleted = em.createNativeQuery("DELETE FROM " + table).executeUpdate();
            log.info("[masterRuleDataUploadFilePopup] 삭제등록 — {} 전건 삭제 {}건 (R-107)", table, deleted);
        }

        // 채번 base — 본 화면 일원화 (Q-103 확정: As-Is 부모 매퍼 namespace 호출 F-004 해소. C-002 NVL→ISNULL)
        Object max = em.createNativeQuery("SELECT ISNULL(MAX(RULE_SEQ), 0) FROM " + table).getSingleResult();
        long maxRuleSeq = ((Number) max).longValue();

        int cnt = 0;
        for (int i = 0; i < rows.size(); i++) {
            maxRuleSeq++;   // R-109 — 행마다 +1 채번 (As-Is java:62)
            Map<String, Object> cols = filterCols(rows.get(i), typeMap);   // 화이트리스트 + DATE 정규화 (R-110)

            StringBuilder colSql = new StringBuilder("RULE_VER, RULE_SEQ");
            StringBuilder valSql = new StringBuilder(":ruleVer, :ruleSeq");
            Map<String, Object> binds = new LinkedHashMap<>();
            int b = 0;
            for (Map.Entry<String, Object> e : cols.entrySet()) {
                String bind = "c" + (b++);
                colSql.append(", ").append(e.getKey());
                valSql.append(", :").append(bind);
                binds.put(bind, e.getValue());
            }
            colSql.append(", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID");   // Q-105 (F-006 해소)
            valSql.append(", :auditUser, SYSDATETIME(), :auditPgm, :auditPgm, :auditUser, SYSDATETIME(), :auditPgm, :auditPgm");

            Query q = em.createNativeQuery("INSERT INTO " + table + " (" + colSql + ") VALUES (" + valSql + ")");
            q.setParameter("ruleVer", "1").setParameter("ruleSeq", maxRuleSeq);   // R-109 — RULE_VER "1" 고정
            binds.forEach(q::setParameter);
            q.setParameter("auditUser", userId).setParameter("auditPgm", PGM_ID);
            int affected = q.executeUpdate();
            if (affected <= 0) {
                // MT-003/RC-001 — 행 번호 포함 (As-Is 일반 Exception F-001 해소). 예외 → process rollback (atomic)
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, (i + 1) + "행 등록 실패 — INSERT 영향행 0");
            }
            cnt++;
        }

        log.debug("##########\tSaveMasterRuleFileUpload 저장 완료 — ruleId={}, cnt_import={}", ruleId, cnt);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_import", cnt);   // As-Is resultKey (java:84 — M-006 "{cnt_import}건 저장 되었습니다.")
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** ruleId 필수(R-101 서버 가드) + 형식 검증(Q-104 — 테이블명 조립 안전) + pTable 대조. */
    private String requireRuleId(MasterRuleDataUploadFilePopupSaveRequest request) {
        String ruleId = request == null ? null : blankToNull(request.getPRuleId());
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 ID는 필수입니다.");
        }
        ruleId = ruleId.trim().toUpperCase(Locale.ROOT);
        if (!RULE_ID_PATTERN.matcher(ruleId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + ruleId + "] 업무기준 ID 형식이 올바르지 않습니다.");
        }
        String pTable = request == null ? null : blankToNull(request.getPTable());
        if (pTable != null && !pTable.trim().equalsIgnoreCase("TB_MCA_" + ruleId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + pTable + "] 대상 테이블이 업무기준과 일치하지 않습니다.");   // Q-104
        }
        return ruleId;
    }

    /** 검증된 ruleId 로 서버가 직접 조립한 정규화 테이블명 (Q-104). */
    private String qualifiedTable(String ruleId) {
        return SCHEMA + ".TB_MCA_" + ruleId;
    }

    /** 컬럼정의 메타 — COL_ID(대문자, 식별자 형식 강제) → COL_TYPE. 비어 있으면 컬럼정의 미등록 (BUSINESS_ERROR). */
    private Map<String, String> colTypeMap(String ruleId) {
        List<Object[]> defs = colListRepository.searchRuleColDefsWithPk(ruleId);
        if (defs.isEmpty()) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                    "[" + ruleId + "] 업무기준의 컬럼정의(TB_MCA_RULE_COL_LIST)가 없습니다.");
        }
        Map<String, String> map = new LinkedHashMap<>();
        for (Object[] d : defs) {
            String colId = String.valueOf(d[2]).toUpperCase(Locale.ROOT);
            if (!COL_ID_PATTERN.matcher(colId).matches()) {
                // Q-104 2차 방어 — 컬럼정의는 화면(masterRuleFrame)에서 편집 가능하므로
                // COL_ID 자체를 식별자 형식으로 강제해야 INSERT 컬럼 조립이 안전하다.
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        "[" + colId + "] 컬럼정의 COL_ID 가 식별자 형식이 아닙니다.");
            }
            map.put(colId, strOfTrim(d[9]));   // COL_ID → COL_TYPE
        }
        return map;
    }

    /**
     * Excel 행에서 실제 컬럼만 추출 — 컬럼정의 COL_ID 화이트리스트 (As-Is 는 Excel 헤더 키 전체를
     * 신뢰 java:64-74 — Q-104 안전화). DATE 컬럼은 {@code -} 제거 후 14자 절단 (R-110 — As-Is java:69-72).
     */
    /** INSERT 고정 조립 컬럼 — 컬럼정의에 동명 COL_ID 가 등록돼도 중복 조립 차단 (R0-3 리뷰 반영 — 형제 remove 패턴 통일). */
    private static final java.util.Set<String> FIXED_COLS = java.util.Set.of(
            "RULE_VER", "RULE_SEQ",
            "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID");

    private Map<String, Object> filterCols(Map<String, Object> row, Map<String, String> typeMap) {
        Map<String, Object> cols = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            String key = e.getKey() == null ? "" : e.getKey().toUpperCase(Locale.ROOT);
            if (!typeMap.containsKey(key)) continue;   // RULE_VER/RULE_SEQ 는 서버 채번 — 행 값 미신뢰
            if (FIXED_COLS.contains(key)) continue;    // 고정 조립 컬럼과 중복 시 MSSQL 264 방지
            Object v = e.getValue();
            if ("DATE".equals(typeMap.get(key)) && v instanceof String s) {
                String norm = s.replace("-", "");   // R-110 (As-Is java:69-72)
                v = norm.length() > 14 ? norm.substring(0, 14) : norm;
            }
            cols.put(key, v);
        }
        return cols;
    }

    /** Tuple 결과 → 대문자 컬럼 키 유지 Map rows (동적 컬럼 — camelCase 변환 ✗). */
    private static List<Map<String, Object>> toRows(Query q) {
        @SuppressWarnings("unchecked")
        List<Tuple> tuples = q.getResultList();
        List<Map<String, Object>> list = new ArrayList<>(tuples.size());
        for (Tuple t : tuples) {
            Map<String, Object> row = new LinkedHashMap<>();
            t.getElements().forEach(el -> row.put(el.getAlias().toUpperCase(Locale.ROOT), t.get(el)));
            list.add(row);
        }
        return list;
    }

    /** 인증 컨텍스트 사용자 (audit — Q-105). 미인증 컨텍스트(테스트 등)는 "system". */
    private static String currentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null || auth.getName() == null ? "system" : auth.getName();
    }

    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }

    private static String nvl(String s) {
        return s == null ? "" : s.trim();
    }

}
