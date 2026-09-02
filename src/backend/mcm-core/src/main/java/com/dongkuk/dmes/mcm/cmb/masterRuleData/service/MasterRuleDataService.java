package com.dongkuk.dmes.mcm.cmb.masterRuleData.service;

import com.dongkuk.dmes.mcm.cmb.masterRuleData.dto.MasterRuleDataSearchRequest;
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
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 업무기준 Data관리 — cmb/masterRuleData OASIS 서비스 (Spring bean = {@code masterRuleDataService}).
 *
 * <p>★ <b>동적 테이블/동적 컬럼 화면</b> (분석 §0) — 조회/저장 대상 테이블 {@code MCAAPUSER.TB_MCA_<업무기준ID>}
 * 가 런타임 결정되고(DDL on-demand — Q-001b 확정: 테이블 인스턴스는 외부 생성, 본 화면은 접근만),
 * 그리드 컬럼도 컬럼정의(TB_MCA_RULE_COL_LIST) 기반 가변. 표준 Entity 매핑이 불가하여
 * {@link EntityManager} native SQL 로 접근한다.
 *
 * <p><b>동적 SQL 안전화 (Q-007 확정 — As-Is {@code $&#123;&#125;} 문자열 치환의 injection 표면 제거)</b>:
 * <ul>
 *   <li>테이블명 — pRuleId 형식 검증({@code ^[A-Za-z0-9_]{1,10}$}, sheet135 VARCHAR(10)) 후 서버가
 *       {@code TB_MCA_<RULE_ID>} 직접 조립. FE 전달 pTable 은 신뢰하지 않고 대조만</li>
 *   <li>조건 컬럼(pWhereN) — 해당 업무기준의 <b>컬럼정의 메타 화이트리스트</b>(COL_ID 집합 + RULE_VER/RULE_SEQ)</li>
 *   <li>연산자(pOperatorN) — {@code LIKE / = / <= / >=} 화이트리스트 (As-Is 콤보 LoV 1:1)</li>
 *   <li>값(pValN)·저장 셀 값 — 전부 <b>파라미터 바인딩</b> (문자열 치환 ✗)</li>
 * </ul>
 *
 * <p>BPMN 4 action: search(5조건+페이징 — BR-015) / lov(컬럼정의+PK판정) / save(C·U·D 분기 + RULE_SEQ
 * 채번 BR-010 + RULE_SEQ WHERE BR-011 + audit BR-014) / searchExport(전건). save 후 재조회 동봉
 * (As-Is BPMN save→Main조회). 긴급적용(pOption=Y — Q-008)은 To-Be 에서 안전화된 단일 native 경로로
 * 수렴 — As-Is 의 "Mapper 미경유 직접실행" 과 실행 형태가 동일해져 분기는 로그로만 보존.
 *
 * <p>audit (Q-006 확정): 동적 테이블 audit = McmAuditEntity 체계(C_USR_ID/C_AT/C_SVC_ID/C_PGM_ID +
 * U_* 4 + VER) 를 native 로 세팅. 프로그램ID = {@code "masterRuleData"} (To-Be serviceId 규칙).
 *
 * <p>As-Is 보존: 영향행 ≤ 0 시 예외 미발생 — 로그만 (BR-013 비고 / VAL-06). VARCHAR2 UPPER 검색(BR-008),
 * DATE 14자 절단(BR-009). 가이드 §6-B-1: {@code @Transactional} 미사용 — OASIS process wrap.
 */
@Service("masterRuleDataService")
public class MasterRuleDataService {

    private static final Logger log = LoggerFactory.getLogger(MasterRuleDataService.class);

    private static final String SCHEMA = "MCAAPUSER";
    private static final Pattern RULE_ID_PATTERN = Pattern.compile("^[A-Za-z0-9_]{1,10}$");
    /** Q-007 2차 방어 — 화이트리스트 원천(사용자 편집 가능한 컬럼정의)의 COL_ID 도 식별자 형식 강제. */
    private static final Pattern COL_ID_PATTERN = Pattern.compile("^[A-Z0-9_]{1,30}$");
    private static final Set<String> OPERATOR_WHITELIST = Set.of("LIKE", "=", "<=", ">=");
    /** 동적 테이블 고정 키 컬럼 (As-Is pkColSet — java:29). */
    private static final Set<String> PK_COL_SET = Set.of("RULE_VER", "RULE_SEQ");
    /** To-Be audit 컬럼 (Q-006 — McmAuditEntity 체계 native 세팅). */
    private static final String PGM_ID = "masterRuleData";

    @PersistenceContext
    private EntityManager em;

    private final MasterRuleColListRepository colListRepository;

    public MasterRuleDataService(MasterRuleColListRepository colListRepository) {
        this.colListRepository = colListRepository;
    }

    // ────────────────────────────── lov ──────────────────────────────

    /**
     * action=lov — 컬럼정의 + PK 판정 (As-Is GetRuleColList 1:1, 분석 §6.1 #1).
     * 응답 = {@code { ds_GetRuleColList: [11키 대문자 rows], cnt }} (As-Is resultKey 보존).
     * 컬럼 키는 동적 그리드 bind 키로 쓰이므로 <b>대문자 유지</b> (camelCase 변환 ✗).
     */
    public Map<String, Object> lov(MasterRuleDataSearchRequest request) {
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
        out.put("ds_GetRuleColList", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── search ──────────────────────────────

    /**
     * action=search — 동적 테이블 페이징 조회 (As-Is GetMasterRuleData.run() + GetMasterRuleDataList #2).
     *
     * <p>CTE + ROW_NUMBER(ORDER BY RULE_SEQ) + BETWEEN 페이징 (As-Is 구조 보존 — MSSQL 호환, BR-015).
     * 5조건 동적 WHERE 는 화이트리스트 컬럼/연산자 + 바인딩 값 (Q-007). VARCHAR2 컬럼이면
     * {@code UPPER(col) op UPPER(:v)} (BR-008 — As-Is java:54~77).
     * 응답 = {@code { ds_GetMasterRuleData: [rows — 대문자 키 + SEQ/TOTALCOUNT], cnt, totalCount }}.
     */
    public Map<String, Object> search(MasterRuleDataSearchRequest request) {
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);
        Map<String, String> typeMap = colTypeMap(ruleId);

        StringBuilder where = new StringBuilder();
        Map<String, String> binds = new LinkedHashMap<>();
        for (int n = 1; n <= 5; n++) {
            String col = blankToNull(request.where(n));
            if (col == null) continue;   // 미입력 조건 skip (As-Is if)
            col = col.trim().toUpperCase(Locale.ROOT);
            if (!typeMap.containsKey(col) && !PK_COL_SET.contains(col)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + col + "] 허용되지 않은 조건 컬럼입니다.");   // Q-007
            }
            String op = blankToNull(request.operator(n));
            op = op == null ? "LIKE" : op.trim().toUpperCase(Locale.ROOT);
            if (!OPERATOR_WHITELIST.contains(op)) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + op + "] 허용되지 않은 연산자입니다.");     // Q-007
            }
            String bind = "v" + n;
            if ("VARCHAR2".equals(typeMap.get(col))) {
                where.append(" AND UPPER(").append(col).append(") ").append(op).append(" UPPER(:").append(bind).append(")");   // BR-008
            } else {
                where.append(" AND ").append(col).append(" ").append(op).append(" :").append(bind);
            }
            binds.put(bind, nvl(request.val(n)));
        }

        int pageRow = request.getCountPerPage() == null || request.getCountPerPage() <= 0 ? 30 : request.getCountPerPage();
        int pageNum = request.getCurrentPage() == null || request.getCurrentPage() <= 0 ? 1 : request.getCurrentPage();

        String sql = "WITH TB1 AS (SELECT ROW_NUMBER() OVER(ORDER BY RULE_SEQ) AS SEQ, T.* FROM " + table + " T WHERE 1=1" + where + ") "
                + "SELECT (SELECT COUNT(*) FROM TB1) AS TOTALCOUNT, TB1.* FROM TB1 "
                + "WHERE SEQ BETWEEN ((:pageNum-1)*:pageRow)+1 AND (:pageNum*:pageRow) ORDER BY SEQ";
        Query q = em.createNativeQuery(sql, Tuple.class);
        binds.forEach(q::setParameter);
        q.setParameter("pageNum", pageNum);
        q.setParameter("pageRow", pageRow);

        List<Map<String, Object>> list = toRows(q);
        long totalCount;
        if (!list.isEmpty()) {
            totalCount = ((Number) list.get(0).get("TOTALCOUNT")).longValue();
        } else if (pageNum > 1) {
            // 범위 밖 페이지(마지막 페이지 전량 삭제 후 재조회 등) — 빈 결과여도 실제 건수로 보정
            Query cq = em.createNativeQuery("SELECT COUNT(*) FROM " + table + " T WHERE 1=1" + where);
            binds.forEach(cq::setParameter);
            totalCount = ((Number) cq.getSingleResult()).longValue();
        } else {
            totalCount = 0L;
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetMasterRuleData", list);
        out.put("cnt", list.size());
        out.put("totalCount", totalCount);
        return out;
    }

    // ────────────────────────────── save ──────────────────────────────

    /**
     * action=save — As-Is SaveMasterRuleData.run() (분석 §7.2) 안전화 직역.
     *
     * <p>행 rowStatus: "U"(updated)/"D"(deleted)/"C"(inserted — As-Is nativeeditor_status 3종 매핑).
     * U/D 는 {@code WHERE RULE_SEQ = :seq} (BR-011 — PK 컬럼도 수정 허용), C 는 GetMaxRuleSeq 채번 후
     * RULE_SEQ=+n / RULE_VER='1' (BR-010). 셀 컬럼은 filterKeyByColId 등가 — 컬럼정의 COL_ID 집합 +
     * RULE_VER/RULE_SEQ 만 반영 (BR-012). DATE 14자 절단 (BR-009). audit native 세팅 (BR-014/Q-006).
     * 영향행 ≤ 0 → 로그만 (As-Is 보존 — VAL-06). 응답 = {@code { cnt_save, ds_GetMasterRuleData, ... }}
     * (BPMN save→Main조회 재조회 동봉).
     */
    public Map<String, Object> save(MasterRuleDataSearchRequest request, List<Map<String, Object>> rows) {
        if (rows == null) rows = List.of();
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);
        Map<String, String> typeMap = colTypeMap(ruleId);
        String userId = currentUserId();
        boolean urgent = "Y".equalsIgnoreCase(nvl(request.getPOption()));
        if (urgent) {
            // Q-008 — As-Is DynamicSqlExecutor 직접실행 분기. To-Be 는 안전화된 단일 native 경로로 수렴 — 로그 보존.
            log.info("[masterRuleData] 긴급적용(pOption=Y) 저장 — 안전화 native 경로 (As-Is DynamicSqlExecutor 등가)");
        }

        int cnt = 0;

        // 루프 #1 — updated / deleted (As-Is java:63~134)
        for (Map<String, Object> row : rows) {
            String status = nvl(strOf(row.get("rowStatus")));
            if ("U".equals(status)) {
                Map<String, Object> cols = filterCols(row, typeMap);
                Object seq = row.get("RULE_SEQ");
                requireSeq(seq);
                StringBuilder set = new StringBuilder();
                int i = 0;
                Map<String, Object> binds = new LinkedHashMap<>();
                for (Map.Entry<String, Object> e : cols.entrySet()) {
                    if (PK_COL_SET.contains(e.getKey())) continue;   // 키 컬럼은 SET 제외 (WHERE 로만)
                    if (!set.isEmpty()) set.append(", ");
                    String bind = "c" + (i++);
                    set.append(e.getKey()).append(" = :").append(bind);
                    binds.put(bind, e.getValue());
                }
                set.append(set.isEmpty() ? "" : ", ").append("U_USR_ID = :auditUser, U_AT = SYSDATETIME(), U_SVC_ID = :auditPgm, U_PGM_ID = :auditPgm");
                Query q = em.createNativeQuery("UPDATE " + table + " SET " + set + " WHERE RULE_SEQ = :seq");
                binds.forEach(q::setParameter);
                q.setParameter("auditUser", userId).setParameter("auditPgm", PGM_ID).setParameter("seq", seq);
                int affected = q.executeUpdate();
                if (affected <= 0) log.debug("[masterRuleData] update 영향행 0 — RULE_SEQ={} (As-Is 보존: 예외 미발생)", seq);
                cnt++;
            } else if ("D".equals(status)) {
                Object seq = row.get("RULE_SEQ");
                requireSeq(seq);
                int affected = em.createNativeQuery("DELETE FROM " + table + " WHERE RULE_SEQ = :seq")
                        .setParameter("seq", seq).executeUpdate();
                if (affected <= 0) log.debug("[masterRuleData] delete 영향행 0 — RULE_SEQ={} (As-Is 보존)", seq);
                cnt++;
            }
        }

        // 루프 #2 — inserted (채번 후 — As-Is java:136~181)
        long maxSeq = -1;
        for (Map<String, Object> row : rows) {
            if (!"C".equals(nvl(strOf(row.get("rowStatus"))))) continue;
            if (maxSeq < 0) {
                Object max = em.createNativeQuery("SELECT ISNULL(MAX(RULE_SEQ), 0) FROM " + table).getSingleResult();   // #4 GetMaxRuleSeq
                maxSeq = ((Number) max).longValue();
            }
            maxSeq++;
            Map<String, Object> cols = filterCols(row, typeMap);
            cols.remove("RULE_SEQ");
            cols.remove("RULE_VER");
            StringBuilder colSql = new StringBuilder("RULE_VER, RULE_SEQ");
            StringBuilder valSql = new StringBuilder(":ruleVer, :ruleSeq");
            Map<String, Object> binds = new LinkedHashMap<>();
            int i = 0;
            for (Map.Entry<String, Object> e : cols.entrySet()) {
                String bind = "c" + (i++);
                colSql.append(", ").append(e.getKey());
                valSql.append(", :").append(bind);
                binds.put(bind, e.getValue());
            }
            colSql.append(", C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID");
            valSql.append(", :auditUser, SYSDATETIME(), :auditPgm, :auditPgm, :auditUser, SYSDATETIME(), :auditPgm, :auditPgm");
            Query q = em.createNativeQuery("INSERT INTO " + table + " (" + colSql + ") VALUES (" + valSql + ")");
            q.setParameter("ruleVer", "1").setParameter("ruleSeq", maxSeq);   // BR-010
            binds.forEach(q::setParameter);
            q.setParameter("auditUser", userId).setParameter("auditPgm", PGM_ID);
            int affected = q.executeUpdate();
            if (affected <= 0) log.debug("[masterRuleData] insert 영향행 0 — RULE_SEQ={} (As-Is 보존)", maxSeq);
            cnt++;
        }

        log.debug("##########\tSaveMasterRuleData 저장 완료 — ruleId={}, cnt_save={}", ruleId, cnt);

        // 재조회 동봉 (As-Is BPMN save → UserTask_067lppc Main 조회)
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        out.putAll(search(request));
        return out;
    }

    // ────────────────────────────── search_export ──────────────────────────────

    /**
     * action=searchExport — 전건 조회 (As-Is GetMasterRuleDataExport #3 — 페이징 없음, ORDER BY RULE_SEQ).
     * 응답 = {@code { ds_GetMasterRuleDataExport: [...], cnt }} (As-Is resultKey 보존, MSG-012).
     */
    public Map<String, Object> searchExport(MasterRuleDataSearchRequest request) {
        String ruleId = requireRuleId(request);
        String table = qualifiedTable(ruleId);

        Query q = em.createNativeQuery("SELECT * FROM " + table + " ORDER BY RULE_SEQ", Tuple.class);
        List<Map<String, Object>> list = toRows(q);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetMasterRuleDataExport", list);
        out.put("cnt", list.size());
        return out;
    }

    // ────────────────────────────── helpers ──────────────────────────────

    /** ruleId 필수(BR-001 서버 가드) + 형식 검증(Q-007 — 테이블명 조립 안전) + pTable 대조. */
    private String requireRuleId(MasterRuleDataSearchRequest request) {
        String ruleId = request == null ? null : blankToNull(request.getPRuleId());
        if (ruleId == null) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "업무기준 ID는 필수입니다.");   // MSG-001
        }
        ruleId = ruleId.trim().toUpperCase(Locale.ROOT);
        if (!RULE_ID_PATTERN.matcher(ruleId).matches()) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + ruleId + "] 업무기준 ID 형식이 올바르지 않습니다.");
        }
        String pTable = request == null ? null : blankToNull(request.getPTable());
        if (pTable != null && !pTable.trim().equalsIgnoreCase("TB_MCA_" + ruleId)) {
            throw new BusinessException(ErrorCode.INVALID_VALUE, "[" + pTable + "] 대상 테이블이 업무기준과 일치하지 않습니다.");   // Q-007
        }
        return ruleId;
    }

    /** 검증된 ruleId 로 서버가 직접 조립한 정규화 테이블명 (Q-007). */
    private String qualifiedTable(String ruleId) {
        return SCHEMA + ".TB_MCA_" + ruleId;
    }

    /** 컬럼정의 메타 — COL_ID(대문자) → COL_TYPE. 비어 있으면 컬럼정의 미등록 업무기준 (BUSINESS_ERROR). */
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
                // Q-007 2차 방어 — 컬럼정의는 화면(masterRuleFrame)에서 편집 가능하므로
                // COL_ID 자체를 식별자 형식으로 강제해야 WHERE/SET/INSERT 조립이 안전하다.
                throw new BusinessException(ErrorCode.INVALID_VALUE,
                        "[" + colId + "] 컬럼정의 COL_ID 가 식별자 형식이 아닙니다.");
            }
            map.put(colId, strOf(d[9]));   // COL_ID → COL_TYPE
        }
        return map;
    }

    /**
     * 행에서 실제 컬럼만 추출 (As-Is filterKeyByColId 등가 — BR-012):
     * 컬럼정의 COL_ID 집합 + RULE_VER/RULE_SEQ 만. DATE 컬럼 14자 절단 (BR-009).
     */
    private Map<String, Object> filterCols(Map<String, Object> row, Map<String, String> typeMap) {
        Map<String, Object> cols = new LinkedHashMap<>();
        Set<String> allowed = new LinkedHashSet<>(typeMap.keySet());
        allowed.addAll(PK_COL_SET);
        for (Map.Entry<String, Object> e : row.entrySet()) {
            String key = e.getKey() == null ? "" : e.getKey().toUpperCase(Locale.ROOT);
            if (!allowed.contains(key)) continue;
            Object v = e.getValue();
            if ("DATE".equals(typeMap.get(key)) && v instanceof String s && s.length() > 14) {
                v = s.substring(0, 14);   // BR-009 (As-Is java:77)
            }
            cols.put(key, v);
        }
        return cols;
    }

    /** U/D 행의 RULE_SEQ 필수 (BR-011 WHERE 키). */
    private static void requireSeq(Object seq) {
        if (seq == null || String.valueOf(seq).isBlank()) {
            throw new BusinessException(ErrorCode.REQUIRED_VALUE, "RULE_SEQ 가 없는 행은 수정/삭제할 수 없습니다.");
        }
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

    /** 인증 컨텍스트 사용자 (audit — Q-006). 미인증 컨텍스트(테스트 등)는 "system". */
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

    private static String strOf(Object o) {
        return o == null ? null : String.valueOf(o).trim();
    }
}
