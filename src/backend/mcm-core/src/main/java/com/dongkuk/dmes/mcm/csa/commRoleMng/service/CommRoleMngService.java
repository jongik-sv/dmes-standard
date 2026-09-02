/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleMng OASIS BPMN serviceTask entry point — 6 action (W3)
 *       searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.service;

import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchObjectLovRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchPermRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRoleMapRequest;
import com.dongkuk.dmes.mcm.entity.SecRole;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * commRoleMng — OASIS BPMN serviceTask entry point (W3 / csa 9 화면 3번째).
 *
 * <p>Spring bean name {@code commRoleMngService} → BPMN {@code <camunda:class>commRoleMngService</camunda:class>}.
 *
 * <p>BPMN action 7 (As-Is 8 → To-Be 7 — 분석 §11 #11 / BPMN §1.3 / round-2 fix 2026-06-02):
 * <ol>
 *   <li>{@code searchCmRole}     → {@link #searchCmRole(CommRoleMngSearchRequest)} — 역할 마스터 그리드 조회 (selectCommRole)</li>
 *   <li>{@code saveCmRole}       → {@link #saveCmRole(List)} — 역할 마스터 일괄 저장 (rowStatus 분기 inserted/updated/deleted) + NOT EXISTS 검증</li>
 *   <li>{@code searchCmRoleMap}  → {@link #searchCmRoleMap(CommRoleMngSearchRoleMapRequest)} — 선택 역할의 현재 권한 조회 (3-table JOIN)</li>
 *   <li>{@code saveCmRoleMap}    → {@link #saveCmRoleMap(List)} — 현재 권한 일괄 저장 (INSERT/DELETE 분기 / UPDATE 분기 ✗ — Q-011 closed)</li>
 *   <li>{@code searchCmPerm}     → {@link #searchCmPerm(CommRoleMngSearchPermRequest)} — 전체 권한 표시 (2026-06-03 사용자 결정 — NOT EXISTS 제거 / 권한 부여 무관 모든 권한 항상 표시)</li>
 *   <li>{@code lov}              → {@link #lov()} — MENU_ID lov (To-Be 정책 #1: As-Is APP_HOST_ID 폐기 → MENU_ID 1 dataset 만)</li>
 *   <li>{@code searchObjectLov}  → {@link #searchObjectLov(CommRoleMngSearchObjectLovRequest)} — sub2 OBJECT-LoV
 *       (round-2 fix / Q-016 closed — As-Is xfdl:321~336 commonDynamic_onload "csa::CommMenuMng/commonList"
 *       의 본 namespace 내재화 — TB_MCM_SEC_OBJ WHERE USE_TP='Y' AND UPPER LIKE — 응답 ds_menuObjLst)</li>
 * </ol>
 *
 * <p>To-Be 제거된 As-Is action (정책):
 * <ul>
 *   <li>~~{@code searchCmRoleMapPnt}~~ — 부모역할 부여 조회 (As-Is xfdl 주석 처리 / 분석 §11 #11)</li>
 *   <li>~~{@code pntRoleIdPop}~~ — 부모 역할 POPUP (As-Is xfdl 주석 처리 / 분석 §11 #11)</li>
 * </ul>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — selectCommRole 의 ROLE_GROUP_ID scalar subquery / ID(SUBSTR/INSTR) 계산 /
 * selectCommRoleMapList 의 3-table JOIN / selectCommPerm NOT EXISTS / selectMenuId lov 는 모두 read-only →
 * {@link SecRoleMappingNativeRepository} native query 어댑터 + Service 후처리로 처리.
 * Entity {@link SecRole} / {@link SecRoleMapping} 는 save / delete 트랜잭션에만 사용.
 *
 * <p>audit 9 컬럼 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 은
 * mcm-core {@code McmAuditListener} 가 JPA PrePersist / PreUpdate 콜백으로 자동 채움 — service body 미설정.
 *
 * <p>BPMN definition: {@code services/csa/commRoleMng/commRoleMng.bpmn}.
 */
@Service("commRoleMngService")
public class CommRoleMngService {

    private static final Logger log = LoggerFactory.getLogger(CommRoleMngService.class);

    /**
     * As-Is xfdl:695 행추가 default {@code "99991231"} 8자.
     * AsIs Mapper insertCommRole:58~59 {@code TO_DATE(SUBSTR(..., 1, 14), 'YYYYMMDDhh24miss')} — yyyyMMdd 8자 입력 시
     * 시분초 = 00:00:00 (Oracle TO_DATE 동작 — SUBSTR 결과 8자 → 시분초 부족 → 00:00:00).
     *
     * <p>W5 G 정합 (commUserMng 2026-06-02 iter#3 사용자 검수 J-011 정정): END_OF_TIME = {@code 9999-12-31 00:00:00}.
     * AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00} 1:1 보존 (이전 23:59:59 → 00:00:00 변경).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecRoleRepository secRoleRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecRoleMappingNativeRepository secRoleMappingNativeRepository;

    public CommRoleMngService(SecRoleRepository secRoleRepository,
                              SecRoleMappingRepository secRoleMappingRepository,
                              SecRoleMappingNativeRepository secRoleMappingNativeRepository) {
        this.secRoleRepository = secRoleRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secRoleMappingNativeRepository = secRoleMappingNativeRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRole — 역할 마스터 그리드 조회 (selectCommRole 매핑)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRole} 진입점. As-Is {@code selectCommRole} (xml:7~37) 변환.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecRoleRepository#searchByFilter(String, String, String)} — 본 8 컬럼 (To-Be 정책 #1 — BIZ_SYSTEM_CODE 제거) 검색</li>
     *   <li>각 row 에 ROLE_GROUP_ID scalar subquery + ID (마지막 `_` 이후 토큰 — As-Is xml:20 SUBSTR/INSTR(_,-1,1) 등가) 부착</li>
     *   <li>{@code ds_main} key 의 List&lt;Map&gt; 반환 → cactus 가 {@code grids.ds_main.rows} 로 응답</li>
     * </ol>
     *
     * <p>응답 row 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-002) 보존 — FE 가 As-Is {@code ds_main} 의 컬럼명을 사용.
     */
    public Map<String, Object> searchCmRole(CommRoleMngSearchRequest request) {
        String pRoleId = request != null ? request.getEdtROLEID() : null;
        String pRoleNm = request != null ? request.getEdtROLENM() : null;
        String pUseTp  = request != null ? request.getCboUSETP()  : null;

        List<SecRole> rows = secRoleRepository.searchByFilter(pRoleId, pRoleNm, pUseTp);
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecRole r : rows) {
            outRows.add(toSearchRow(r));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmRole — 역할 마스터 일괄 저장 (status 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask 자동 분기 → To-Be Service for-loop 명시 분기 (W1·W2 정본 패턴)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmRole} 진입점. As-Is BPMN {@code CommonMultiSaveTask}
     * (insertSqlKey / updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (W1·W2 정본 패턴).
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
     * <p>NOT EXISTS 이중 검증 (deleteCommRole 의 server 차단 — xml:80~86 / V-003·V-004 서버 재검증):
     * {@link SecRoleRepository#countRoleGroupMappingByRoleId(String)} == 0 AND
     * {@link SecRoleRepository#countRoleMappingByRoleId(String)} == 0 일 때만 실제 삭제.
     * 위반 시 silent skip (As-Is 동작 보존 — W1 commObjMng 정본 패턴).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — As-Is fn_callBack saveCmRole 의 fn_search 자동 재호출 정합).
     */
    public Map<String, Object> saveCmRole(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    // As-Is Nexacro 시스템 컬럼 fallback (W1·W2 정본 패턴)
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String roleId = strOf(row.get("ROLE_ID"));
                if (roleId == null || roleId.isBlank()) {
                    log.warn("[commRoleMng.saveCmRole] ROLE_ID null — skip row (status={})", status);
                    continue;
                }

                if ("deleted".equals(status) || "D".equals(status)) {
                    // NOT EXISTS 이중 검증 (xml:80~86 — V-003 / V-004 서버 재검증)
                    long roleGrpCnt = secRoleRepository.countRoleGroupMappingByRoleId(roleId);
                    long roleMapCnt = secRoleRepository.countRoleMappingByRoleId(roleId);
                    if (roleGrpCnt > 0 || roleMapCnt > 0) {
                        log.warn("[commRoleMng.saveCmRole] delete blocked — ROLE_ID={} roleGroupMapping={} roleMapping={} (silent skip)",
                                 roleId, roleGrpCnt, roleMapCnt);
                        continue;
                    }
                    if (secRoleRepository.existsById(roleId)) {
                        secRoleRepository.deleteById(roleId);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    SecRole entity = secRoleRepository.findById(roleId).orElseGet(SecRole::new);
                    boolean isNew = entity.getRoleId() == null;
                    entity.setRoleId(roleId);
                    entity.setRoleNm(strOf(row.get("ROLE_NM")));
                    entity.setRoleDesc(strOf(row.get("ROLE_DESC")));
                    entity.setMenuId(strOf(row.get("MENU_ID")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"),
                            isNew ? LocalDateTime.now() : entity.getStartActiveDate()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"),
                            isNew ? END_OF_TIME : entity.getEndActiveDate()));
                    // PARENT_ROLE_ID — As-Is 본 화면 미설정 (부모역할 부여 화면 정본 / 분석 §9.4.1 #4)
                    // 신규 행은 null 유지 / 기존 행은 보존
                    secRoleRepository.save(entity);
                    cnt++;
                } else {
                    log.warn("[commRoleMng.saveCmRole] unknown status={} — skip", status);
                }
            }
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:472~477 fn_msgSuccessSave → fn_search() 재호출 정합)
        List<SecRole> rows = secRoleRepository.findAll();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecRole r : rows) {
            outRows.add(toSearchRow(r));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRoleMap — 선택 역할의 현재 권한 조회 (3-table JOIN)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRoleMap} 진입점. As-Is {@code selectCommRoleMapList} (xml:89~110) 호출.
     *
     * <p>응답: {@code ds_roleMap} (As-Is dataset 이름 보존 / 분석 §3.8 DS-003).
     * 10 컬럼: PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN /
     * OBJECT_ID / OBJECT_NM / SYSTEM_CODE / SERVICE / ROLE_ID.
     */
    public Map<String, Object> searchCmRoleMap(CommRoleMngSearchRoleMapRequest request) {
        String roleId = request != null ? request.getROLE_ID() : null;
        List<Map<String, Object>> rows = (roleId == null || roleId.isBlank())
                ? new ArrayList<>()
                : secRoleMappingNativeRepository.searchCmRoleMap(roleId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_roleMap", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmRoleMap — 현재 권한 일괄 저장 (INSERT/DELETE 분기 — UPDATE ✗ / Q-011 closed)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmRoleMap} 진입점. As-Is BPMN Task_0weig4p {@code CommonMultiSaveTask}
     * (insertSqlKey / ~~updateSqlKey~~ / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환.
     *
     * <p>As-Is updateCommRoleMap no-op (SELECT 'X' FROM DUAL) → To-Be 폐기 (Q-011 closed / 분석 §11 #20).
     * ds_roleMap rowType=4 행 자체가 발생하지 않으므로 status="updated" 분기 미정의.
     *
     * <p>입력: {@code master} = {@code List<Map>} — As-Is xfdl 의 {@code ds_roleMap:U} (변경 행만, rowStatus 포함).
     *
     * <p>status 분기:
     * <ul>
     *   <li>"inserted" / "C" → INSERT (BS-002 btn_left 추가 — JPA save() PK 미존재 시 INSERT)</li>
     *   <li>"deleted"  / "D" → DELETE (BS-001 btn_right 삭제 — 복합 PK deleteById)</li>
     * </ul>
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_roleMap} (재조회 결과 — As-Is xfdl:504~511 fn_run("searchCmRoleMap") + fn_run("searchCmPerm") 재호출 정합).
     * 단 본 method 는 ds_roleMap 만 반환 — ds_perm 재조회는 FE 가 별도 action(searchCmPerm) 호출 (As-Is 패턴).
     */
    public Map<String, Object> saveCmRoleMap(List<Map<String, Object>> master) {
        int cnt = 0;
        String lastRoleId = null; // 후속 재조회용 ROLE_ID 추출
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    status = strOf(row.get("!nativeeditor_status"));
                }
                String roleId = strOf(row.get("ROLE_ID"));
                String objectId = strOf(row.get("OBJECT_ID"));
                String permissionId = strOf(row.get("PERMISSION_ID"));
                if (roleId == null || roleId.isBlank()
                    || objectId == null || objectId.isBlank()
                    || permissionId == null || permissionId.isBlank()) {
                    log.warn("[commRoleMng.saveCmRoleMap] PK null — skip row "
                           + "(status={} ROLE_ID={} OBJECT_ID={} PERMISSION_ID={})",
                            status, roleId, objectId, permissionId);
                    continue;
                }
                lastRoleId = roleId;
                SecRoleMapping.PK pk = new SecRoleMapping.PK(roleId, objectId, permissionId);

                if ("deleted".equals(status) || "D".equals(status)) {
                    if (secRoleMappingRepository.existsById(pk)) {
                        secRoleMappingRepository.deleteById(pk);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)) {
                    // 중복 PK 차단 (Q-004 해소 — Service 레이어 책임)
                    if (secRoleMappingRepository.existsById(pk)) {
                        log.warn("[commRoleMng.saveCmRoleMap] insert blocked — duplicate PK "
                               + "(ROLE_ID={} OBJECT_ID={} PERMISSION_ID={}) silent skip",
                                roleId, objectId, permissionId);
                        continue;
                    }
                    SecRoleMapping entity = new SecRoleMapping();
                    entity.setRoleId(roleId);
                    entity.setObjectId(objectId);
                    entity.setPermissionId(permissionId);
                    secRoleMappingRepository.save(entity);
                    cnt++;
                } else {
                    // updated / 기타 — As-Is updateCommRoleMap no-op 폐기 (Q-011)
                    log.warn("[commRoleMng.saveCmRoleMap] unsupported status={} — skip (UPDATE 분기 폐기 / Q-011)", status);
                }
            }
        }
        // 후속 ds_roleMap 재조회 (As-Is xfdl:504~511 — fn_run("searchCmRoleMap") 자동 재호출 정합)
        List<Map<String, Object>> rows = (lastRoleId == null || lastRoleId.isBlank())
                ? new ArrayList<>()
                : secRoleMappingNativeRepository.searchCmRoleMap(lastRoleId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_roleMap", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmPerm — 전체 권한 표시 (2026-06-03 — NOT EXISTS 제거 / 권한 부여 무관 전체 표시)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmPerm} 진입점. As-Is {@code selectCommPerm} (xml:143~159) 호출.
     *
     * <p>응답: {@code ds_perm} (As-Is dataset 이름 보존 / 분석 §3.8 DS-001).
     * 5 컬럼: PERMISSION_ID / PERMISSION_NM / PERMISSION_COMMON / PERMISSION_CUSTOM / POPUP_BTN.
     *
     * <p>2026-06-03 사용자 결정 — NOT EXISTS 분기 제거. 권한 부여 여부 무관 모든 권한 항상 표시.
     * 본 method 의 ROLE_ID 파라미터는 시그니처 호환 유지만 (BPMN/FE 변경 회피)이며 native query 에는 미사용.
     * 변경 사유는 {@link SecRoleMappingNativeRepository#searchCmPerm(String)} javadoc 참조.
     */
    public Map<String, Object> searchCmPerm(CommRoleMngSearchPermRequest request) {
        String roleId = request != null ? request.getROLE_ID() : null;
        List<Map<String, Object>> rows = secRoleMappingNativeRepository.searchCmPerm(roleId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_perm", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: lov — MENU_ID lov (To-Be 정책 #1 — APP_HOST 폐기 / Task_0r5ztlq 제거 → 1 dataset 만)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code lov} 진입점. As-Is BPMN flow:
     * Task_0r5ztlq (selectAppHostId) → Task_17ggria (selectMenuId).
     * <b>To-Be 정책 #1</b>: Task_0r5ztlq + selectAppHostId 폐기 → selectMenuId 1 Task 만 (Q-015 closed — 본 namespace 내재화).
     *
     * <p>처리: {@link SecRoleMappingNativeRepository#findAllMenuIdLov()} 호출 후
     * {@code ds_lovMenuId} key 의 List&lt;Map&gt; 반환 → cactus 가 {@code grids.ds_lovMenuId.rows} 로 응답.
     */
    public Map<String, Object> lov() {
        List<Map<String, Object>> menuLov = secRoleMappingNativeRepository.findAllMenuIdLov();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_lovMenuId", menuLov);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchObjectLov — sub2 OBJECT-LoV (round-2 fix / Q-016 closed)
    // As-Is xfdl:321~336 commonDynamic_onload "csa::CommMenuMng/commonList" 본 namespace 내재화
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchObjectLov} 진입점 (round-2 fix 2026-06-02 / Q-016 closed).
     *
     * <p>As-Is xfdl:321~336 {@code div_object_id} 의 {@code commonDynamic_onload}
     * (service="commonList", URL="csa::CommMenuMng", dataset="ds_menuObjLst",
     * 검색 조건명="edt_OBJECT_ID") 호출을 본 화면 namespace 안에서 내재화.
     *
     * <p>처리: {@link SecRoleMappingNativeRepository#searchObjectLov(String)} 호출 후
     * {@code ds_menuObjLst} key 의 List&lt;Map&gt; 반환 → cactus 가 응답에 적재.
     *
     * <p>응답 5 컬럼 (As-Is selectMenuObjPop xml:161~168): OBJECT_ID / OBJECT_NM / SERVICE / FORM_URL / PARAM.
     * As-Is xfdl 인자에 명시된 응답 컬럼 (OBJECT_ID, OBJECT_NM, FORM_URL) 은 본 응답 5 컬럼의 부분집합.
     */
    public Map<String, Object> searchObjectLov(CommRoleMngSearchObjectLovRequest request) {
        String edtObjectId = request != null ? request.getEdtOBJECTID() : null;
        List<Map<String, Object>> rows = secRoleMappingNativeRepository.searchObjectLov(edtObjectId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_menuObjLst", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — As-Is selectCommRole SELECT 결과 컬럼명 (SNAKE_CASE) 보존
    // ────────────────────────────────────────────────────────────────

    /**
     * As-Is {@code selectCommRole} (xml:7~37) 응답 row 조립 — 본 7 컬럼 (BIZ_SYSTEM_CODE 폐기) +
     * ROLE_GROUP_ID (scalar subquery) + ID (ROLE_ID 의 마지막 `_` 이후 — As-Is SUBSTR/INSTR(_,-1,1) 등가).
     *
     * <p>응답 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-002) 보존.
     */
    private Map<String, Object> toSearchRow(SecRole r) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ROLE_ID", r.getRoleId());
        row.put("ROLE_NM", r.getRoleNm());
        row.put("ROLE_DESC", r.getRoleDesc());
        row.put("MENU_ID", r.getMenuId());
        row.put("USE_TP", r.getUseTp());
        row.put("START_ACTIVE_DATE", r.getStartActiveDate());
        row.put("END_ACTIVE_DATE", r.getEndActiveDate());
        // ROLE_GROUP_ID scalar subquery — As-Is xml:14~18
        row.put("ROLE_GROUP_ID", secRoleRepository.findOneRoleGroupIdByRoleId(r.getRoleId()));
        // ID = ROLE_ID 의 마지막 "_" 이후 — As-Is xml:20 SUBSTR/INSTR(_,-1,1)+1 등가
        row.put("ID", extractIdFromRoleId(r.getRoleId()));
        return row;
    }

    /**
     * As-Is {@code SUBSTR(A.ROLE_ID, INSTR(A.ROLE_ID,'_',-1,1)+1, LENGTH(A.ROLE_ID))} (xml:20) Java 등가.
     * <p>ROLE_ID 의 <b>마지막</b> '_' 이후 토큰 추출. '_' 없으면 전체 반환 (As-Is INSTR 0 → SUBSTR(_, 2, _) 와 mismatch — Java 보수 처리).
     */
    private static String extractIdFromRoleId(String roleId) {
        if (roleId == null) return null;
        int idx = roleId.lastIndexOf('_');
        if (idx < 0) return roleId;
        return roleId.substring(idx + 1);
    }

    private static String strOf(Object o) { return o == null ? null : String.valueOf(o); }

    /**
     * Map row 의 date 값 → {@link LocalDateTime} 변환 (W1·W2 정본 패턴).
     * 지원 입력 type: {@link LocalDateTime} 직접 / {@link String} "yyyy-MM-dd[ HH:mm:ss]" / "yyyyMMdd" 8자 / null → fallback.
     */
    private static LocalDateTime parseLocalDateTime(Object v, LocalDateTime fallback) {
        if (v == null) return fallback;
        if (v instanceof LocalDateTime ldt) return ldt;
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equals(s)) return fallback;
        try {
            if (s.length() == 8 && s.matches("\\d{8}")) {
                // "yyyyMMdd" → 자정 (As-Is xfdl:695 default "99991231" 정합)
                return LocalDateTime.parse(
                        s.substring(0, 4) + "-" + s.substring(4, 6) + "-" + s.substring(6, 8) + "T00:00:00");
            }
            if (s.length() == 10) {
                return LocalDateTime.parse(s + "T00:00:00");
            }
            if (s.contains(" ")) {
                return LocalDateTime.parse(s.replace(' ', 'T'));
            }
            return LocalDateTime.parse(s);
        } catch (Exception e) {
            log.warn("[commRoleMng.parseLocalDateTime] parse failed value={} — fallback", s);
            return fallback;
        }
    }
}
