/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commPermMng OASIS BPMN serviceTask entry point — 2 action (searchCmPerm / saveCmPerm) 분기 (W6)
 *       cross-cutting 정책 #1 (BIZ_SYSTEM_CODE 폐기) 로 lov action 제거 — As-Is 3 → To-Be 2 action
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.service;

import com.dongkuk.dmes.mcm.csa.commPermMng.dto.CommPermMngSearchRequest;
import com.dongkuk.dmes.mcm.entity.SecPerm;
import com.dongkuk.dmes.mcm.repository.SecPermRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;

/**
 * commPermMng — OASIS BPMN serviceTask entry point (W6 / csa 9 화면 6번째).
 *
 * <p>Spring bean name {@code commPermMngService} → BPMN
 * {@code <camunda:class>commPermMngService</camunda:class>}.
 *
 * <p>BPMN action 2 (As-Is 3 → To-Be 2 — cross-cutting 정책 #1 lov 폐기 / 분석 §1 / §8 / BPMN설계서 §1.1):
 * <ol>
 *   <li>{@code searchCmPerm} → {@link #searchCmPerm(CommPermMngSearchRequest)}
 *       — PERMISSION 그리드 조회 (selectCommPermMng) + ROLE_ID scalar 부착</li>
 *   <li>{@code saveCmPerm} → {@link #saveCmPerm(List)}
 *       — PERMISSION 일괄 저장 (status 분기 inserted/updated/deleted) + NOT EXISTS 검증 + 후속 재조회</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — ROLE_ID scalar subquery (TB_MCM_SEC_ROLE_MAPPING) 는
 * native query 로 처리. SecPerm entity 에 cross-table 캐싱 ✗.
 *
 * <p>audit 9 컬럼 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 은
 * mcm-core {@code McmAuditListener} 가 JPA PrePersist / PreUpdate 콜백으로 자동 채움 — service body 미설정.
 *
 * <p>To-Be 정책 누적:
 * <ul>
 *   <li>#1 — BIZ_SYSTEM_CODE 폐기 (S-001 / D-007 / D-008 / G-008 / DS-003 / lov action / Task_08v4ryn /
 *       cross-module CommObjMngMapper.selectAppHostId 모두 폐기)</li>
 *   <li>#6 (A) — Entity 직역 (SecPerm 1:1, SecPermButton 미생성)</li>
 *   <li>END_ACTIVE_DATE 신규 default 정정 — As-Is "99991231" 8자 → To-Be {@code 9999-12-31 00:00:00}
 *       (W5 iter#3 사용자 검수 J-011 — AsIs Oracle DATE 자동 변환 시 시분초 00:00:00 정합)</li>
 * </ul>
 *
 * <p>BPMN definition: {@code services/csa/commPermMng/commPermMng.bpmn}.
 */
@Service("commPermMngService")
public class CommPermMngService {

    private static final Logger log = LoggerFactory.getLogger(CommPermMngService.class);

    /**
     * As-Is xfdl:384 행추가 default {@code "99991231"} 8자 → To-Be 정정 {@code 9999-12-31 00:00:00}.
     *
     * <p>2026-06-02 W5 (commUserMng) iter#3 사용자 검수 J-011 결과 정정 — AsIs Oracle DATE 자동
     * 바인딩 시 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00} 으로
     * 일치시켜야 정합. 23:59:59 → 00:00:00 (cma·W1~W5 정본 패턴 갱신).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecPermRepository secPermRepository;

    public CommPermMngService(SecPermRepository secPermRepository) {
        this.secPermRepository = secPermRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmPerm — PERMISSION 그리드 조회 (selectCommPermMng 매핑)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmPerm} 진입점. As-Is {@code selectCommPermMng} (xml:7~40) 변환.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecPermRepository#searchByFilter(String, String, String)}
     *       — 본 10 컬럼 (To-Be 정책 #1) 검색</li>
     *   <li>각 row 에 ROLE_ID scalar subquery
     *       ({@link SecPermRepository#findOneRoleIdByPermissionId(String)}) 부착 — fn_rowDelete
     *       클라이언트 차단 검증용</li>
     *   <li>{@code ds_main} key 의 List<Map> 반환 → cactus 가 {@code grids.ds_main.rows} 로 응답</li>
     * </ol>
     *
     * <p>응답 row 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.7 DS-001 / §11.1) 보존 —
     * FE 가 As-Is {@code ds_main} 의 컬럼명을 사용.
     */
    public Map<String, Object> searchCmPerm(CommPermMngSearchRequest request) {
        String pPermissionId = request != null ? request.getEdtPERMISSIONID() : null;
        String pPermissionNm = request != null ? request.getEdtPERMISSIONNM() : null;
        String pUseTp        = request != null ? request.getCboUSETP() : null;

        List<SecPerm> rows = secPermRepository.searchByFilter(pPermissionId, pPermissionNm, pUseTp);

        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecPerm p : rows) {
            outRows.add(toSearchRow(p));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmPerm — PERMISSION 일괄 저장 (status 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask 자동 분기 → To-Be Service for-loop 명시 분기
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmPerm} 진입점. As-Is BPMN {@code CommonMultiSaveTask} (insertSqlKey /
     * updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (cma·W1~W5 정본 패턴).
     *
     * <p>입력: {@code master} = {@code List<Map>} — As-Is xfdl 의 {@code ds_main:U} (변경 행만, rowStatus 포함).
     *
     * <p>status 분기:
     * <ul>
     *   <li>"inserted" / "C" → INSERT (JPA save() — PK 미존재 시 INSERT)</li>
     *   <li>"updated"  / "U" → UPDATE (JPA save() — PK 존재 시 UPDATE)</li>
     *   <li>"deleted"  / "D" → DELETE (NOT EXISTS 이중 검증 후 deleteById)</li>
     * </ul>
     *
     * <p>NOT EXISTS 이중 검증 (deleteCommPermMng 의 server 차단 — xml:91~95 / 분석 §6 #4):
     * {@link SecPermRepository#countRoleMappingByPermissionId(String)} == 0 일 때만 실제 삭제.
     * 위반 시 silent skip (As-Is 동작 보존 — 분석 §6.2 / §6.3).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — cma·W1 정본 패턴과 정합).
     */
    public Map<String, Object> saveCmPerm(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String permissionId = strOf(row.get("PERMISSION_ID"));
                if (permissionId == null || permissionId.isBlank()) {
                    log.warn("[commPermMng.saveCmPerm] PERMISSION_ID null — skip row (status={})", status);
                    continue;
                }

                if ("deleted".equals(status) || "D".equals(status)) {
                    // NOT EXISTS 이중 검증 (xml:91~95) — TB_MCM_SEC_ROLE_MAPPING 매핑 행이 있으면 silent skip
                    long roleMapCnt = secPermRepository.countRoleMappingByPermissionId(permissionId);
                    if (roleMapCnt > 0) {
                        log.warn("[commPermMng.saveCmPerm] delete blocked — PERMISSION_ID={} roleMap={} (silent skip)",
                                 permissionId, roleMapCnt);
                        continue;
                    }
                    if (secPermRepository.existsById(permissionId)) {
                        secPermRepository.deleteById(permissionId);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    SecPerm entity = secPermRepository.findById(permissionId).orElseGet(SecPerm::new);
                    boolean isNew = entity.getPermissionId() == null;
                    entity.setPermissionId(permissionId);
                    entity.setPermissionNm(strOf(row.get("PERMISSION_NM")));
                    entity.setPermissionDesc(strOf(row.get("PERMISSION_DESC")));
                    entity.setPermissionCommon(strOf(row.get("PERMISSION_COMMON")));
                    entity.setPermissionCustom(strOf(row.get("PERMISSION_CUSTOM")));
                    entity.setPopupBtn(strOf(row.get("POPUP_BTN")));
                    entity.setPermissionAction(strOf(row.get("PERMISSION_ACTION")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"),
                            isNew ? LocalDateTime.now() : entity.getStartActiveDate()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"),
                            isNew ? END_OF_TIME : entity.getEndActiveDate()));
                    secPermRepository.save(entity);
                    cnt++;
                } else {
                    log.warn("[commPermMng.saveCmPerm] unknown status={} — skip", status);
                }
            }
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:350 fn_msgSuccessSave 콜백 → fn_run("searchCmPerm") 자동 재조회 정합)
        List<SecPerm> rows = secPermRepository.findAll();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecPerm p : rows) {
            outRows.add(toSearchRow(p));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — As-Is selectCommPermMng SELECT 결과 컬럼명 (SNAKE_CASE) 보존
    // ────────────────────────────────────────────────────────────────

    /**
     * As-Is {@code selectCommPermMng} (xml:7~40) 의 응답 row 조립 — 본 10 컬럼 + ROLE_ID (scalar subquery).
     *
     * <p>As-Is BIZ_SYSTEM_CODE 컬럼 (xml:18 / 23 중복 SELECT) 은 To-Be 정책 #1 미반영.
     */
    private Map<String, Object> toSearchRow(SecPerm p) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("PERMISSION_ID", p.getPermissionId());
        row.put("PERMISSION_NM", p.getPermissionNm());
        row.put("PERMISSION_DESC", p.getPermissionDesc());
        row.put("PERMISSION_COMMON", p.getPermissionCommon());
        row.put("PERMISSION_CUSTOM", p.getPermissionCustom());
        row.put("POPUP_BTN", p.getPopupBtn());
        row.put("PERMISSION_ACTION", p.getPermissionAction());
        row.put("USE_TP", p.getUseTp());
        row.put("START_ACTIVE_DATE", p.getStartActiveDate());
        row.put("END_ACTIVE_DATE", p.getEndActiveDate());
        // ROLE_ID scalar subquery — As-Is xml:19~22 (TB_MCM_SEC_ROLE_MAPPING 매핑 존재 시 1 건)
        row.put("ROLE_ID", secPermRepository.findOneRoleIdByPermissionId(p.getPermissionId()));
        return row;
    }

    /** rowStatus 우선, fallback !nativeeditor_status (As-Is Nexacro 시스템 컬럼) — cma·W1~W5 정본 패턴. */
    private static String resolveStatus(Map<String, Object> row) {
        String status = strOf(row.get("rowStatus"));
        if (status == null || status.isBlank()) {
            status = strOf(row.get("!nativeeditor_status"));
        }
        return status;
    }

}
