/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: SecMenuFldLovRepository — TB_MCM_SEC_MENU_FLD lov (selectMenuId) 전용 read-only 어댑터 (commObjMng 화면용)
 */
package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@code MCMAPUSER.TB_MCM_SEC_MENU_FLD} 의 LoV (selectMenuId) 전용 read-only 어댑터.
 *
 * <p>본 클래스는 commObjMng 화면의 {@code lov} action 의 {@code selectMenuId}
 * (분석 §6 #6 / xml:118~130) 만 담당. {@code TB_MCM_SEC_MENU_FLD} entity 본 신설 ✗ — 본 테이블의
 * 정본 owner 는 commMenuMng 화면 (분석 §9.3 결과). 본 화면은 read-only 1 SQL 만 사용 →
 * native query 어댑터로 처리.
 *
 * <p>As-Is SQL (xml:118~130):
 * <pre>
 * SELECT MENU_ID,
 *        MAX(BIZ_SYSTEM_CODE)                          AS BIZ_SYSTEM_CODE,
 *        MAX(MENU_ID) || ' (' || MAX(MENU_NM) || ')'   AS MENU_ID_NM
 * FROM   MCMAPUSER.TB_MCM_SEC_MENU_FLD
 * WHERE  PARENT_MENU_ID IS NOT NULL
 * GROUP BY MENU_ID
 * ORDER BY MENU_ID
 * </pre>
 *
 * <p>MSSQL 변환 — Oracle {@code ||} 문자열 결합 → MSSQL {@code +} 또는 {@code CONCAT}. 본 native query
 * 는 {@code CONCAT} 사용 (NULL-safe).
 */
@Repository
public class SecMenuFldLovRepository {

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    /**
     * lov 응답 — As-Is 3 컬럼 (MENU_ID / BIZ_SYSTEM_CODE / MENU_ID_NM) 반환.
     *
     * <p>응답 row 의 key 는 As-Is dataset 컬럼명 (SNAKE_CASE) 그대로 보존 — FE 가 As-Is
     * {@code ds_lovMenuId} 의 컬럼명을 사용 (분석 §3.8 DS-004).
     */
    /**
     * 모든 폴더 row (모듈 + 그룹) 를 myMenus 형식으로 반환.
     *
     * <p>Round 3 (2026-06-02) — SEC_MENU 가 leaf 화면만 보관하도록 분리됨에 따라
     * portal 사이드바 트리 (SecUserService.getMyMenus) 가 SEC_MENU_FLD 의 폴더 row 도 함께
     * 결합해야 트리 계층이 정상 구성됨. 본 메서드는 SEC_MENU_FLD 전체 행을 myMenus 응답 row 와
     * 호환되는 컬럼명 (MENU_ID / MENU_NM / PARENT_MENU_ID / FULL_SEQ / USE_TP / MENU_TP /
     * MENU_VIEW_YN / MENU_SEQ) 으로 반환.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> findAllForMyMenus() {
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT MENU_ID, MENU_NM, PARENT_MENU_ID, FULL_SEQ, USE_TP, MENU_TP, " +
                "       MENU_VIEW_YN, MENU_SEQ " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                " ORDER BY FULL_SEQ")
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_NM", row[1]);
            map.put("PARENT_MENU_ID", row[2]);
            map.put("FULL_SEQ", row[3]);
            map.put("USE_TP", row[4]);
            map.put("MENU_TP", row[5]);
            map.put("MENU_VIEW_YN", row[6]);
            map.put("MENU_SEQ", row[7]);
            out.add(map);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> findAllMenuIdLov() {
        // SQLite 는 CONCAT 미지원 → || 분기. MSSQL 은 기존 CONCAT 유지. schema 접두는 inspector.toSqlite 가 제거.
        String menuIdNm = McmAuditStatementInspector.isSqlite()
                ? "MAX(MENU_ID) || ' (' || MAX(MENU_NM) || ')'"
                : "CONCAT(MAX(MENU_ID), ' (', MAX(MENU_NM), ')')";
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT MENU_ID, " +
                "       MAX(BIZ_SYSTEM_CODE) AS BIZ_SYSTEM_CODE, " +
                "       " + menuIdNm + " AS MENU_ID_NM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                " WHERE PARENT_MENU_ID IS NOT NULL " +
                " GROUP BY MENU_ID " +
                " ORDER BY MENU_ID")
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("BIZ_SYSTEM_CODE", row[1]);
            map.put("MENU_ID_NM", row[2]);
            out.add(map);
        }
        return out;
    }

    /**
     * root 폴더 (PARENT_MENU_ID IS NULL — 모듈 단위) LoV.
     *
     * <p>2026-06-05 — commObjMng 화면의 SYSTEM 필드 콤보박스 옵션 source.
     * 현 시점에는 'mcm' 1행만 존재 (시드). 추후 mpn / mqc / mpp / mls 등 다른 모듈이
     * SEC_MENU_FLD 에 root 로 추가되면 자동으로 콤보에 노출됨.
     *
     * <p>응답 컬럼: { MENU_ID, MENU_NM } — FE Select option {value, label} 매핑용.
     */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> findRootMenuFlds() {
        List<Object[]> rows = entityManager.createNativeQuery(
                "SELECT MENU_ID, MENU_NM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_MENU_FLD " +
                " WHERE PARENT_MENU_ID IS NULL " +
                "   AND (USE_TP IS NULL OR USE_TP = 'Y') " +
                " ORDER BY FULL_SEQ, MENU_ID")
                .getResultList();
        List<Map<String, Object>> out = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> map = new LinkedHashMap<>();
            map.put("MENU_ID", row[0]);
            map.put("MENU_NM", row[1]);
            out.add(map);
        }
        return out;
    }
}
