package com.dongkuk.dmes.mcm.cme.masterCodeMngList.service;

import com.dongkuk.dmes.mcm.cme.masterCodeMngList.dto.MasterCodeMngListDetailSearchRequest;
import com.dongkuk.dmes.mcm.cme.masterCodeMngList.dto.MasterCodeMngListSearchRequest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Master Code 상세조회 (masterCodeMngList) — OASIS BPMN serviceTask entry point.
 *
 * <p>Spring bean name {@code masterCodeMngListService} =&gt; BPMN
 * {@code <camunda:class>masterCodeMngListService</camunda:class>}.
 *
 * <p>본 화면은 ASIS {@code cma} 그룹의 read-only 뷰로 To-Be {@code cme} (Master/업무기준(가동))
 *  그룹에 분류된다. cma {@code masterCodeMng} 화면의 등록/수정/삭제를 배제한 SELECT 전용.
 *
 * <p><b>schema 결정 (2026-05-29 정정, 본 화면 2026-06-01 fix)</b>:
 *  본 화면은 분석리포트 §6/§11.2 의 결정에 따라 운영 read 동기화본 {@code MCMAPUSER} schema
 *  를 native query 로 직접 조회한다. {@link com.dongkuk.dmes.mcm.entity.MasterCode}
 *  {@link com.dongkuk.dmes.mcm.entity.MasterCodeDetail}
 *  {@link com.dongkuk.dmes.mcm.entity.MasterCodeCategory} entity 의 {@code @Table schema}
 *  는 원장 {@code MCM_SOURCE} 로 유지 (cma 등록 화면이 정본 owner) — 본 Service 의 native query
 *  schema 명시로만 분기한다. {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 패턴을 사용하는 cma
 *  {@code MasterCodeSelPopService} 와 동일 사상 (운영 read 정합 source 는 MCMAPUSER).
 *
 * <p>분석리포트 §6 의 4 SQL 중 3 SQL 만 활성 (As-Is BPMN/xfdl 호출분):
 * <ol>
 *   <li>{@code GetCodeMasterList}        → {@code MCMAPUSER.TB_MCM_CODE_MASTER} native query</li>
 *   <li>{@code GetCodeDetailList}        → {@code MCMAPUSER.TB_MCM_CODE_DETAIL} native query +
 *       service 측 nested scalar subquery (Ref1~5 _MN alias) 조립</li>
 *   <li>{@code GetTbMcmCodeCategoryList} → {@code MCMAPUSER.TB_MCM_CODE_CATEGORY} native query</li>
 * </ol>
 *
 * <p>To-Be 제거 SQL: {@code GetCodeMasterAllList} — As-Is BPMN/xfdl 미호출 (분석 §6 #2 / §12).
 *
 * <p>본 화면 SELECT 전용 — audit 컬럼 자동 채움 영향 ✗.
 *
 * <p>BPMN: {@code services/cme/masterCodeMngList.bpmn} — 2 action (search / searchDetail).
 */
@Service("masterCodeMngListService")
public class MasterCodeMngListService {

    /** Ref1~5 nested scalar subquery 의 As-Is 하드코딩 — xml:64/71/78/85/92. */
    private static final String REF_SCALAR_CATEGORY_ID = "SZ0000";

    /** 운영 read 동기화본 schema (분석리포트 §11.2 / §F.1 C-003 정본). */
    private static final String READ_SCHEMA = "MCMAPUSER";

    @PersistenceContext
    private EntityManager em;

    // ────────────────────────────────────────────────────────────────
    // action: search — Master 그리드 조회 (GetCodeMasterList 1 SQL)
    // BPMN flow: Start → Gateway → Task_2 → End  (분석 §8.3)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code search} 진입점. As-Is BPMN Task_2 (GetCodeMasterList) 1:1 변환.
     *
     * <p>21 컬럼 row 조립:
     *  CODE_ID, CODE_NM, CODE_DESC, CODE_VER, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE,
     *  CODE_OWNER_DEPT_NM, CODE_OWNER_EMP_NO, CODE_CHARACTER, MASTER_CODE,
     *  MASTER_CODE_REF1~5, MASTER_CODE_REF1_NM~5_NM (scalar subquery 결과 — service 측 lookup 조립).
     *
     * <p>응답 key: {@code ds_GetCodeMasterList} (As-Is xfdl:296 sOutDatasets 와 1:1).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> search(MasterCodeMngListSearchRequest request) {
        String pCodeId = request != null ? request.getPCodeId() : null;
        String pCodeNm = request != null ? request.getPCodeNm() : null;

        // As-Is Mapper.xml `GetCodeMasterList` 등가 — MCMAPUSER schema 명시 (분석 §F.1 C-003).
        // MSSQL 친화 LIKE binding ('%' + :param + '%') — Oracle '||' (분석 §11.1 C-001) 회피.
        String sql = "SELECT CODE_ID, CODE_NM, CODE_DESC, CODE_VER, USE_TP, "
                + "START_ACTIVE_DATE, END_ACTIVE_DATE, "
                + "CODE_OWNER_DEPT_NM, CODE_OWNER_EMP_NO, CODE_CHARACTER, MASTER_CODE, "
                + "MASTER_CODE_REF1, MASTER_CODE_REF2, MASTER_CODE_REF3, "
                + "MASTER_CODE_REF4, MASTER_CODE_REF5 "
                + "FROM " + READ_SCHEMA + ".TB_MCM_CODE_MASTER "
                + "WHERE (:pCodeIdEmpty = 1 "
                + "       OR CODE_ID LIKE :pCodeIdLike "
                + "       OR MASTER_CODE LIKE :pCodeIdLike) "
                + "  AND (:pCodeNmEmpty = 1 "
                + "       OR UPPER(CODE_NM) LIKE UPPER(:pCodeNmLike)) "
                + "ORDER BY CODE_ID";

        Query query = em.createNativeQuery(sql);
        boolean codeIdEmpty = pCodeId == null || pCodeId.isEmpty();
        boolean codeNmEmpty = pCodeNm == null || pCodeNm.isEmpty();
        query.setParameter("pCodeIdEmpty", codeIdEmpty ? 1 : 0);
        query.setParameter("pCodeIdLike", codeIdEmpty ? "" : "%" + pCodeId + "%");
        query.setParameter("pCodeNmEmpty", codeNmEmpty ? 1 : 0);
        query.setParameter("pCodeNmLike", codeNmEmpty ? "" : "%" + pCodeNm + "%");

        List<Object[]> rawRows = (List<Object[]>) query.getResultList();

        // MASTER_CODE_REF1~5_NM scalar subquery — service 측 batch lookup
        // (각 행마다 별도 SELECT 회피 위해 사용된 모든 REF ID 를 1회로 모아 native lookup).
        Map<String, String> codeIdToNmMap = buildRefCodeNmMap(rawRows);

        List<Map<String, Object>> masterRows = new ArrayList<>(rawRows.size());
        for (Object[] r : rawRows) {
            masterRows.add(toMasterRow(r, codeIdToNmMap));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetCodeMasterList", masterRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchDetail — Category LoV + Detail + Ref1~5 _MN alias 조립
    // BPMN flow: Start → Gateway → Task_0zyza07 → Task_1uvph9e → End  (분석 §8.3)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchDetail} 진입점. As-Is BPMN
     *  Task_0zyza07 (GetTbMcmCodeCategoryList) → Task_1uvph9e (GetCodeDetailList) 1:1 변환.
     *
     * <p>Detail 응답 14 컬럼 (분석 §9.2):
     *  MASTER_CODE, CATEGORY_ID, CATEGORY_NM(scalar subquery), SORT_SEQ, MASTER_CODE(중복, As-Is 보존),
     *  CODE_VAL, CODE_VAL_MEAN, CODE_VAL_DESC, CODE_VER, CODE_VAL_REF1_MN~5_MN
     *  (nested scalar subquery + NVL fallback — null 시 원본 CODE_VAL_REF{N} 값).
     *
     * <p>응답 key:
     *  - {@code ds_GetCodeDetailList}        (xfdl:308 sOutDatasets)
     *  - {@code ds_GetTbMcmCodeCategoryList} (동일)
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchDetail(MasterCodeMngListDetailSearchRequest request) {
        if (request == null || request.getPCodeId() == null || request.getPCodeId().isBlank()) {
            // 빈 파라미터 — 빈 응답 (As-Is xfdl 의 ds_grdDetail.clearData() 와 정합)
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("ds_GetTbMcmCodeCategoryList", List.of());
            empty.put("ds_GetCodeDetailList", List.of());
            return empty;
        }
        String pCodeId = request.getPCodeId();

        // 1) Task_0zyza07 — Category LoV (MCMAPUSER.TB_MCM_CODE_CATEGORY)
        String categorySql = "SELECT MASTER_CODE, CATEGORY_ID, CATEGORY_NM "
                + "FROM " + READ_SCHEMA + ".TB_MCM_CODE_CATEGORY "
                + "WHERE MASTER_CODE = :pCodeId";
        List<Object[]> categoryRows = (List<Object[]>) em.createNativeQuery(categorySql)
                .setParameter("pCodeId", pCodeId)
                .getResultList();

        // 2) Task_1uvph9e — Detail 본 컬럼 (MCMAPUSER.TB_MCM_CODE_DETAIL)
        // 분석 §9.2 컬럼 카탈로그 (PK 3 + 일반 11 — 본 화면 SELECT 노출분)
        String detailSql = "SELECT MASTER_CODE, CATEGORY_ID, CODE_VAL, "
                + "CODE_VAL_MEAN, CODE_VAL_DESC, CODE_VER, SORT_SEQ, "
                + "CODE_VAL_REF1, CODE_VAL_REF2, CODE_VAL_REF3, "
                + "CODE_VAL_REF4, CODE_VAL_REF5 "
                + "FROM " + READ_SCHEMA + ".TB_MCM_CODE_DETAIL "
                + "WHERE MASTER_CODE = :pCodeId "
                + "ORDER BY CATEGORY_ID, SORT_SEQ, CODE_VAL";
        List<Object[]> detailRows = (List<Object[]>) em.createNativeQuery(detailSql)
                .setParameter("pCodeId", pCodeId)
                .getResultList();

        // 3) CATEGORY_NM scalar subquery (xml:49~52) — Category map 으로 lookup
        Map<String, String> categoryNmMap = new HashMap<>();
        for (Object[] c : categoryRows) {
            // [0]=MASTER_CODE, [1]=CATEGORY_ID, [2]=CATEGORY_NM
            String cid = asString(c[1]);
            String cnm = asString(c[2]);
            categoryNmMap.put(cid, cnm);
        }

        // 4) Ref1~5 _MN alias nested scalar subquery (xml:59~94) — pCodeIdRef{N} → MAST.MASTER_CODE
        //    조회 후 그 MASTER_CODE + CATEGORY_ID='SZ0000' + CODE_VAL = CDETAIL.CODE_VAL_REF{N} 매칭
        //    SUB.CODE_VAL_MEAN 반환. null 시 CDETAIL.CODE_VAL_REF{N} fallback.
        String[] refCodeIds = new String[] {
                request.getPCodeIdRef1(), request.getPCodeIdRef2(), request.getPCodeIdRef3(),
                request.getPCodeIdRef4(), request.getPCodeIdRef5()
        };
        // 각 ref slot 별 (CODE_VAL → CODE_VAL_MEAN) lookup map
        Map<String, String>[] refValueMeanMaps = new Map[5];
        for (int i = 0; i < 5; i++) {
            refValueMeanMaps[i] = buildRefValueMeanMap(refCodeIds[i]);
        }

        List<Map<String, Object>> detailRowMaps = new ArrayList<>(detailRows.size());
        for (Object[] d : detailRows) {
            detailRowMaps.add(toDetailRow(d, categoryNmMap, refValueMeanMaps));
        }

        List<Map<String, Object>> categoryRowMaps = new ArrayList<>(categoryRows.size());
        for (Object[] c : categoryRows) {
            categoryRowMaps.add(toCategoryRow(c));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_GetTbMcmCodeCategoryList", categoryRowMaps);
        out.put("ds_GetCodeDetailList", detailRowMaps);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — native Object[] → SNAKE_CASE Map
    // As-Is Mapper SELECT 결과 컬럼명 보존
    // ────────────────────────────────────────────────────────────────

    /**
     * Master 그리드 row 조립 (21 컬럼) — 분석 §9.1 / xml:7~39.
     * MASTER_CODE_REF1~5_NM 은 scalar subquery 결과 (codeIdToNmMap 으로 lookup).
     *
     * <p>native Object[] index — search() native SQL SELECT 절 순서:
     *  0=CODE_ID, 1=CODE_NM, 2=CODE_DESC, 3=CODE_VER, 4=USE_TP,
     *  5=START_ACTIVE_DATE, 6=END_ACTIVE_DATE,
     *  7=CODE_OWNER_DEPT_NM, 8=CODE_OWNER_EMP_NO, 9=CODE_CHARACTER, 10=MASTER_CODE,
     *  11=MASTER_CODE_REF1, 12=REF2, 13=REF3, 14=REF4, 15=REF5
     */
    private Map<String, Object> toMasterRow(Object[] r, Map<String, String> codeIdToNmMap) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CODE_ID", asString(r[0]));
        row.put("CODE_NM", asString(r[1]));
        row.put("CODE_DESC", asString(r[2]));
        row.put("CODE_VER", asString(r[3]));
        row.put("USE_TP", asString(r[4]));
        row.put("START_ACTIVE_DATE", asLocalDateTime(r[5]));
        row.put("END_ACTIVE_DATE", asLocalDateTime(r[6]));
        row.put("CODE_OWNER_DEPT_NM", asString(r[7]));
        row.put("CODE_OWNER_EMP_NO", asString(r[8]));
        row.put("CODE_CHARACTER", asString(r[9]));
        row.put("MASTER_CODE", asString(r[10]));
        String ref1 = asString(r[11]);
        String ref2 = asString(r[12]);
        String ref3 = asString(r[13]);
        String ref4 = asString(r[14]);
        String ref5 = asString(r[15]);
        row.put("MASTER_CODE_REF1", ref1);
        row.put("MASTER_CODE_REF2", ref2);
        row.put("MASTER_CODE_REF3", ref3);
        row.put("MASTER_CODE_REF4", ref4);
        row.put("MASTER_CODE_REF5", ref5);
        row.put("MASTER_CODE_REF1_NM", lookupNm(codeIdToNmMap, ref1));
        row.put("MASTER_CODE_REF2_NM", lookupNm(codeIdToNmMap, ref2));
        row.put("MASTER_CODE_REF3_NM", lookupNm(codeIdToNmMap, ref3));
        row.put("MASTER_CODE_REF4_NM", lookupNm(codeIdToNmMap, ref4));
        row.put("MASTER_CODE_REF5_NM", lookupNm(codeIdToNmMap, ref5));
        return row;
    }

    /**
     * Category row 조립 — categoryRows native Object[] :
     *  0=MASTER_CODE, 1=CATEGORY_ID, 2=CATEGORY_NM
     */
    private Map<String, Object> toCategoryRow(Object[] c) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CATEGORY_ID", asString(c[1]));
        row.put("CATEGORY_NM", asString(c[2]));
        return row;
    }

    /**
     * Detail row 조립 (14 컬럼 + As-Is MASTER_CODE 중복 SELECT 보존 = 13 unique key).
     * CATEGORY_NM 은 categoryNmMap lookup, CODE_VAL_REF{N}_MN 은 refValueMeanMaps[N] lookup + NVL.
     *
     * <p>native Object[] index — searchDetail() detailSql SELECT 절 순서:
     *  0=MASTER_CODE, 1=CATEGORY_ID, 2=CODE_VAL,
     *  3=CODE_VAL_MEAN, 4=CODE_VAL_DESC, 5=CODE_VER, 6=SORT_SEQ,
     *  7=CODE_VAL_REF1, 8=REF2, 9=REF3, 10=REF4, 11=REF5
     */
    private Map<String, Object> toDetailRow(Object[] d,
                                            Map<String, String> categoryNmMap,
                                            Map<String, String>[] refValueMeanMaps) {
        String masterCode = asString(d[0]);
        String categoryId = asString(d[1]);
        String codeVal = asString(d[2]);
        String codeValMean = asString(d[3]);
        String codeValDesc = asString(d[4]);
        String codeVer = asString(d[5]);
        Number sortSeq = asNumber(d[6]);
        String ref1 = asString(d[7]);
        String ref2 = asString(d[8]);
        String ref3 = asString(d[9]);
        String ref4 = asString(d[10]);
        String ref5 = asString(d[11]);

        Map<String, Object> row = new LinkedHashMap<>();
        row.put("MASTER_CODE", masterCode);
        row.put("CATEGORY_ID", categoryId);
        row.put("CATEGORY_NM", categoryNmMap.getOrDefault(categoryId, null));
        row.put("SORT_SEQ", sortSeq);
        // xml:54 의 CDETAIL.MASTER_CODE 중복 SELECT — As-Is 1:1 보존
        // (LinkedHashMap put 시 동일 key 는 마지막 쓰기가 이김 — As-Is 결과 Map 동일 거동)
        row.put("MASTER_CODE", masterCode);
        row.put("CODE_VAL", codeVal);
        row.put("CODE_VAL_MEAN", codeValMean);
        row.put("CODE_VAL_DESC", codeValDesc);
        row.put("CODE_VER", codeVer);
        // CODE_VAL_REF1~5_MN — nested scalar subquery + NVL fallback (분석 §6 #3)
        row.put("CODE_VAL_REF1_MN", nvlRef(refValueMeanMaps[0], ref1));
        row.put("CODE_VAL_REF2_MN", nvlRef(refValueMeanMaps[1], ref2));
        row.put("CODE_VAL_REF3_MN", nvlRef(refValueMeanMaps[2], ref3));
        row.put("CODE_VAL_REF4_MN", nvlRef(refValueMeanMaps[3], ref4));
        row.put("CODE_VAL_REF5_MN", nvlRef(refValueMeanMaps[4], ref5));
        return row;
    }

    /**
     * Master 그리드의 MASTER_CODE_REF1~5_NM scalar subquery — service 측 batch lookup.
     * 각 행마다 별도 SELECT 회피: 사용된 모든 REF ID 를 모아 1회 native query 로 한꺼번에 조회.
     */
    @SuppressWarnings("unchecked")
    private Map<String, String> buildRefCodeNmMap(List<Object[]> rows) {
        Set<String> refIds = new LinkedHashSet<>();
        for (Object[] r : rows) {
            // r[11]~r[15] = MASTER_CODE_REF1~5
            addIfPresent(refIds, asString(r[11]));
            addIfPresent(refIds, asString(r[12]));
            addIfPresent(refIds, asString(r[13]));
            addIfPresent(refIds, asString(r[14]));
            addIfPresent(refIds, asString(r[15]));
        }
        Map<String, String> map = new HashMap<>();
        if (refIds.isEmpty()) return map;

        String sql = "SELECT CODE_ID, CODE_NM FROM " + READ_SCHEMA + ".TB_MCM_CODE_MASTER "
                + "WHERE CODE_ID IN (:refIds)";
        List<Object[]> raw = (List<Object[]>) em.createNativeQuery(sql)
                .setParameter("refIds", refIds)
                .getResultList();
        for (Object[] row : raw) {
            map.put(asString(row[0]), asString(row[1]));
        }
        return map;
    }

    /**
     * Detail Ref{N} _MN alias nested scalar subquery 의 lookup map 구축.
     *
     * <p>As-Is xml:61~94: {@code SUB.MASTER_CODE = (SELECT MAST.MASTER_CODE FROM TB_MCM_CODE_MASTER
     *  WHERE MAST.CODE_ID = #{pCodeIdRef{N}}) AND SUB.CATEGORY_ID = 'SZ0000'}
     *  → 결과 (CODE_VAL → CODE_VAL_MEAN) map 반환.
     *
     * <p>To-Be 등가 — JOIN 1 회 native query (분석 §F.1 C-003 — MCMAPUSER schema 명시).
     */
    @SuppressWarnings("unchecked")
    private Map<String, String> buildRefValueMeanMap(String pCodeIdRef) {
        Map<String, String> map = new HashMap<>();
        if (pCodeIdRef == null || pCodeIdRef.isBlank()) return map;

        // 1 회 JOIN — MASTER 의 MASTER_CODE 를 DETAIL 과 매칭 + CATEGORY_ID='SZ0000' 하드코딩 보존 (xml:64/71/78/85/92)
        String sql = "SELECT D.CODE_VAL, D.CODE_VAL_MEAN "
                + "FROM " + READ_SCHEMA + ".TB_MCM_CODE_DETAIL D "
                + "INNER JOIN " + READ_SCHEMA + ".TB_MCM_CODE_MASTER M "
                + "  ON D.MASTER_CODE = M.MASTER_CODE "
                + "WHERE M.CODE_ID = :pCodeIdRef "
                + "  AND D.CATEGORY_ID = :categoryId";

        List<Object[]> raw = (List<Object[]>) em.createNativeQuery(sql)
                .setParameter("pCodeIdRef", pCodeIdRef)
                .setParameter("categoryId", REF_SCALAR_CATEGORY_ID)
                .getResultList();
        for (Object[] row : raw) {
            map.put(asString(row[0]), asString(row[1]));
        }
        return map;
    }

    private static void addIfPresent(Collection<String> set, String s) {
        if (s != null && !s.isBlank()) set.add(s);
    }

    private static String lookupNm(Map<String, String> map, String key) {
        if (key == null || key.isBlank()) return null;
        return map.get(key);
    }

    /**
     * NVL((scalar subquery), CDETAIL.CODE_VAL_REF{N}) 의 service 등가.
     * subquery 결과가 null 이거나 lookup 실패 시 원본 CODE_VAL_REF{N} 반환.
     */
    private static String nvlRef(Map<String, String> refMap, String originalCodeVal) {
        if (originalCodeVal == null || originalCodeVal.isBlank()) return originalCodeVal;
        String mean = refMap.get(originalCodeVal);
        return mean != null ? mean : originalCodeVal;
    }

    // ── native scalar type adapters ──

    private static String asString(Object o) {
        return o == null ? null : o.toString();
    }

    private static Number asNumber(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n;
        try { return Long.parseLong(o.toString()); } catch (NumberFormatException ex) { return null; }
    }

    private static LocalDateTime asLocalDateTime(Object o) {
        if (o == null) return null;
        if (o instanceof LocalDateTime ldt) return ldt;
        if (o instanceof Timestamp ts) return ts.toLocalDateTime();
        if (o instanceof java.util.Date d) return new Timestamp(d.getTime()).toLocalDateTime();
        return null;
    }
}
