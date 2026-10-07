/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleGrpMng OASIS BPMN serviceTask entry point — 6 action (W4)
 *       searchCmRoleGrp / saveCmRoleGrp / searchCmRoleGrpMap / saveCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto.CommRoleGrpMngSearchMapRequest;
import com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto.CommRoleGrpMngSearchRequest;
import com.dongkuk.dmes.mcm.entity.SecRoleGroup;
import com.dongkuk.dmes.mcm.entity.SecRoleGroupMapping;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;

/**
 * commRoleGrpMng — OASIS BPMN serviceTask entry point (W4 / csa 9 화면 4번째).
 *
 * <p>Spring bean name {@code commRoleGrpMngService} → BPMN {@code <camunda:class>commRoleGrpMngService</camunda:class>}.
 *
 * <p>BPMN action 6 (As-Is 7 → To-Be 6 — 분석 §1 / §8 / BPMN §1.1):
 * <ol>
 *   <li>{@code searchCmRoleGrp}     → {@link #searchCmRoleGrp(CommRoleGrpMngSearchRequest)} — 역할 그룹 메인 그리드 조회</li>
 *   <li>{@code saveCmRoleGrp}       → {@link #saveCmRoleGrp(List)} — 역할 그룹 일괄 저장 (status 분기 inserted/updated/deleted) + NOT EXISTS 검증</li>
 *   <li>{@code searchCmRoleGrpMap}  → {@link #searchCmRoleGrpMap(CommRoleGrpMngSearchMapRequest)} — 선택 역할 그룹의 현재 매핑 역할 조회 (2-table JOIN + PARENT_ROLE_ID)</li>
 *   <li>{@code saveCmRoleGrpMap}    → {@link #saveCmRoleGrpMap(List)} — 매핑 일괄 저장 (INSERT/DELETE — UPDATE ✗ / 더미 DUAL 폐기)</li>
 *   <li>{@code searchCmRole}        → {@link #searchCmRole(CommRoleGrpMngSearchMapRequest)} — 미매핑 전체 역할 조회 (NOT EXISTS)</li>
 *   <li>{@code searchCmRoleGrpMenu} → {@link #searchCmRoleGrpMenu(CommRoleGrpMngSearchMapRequest)} — 매핑 역할이 보유한 메뉴 트리 조회 (CTE)</li>
 * </ol>
 *
 * <p>To-Be 제거된 As-Is action (정책 #1):
 * <ul>
 *   <li>~~{@code lov}~~ — As-Is BIZ SYSTEM 콤보 LoV — BIZ SYSTEM 콤보 폐기로 함께 폐기 (분석 §12 / BPMN §2.1)</li>
 * </ul>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — selectCommRoleGrp 의 USER_ID scalar subquery / selectCommRoleGrpMap 2-table JOIN /
 * selectCommRole NOT EXISTS / selectMenuObjTree 5-table CTE 는 모두 read-only →
 * {@link SecRoleGroupMappingNativeRepository} + {@link SecRoleGroupRepository} native query 어댑터 + Service 후처리로 처리.
 * Entity {@link SecRoleGroup} / {@link SecRoleGroupMapping} 는 save / delete 트랜잭션에만 사용.
 *
 * <p>audit 9 컬럼 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 은
 * mcm-core {@code McmAuditListener} 가 JPA PrePersist / PreUpdate 콜백으로 자동 채움 — service body 미설정.
 *
 * <p>BPMN definition: {@code services/csa/commRoleGrpMng/commRoleGrpMng.bpmn}.
 */
@Service("commRoleGrpMngService")
public class CommRoleGrpMngService {

    private static final Logger log = LoggerFactory.getLogger(CommRoleGrpMngService.class);

    /**
     * As-Is xfdl:718 행추가 default {@code "99991231"} 8자 (ST-002) — As-Is Mapper 의 직접 바인딩으로
     * Oracle DATE 자동 변환 시 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00}.
     *
     * <p>2026-06-02 iter#5 — W5 (commUserMng) 정본 패턴 정합: 23:59:59 → **00:00:00 정정** (AsIs 1:1 정합).
     * 모든 START_ACTIVE_DATE / END_ACTIVE_DATE 도 yyyy-MM-dd 입력값 → atStartOfDay (00:00:00).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecRoleGroupRepository secRoleGroupRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final SecRoleGroupMappingNativeRepository secRoleGroupMappingNativeRepository;

    private final ApplicationEventPublisher eventPublisher;

    public CommRoleGrpMngService(SecRoleGroupRepository secRoleGroupRepository,
                                 SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                                 SecRoleGroupMappingNativeRepository secRoleGroupMappingNativeRepository,
                                 ApplicationEventPublisher eventPublisher) {
        this.secRoleGroupRepository = secRoleGroupRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.secRoleGroupMappingNativeRepository = secRoleGroupMappingNativeRepository;
        this.eventPublisher = eventPublisher;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRoleGrp — 역할 그룹 메인 그리드 조회 (selectCommRoleGrp 매핑)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRoleGrp} 진입점. As-Is {@code selectCommRoleGrp} (xml:7~35) 변환.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecRoleGroupRepository#searchByFilter(String, String, String)} — 본 6 컬럼 (To-Be 정책 #1 — BIZ_SYSTEM_CODE 제거) 검색</li>
     *   <li>각 row 에 USER_ID scalar subquery 부착 (xml:14~18 — V-101 행삭제 차단 검증용)</li>
     *   <li>{@code ds_main} key 의 List&lt;Map&gt; 반환 → cactus 가 {@code grids.ds_main.rows} 로 응답</li>
     * </ol>
     *
     * <p>응답 row 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-002) 보존 — FE 가 As-Is {@code ds_main} 의 컬럼명을 사용.
     */
    public Map<String, Object> searchCmRoleGrp(CommRoleGrpMngSearchRequest request) {
        String pRoleGroupId = request != null ? request.getEdtROLEGROUPID() : null;
        String pRoleGroupNm = request != null ? request.getEdtROLEGROUPNM() : null;
        String pUseTp       = request != null ? request.getCboUSETP()       : null;

        List<SecRoleGroup> rows = secRoleGroupRepository.searchByFilter(pRoleGroupId, pRoleGroupNm, pUseTp);
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecRoleGroup r : rows) {
            outRows.add(toSearchRow(r));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmRoleGrp — 역할 그룹 일괄 저장 (status 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask 자동 분기 → To-Be Service for-loop 명시 분기 (W1·W2·W3 정본 패턴)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmRoleGrp} 진입점. As-Is BPMN {@code CommonMultiSaveTask}
     * (insertSqlKey / updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (W1·W2·W3 정본 패턴).
     *
     * <p>입력: {@code master} = {@code List<Map>} — As-Is xfdl 의 {@code ds_main:U} (변경 행만, rowStatus 포함).
     *
     * <p>status 분기:
     * <ul>
     *   <li>"inserted" / "C" → INSERT (JPA save() — PK 미존재 시 INSERT)
     *       <ul><li>PK 중복 검증 (Q-003 해소 — Service 책임 / 분석 §11.1 #15)</li></ul></li>
     *   <li>"updated"  / "U" → UPDATE (JPA save() — PK 존재 시 UPDATE)</li>
     *   <li>"deleted"  / "D" → DELETE (NOT EXISTS 이중 검증 후 deleteById)</li>
     * </ul>
     *
     * <p>NOT EXISTS 이중 검증 (deleteCommRoleGrp 의 server 차단 — xml:77~82 / V-101 + V-003 서버 재검증):
     * {@link SecRoleGroupRepository#countUserMappingByRoleGroupId(String)} == 0 AND
     * {@link SecRoleGroupRepository#countRoleGroupMappingByRoleGroupId(String)} == 0 일 때만 실제 삭제.
     * 위반 시 silent skip (As-Is 동작 보존 — W1·W2·W3 정본 패턴).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — As-Is fn_callBack saveCmRoleGrp 의 fn_search 자동 재호출 정합, xfdl:552).
     */
    public Map<String, Object> saveCmRoleGrp(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    // As-Is Nexacro 시스템 컬럼 fallback (W1·W2·W3 정본 패턴)
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String roleGroupId = strOf(row.get("ROLE_GROUP_ID"));
                if (roleGroupId == null || roleGroupId.isBlank()) {
                    log.warn("[commRoleGrpMng.saveCmRoleGrp] ROLE_GROUP_ID null — skip row (status={})", status);
                    continue;
                }

                if ("deleted".equals(status) || "D".equals(status)) {
                    // NOT EXISTS 이중 검증 (xml:77~82 — V-101 / V-003 서버 재검증)
                    long userMapCnt = secRoleGroupRepository.countUserMappingByRoleGroupId(roleGroupId);
                    long grpMapCnt = secRoleGroupRepository.countRoleGroupMappingByRoleGroupId(roleGroupId);
                    if (userMapCnt > 0 || grpMapCnt > 0) {
                        log.warn("[commRoleGrpMng.saveCmRoleGrp] delete blocked — ROLE_GROUP_ID={} userMapping={} roleGroupMapping={} (silent skip)",
                                 roleGroupId, userMapCnt, grpMapCnt);
                        continue;
                    }
                    if (secRoleGroupRepository.existsById(roleGroupId)) {
                        secRoleGroupRepository.deleteById(roleGroupId);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)) {
                    // PK 중복 검증 (Q-003 해소 / 분석 §11.1 #15)
                    if (secRoleGroupRepository.existsById(roleGroupId)) {
                        log.warn("[commRoleGrpMng.saveCmRoleGrp] insert blocked — duplicate PK ROLE_GROUP_ID={} (silent skip)",
                                 roleGroupId);
                        continue;
                    }
                    SecRoleGroup entity = new SecRoleGroup();
                    entity.setRoleGroupId(roleGroupId);
                    entity.setRoleGroupNm(strOf(row.get("ROLE_GROUP_NM")));
                    entity.setRoleGroupDesc(strOf(row.get("ROLE_GROUP_DESC")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), LocalDateTime.now()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), END_OF_TIME));
                    secRoleGroupRepository.save(entity);
                    cnt++;
                } else if ("updated".equals(status) || "U".equals(status)) {
                    SecRoleGroup entity = secRoleGroupRepository.findById(roleGroupId).orElse(null);
                    if (entity == null) {
                        log.warn("[commRoleGrpMng.saveCmRoleGrp] update skip — ROLE_GROUP_ID={} not found", roleGroupId);
                        continue;
                    }
                    entity.setRoleGroupNm(strOf(row.get("ROLE_GROUP_NM")));
                    entity.setRoleGroupDesc(strOf(row.get("ROLE_GROUP_DESC")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), entity.getStartActiveDate()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), entity.getEndActiveDate()));
                    secRoleGroupRepository.save(entity);
                    cnt++;
                } else {
                    log.warn("[commRoleGrpMng.saveCmRoleGrp] unknown status={} — skip", status);
                }
            }
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:552 fn_msgSuccessSave → fn_search() 재호출 정합)
        List<SecRoleGroup> rows = secRoleGroupRepository.findAll();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecRoleGroup r : rows) {
            outRows.add(toSearchRow(r));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRoleGrpMap — 선택 역할 그룹의 매핑 역할 조회 (2-table JOIN)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRoleGrpMap} 진입점. As-Is {@code selectCommRoleGrpMap} (xml:85~98) 호출.
     *
     * <p>응답: {@code ds_roleGrpMap} (As-Is dataset 이름 보존 / 분석 §3.8 DS-003).
     * 8 컬럼: ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE / ROLE_GROUP_ID /
     * PARENT_ROLE_ID (To-Be 추가 — Q-010 해소).
     */
    public Map<String, Object> searchCmRoleGrpMap(CommRoleGrpMngSearchMapRequest request) {
        String roleGroupId = request != null ? request.getROLE_GROUP_ID() : null;
        List<Map<String, Object>> rows = (roleGroupId == null || roleGroupId.isBlank())
                ? new ArrayList<>()
                : secRoleGroupMappingNativeRepository.searchCmRoleGrpMap(roleGroupId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_roleGrpMap", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmRoleGrpMap — 매핑 일괄 저장 (INSERT/DELETE 분기 — UPDATE ✗ / 더미 DUAL 폐기)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmRoleGrpMap} 진입점. As-Is BPMN Task_0weig4p {@code CommonMultiSaveTask}
     * (insertSqlKey / ~~updateSqlKey (DUAL 더미)~~ / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환.
     *
     * <p>As-Is updateCommRoleGrpMap (xml:113~116) — SELECT 'X' FROM DUAL 더미 (실 동작 ✗) → To-Be 폐기.
     * ds_roleGrpMap rowType=4 행 자체가 발생하지 않으므로 status="updated" 분기 미정의.
     *
     * <p>입력: {@code master} = {@code List<Map>} — As-Is xfdl 의 {@code ds_roleGrpMap:U} (변경 행만, rowStatus 포함).
     *
     * <p>status 분기:
     * <ul>
     *   <li>"inserted" / "C" → INSERT (B-003 셔틀 추가 — JPA save() PK 미존재 시 INSERT)
     *       <ul><li>중복 PK 차단 — silent skip (W3 SecRoleMapping 정본 패턴)</li></ul></li>
     *   <li>"deleted"  / "D" → DELETE (B-002 셔틀 제외 — 복합 PK deleteById)</li>
     * </ul>
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_roleGrpMap} (재조회 결과 — As-Is xfdl:572~578 fn_msgSuccessSave →
     * 3 회 fn_run 재호출 (searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu) 정합).
     * 단 본 method 는 ds_roleGrpMap 만 반환 — ds_role / ds_menuTreeList 재조회는 FE 가 별도 action 호출 (As-Is 패턴).
     */
    public Map<String, Object> saveCmRoleGrpMap(List<Map<String, Object>> master) {
        int cnt = 0;
        int skipped = 0;                                  // 서버가 조용히 건너뛴 행 수 (FE 가 사유를 알 수 있게 응답에 실어 보낸다)
        Set<String> touchedRoleIds = new LinkedHashSet<>(); // 캐시 무효화 대상
        String lastRoleGroupId = null; // 후속 재조회용 ROLE_GROUP_ID 추출
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String roleGroupId = strOf(row.get("ROLE_GROUP_ID"));
                String roleId = strOf(row.get("ROLE_ID"));
                if (roleGroupId == null || roleGroupId.isBlank()
                    || roleId == null || roleId.isBlank()) {
                    log.warn("[commRoleGrpMng.saveCmRoleGrpMap] PK null — skip row "
                           + "(status={} ROLE_GROUP_ID={} ROLE_ID={})",
                            status, roleGroupId, roleId);
                    skipped++;
                    continue;
                }
                lastRoleGroupId = roleGroupId;
                SecRoleGroupMapping.PK pk = new SecRoleGroupMapping.PK(roleGroupId, roleId);

                if ("deleted".equals(status) || "D".equals(status)) {
                    if (secRoleGroupMappingRepository.existsById(pk)) {
                        secRoleGroupMappingRepository.deleteById(pk);
                        cnt++;
                        touchedRoleIds.add(roleId);
                    } else {
                        skipped++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)) {
                    // 중복 PK 차단 (W3 SecRoleMapping 정본 패턴 — Service 레이어 책임)
                    if (secRoleGroupMappingRepository.existsById(pk)) {
                        log.warn("[commRoleGrpMng.saveCmRoleGrpMap] insert blocked — duplicate PK "
                               + "(ROLE_GROUP_ID={} ROLE_ID={}) silent skip",
                                roleGroupId, roleId);
                        skipped++;
                        continue;
                    }
                    SecRoleGroupMapping entity = new SecRoleGroupMapping();
                    entity.setRoleGroupId(roleGroupId);
                    entity.setRoleId(roleId);
                    secRoleGroupMappingRepository.save(entity);
                    cnt++;
                    touchedRoleIds.add(roleId);
                } else {
                    // updated / 기타 — As-Is updateCommRoleGrpMap 더미 DUAL 폐기 (W3 정본 패턴)
                    log.warn("[commRoleGrpMng.saveCmRoleGrpMap] unsupported status={} — skip (UPDATE 분기 폐기 / 더미 DUAL)", status);
                    skipped++;
                }
            }
        }
        // 2026-09-04 fix — 역할그룹↔역할 매핑이 바뀌면 UserPermCache(TTL 10분)를 즉시 비운다.
        // 이 이벤트가 없어 "그룹에 역할을 붙였는데 최대 10분간 403" 이 발생했다.
        if (!touchedRoleIds.isEmpty()) {
            eventPublisher.publishEvent(new RoleChangedEvent(touchedRoleIds));
        }
        // 후속 ds_roleGrpMap 재조회 (As-Is xfdl:577 — fn_run("searchCmRoleGrpMap") 자동 재호출 정합)
        List<Map<String, Object>> rows = (lastRoleGroupId == null || lastRoleGroupId.isBlank())
                ? new ArrayList<>()
                : secRoleGroupMappingNativeRepository.searchCmRoleGrpMap(lastRoleGroupId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("cnt_skip", skipped);
        out.put("ds_roleGrpMap", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRole — 미매핑 전체 역할 조회 (NOT EXISTS 후보 풀)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRole} 진입점. As-Is {@code selectCommRole} (xml:128~143) 호출.
     *
     * <p>응답: {@code ds_role} (As-Is dataset 이름 보존 / 분석 §3.8 DS-001).
     * 7 컬럼: ROLE_ID / ROLE_NM / MENU_ID / USE_TP / START_ACTIVE_DATE / END_ACTIVE_DATE /
     * PARENT_ROLE_ID (To-Be 추가 — Q-010 해소).
     *
     * <p>WHERE USE_TP='Y' 하드코딩 + NOT EXISTS (현 ROLE_GROUP_ID 에 이미 매핑된 ROLE 제외).
     */
    public Map<String, Object> searchCmRole(CommRoleGrpMngSearchMapRequest request) {
        String roleGroupId = request != null ? request.getROLE_GROUP_ID() : null;
        List<Map<String, Object>> rows = secRoleGroupMappingNativeRepository.searchCmRole(roleGroupId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_role", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRoleGrpMenu — 매핑 역할이 보유한 메뉴 트리 조회 (CTE 변환)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRoleGrpMenu} 진입점. As-Is {@code selectMenuObjTree} (xml:145~249) 호출.
     *
     * <p>응답: {@code ds_menuTreeList} (As-Is dataset 이름 보존 / 분석 §3.8 DS-004).
     * 8 컬럼: MENU_ID / MENU_SEQ / MENU_NM / LEV / PARENT_MENU_ID / ROW_SEQ / OBJECT_ID / MENU_VIEW_YN.
     *
     * <p>Oracle CTE + CONNECT BY → ANSI 재귀 WITH 변환 ({@link SecRoleGroupMappingNativeRepository#searchCmRoleGrpMenu}).
     */
    public Map<String, Object> searchCmRoleGrpMenu(CommRoleGrpMngSearchMapRequest request) {
        String roleGroupId = request != null ? request.getROLE_GROUP_ID() : null;
        List<Map<String, Object>> rows = (roleGroupId == null || roleGroupId.isBlank())
                ? new ArrayList<>()
                : secRoleGroupMappingNativeRepository.searchCmRoleGrpMenu(roleGroupId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuTreeList", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — As-Is selectCommRoleGrp SELECT 결과 컬럼명 (SNAKE_CASE) 보존
    // ────────────────────────────────────────────────────────────────

    /**
     * As-Is {@code selectCommRoleGrp} (xml:7~35) 응답 row 조립 — 본 6 컬럼 (BIZ_SYSTEM_CODE 폐기) +
     * USER_ID (scalar subquery xml:14~18, V-101 행삭제 차단 검증용).
     *
     * <p>응답 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-002) 보존.
     */
    private Map<String, Object> toSearchRow(SecRoleGroup r) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ROLE_GROUP_ID", r.getRoleGroupId());
        row.put("ROLE_GROUP_NM", r.getRoleGroupNm());
        row.put("ROLE_GROUP_DESC", r.getRoleGroupDesc());
        row.put("USE_TP", r.getUseTp());
        row.put("START_ACTIVE_DATE", r.getStartActiveDate());
        row.put("END_ACTIVE_DATE", r.getEndActiveDate());
        // USER_ID scalar subquery — As-Is xml:14~18 (V-101 / FE 행삭제 차단 검증용)
        row.put("USER_ID", secRoleGroupRepository.findOneUserIdByRoleGroupId(r.getRoleGroupId()));
        return row;
    }

}
