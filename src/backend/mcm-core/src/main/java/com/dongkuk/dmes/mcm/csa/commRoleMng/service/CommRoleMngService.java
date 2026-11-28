/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleMng OASIS BPMN serviceTask entry point — 6 action (W3)
 *       searchCmRole / saveCmRole / searchCmRoleMap / saveCmRoleMap / searchCmPerm / lov
 * 수정: 2026-11-27 @jongik-sv — 퍼미션 모델 v2(TB_MCM_SEC_ROLE_PERM). 집계 칸·searchRoleGroups·searchFolderObj 추가,
 *       searchCmRoleMap·saveCmRoleMap 을 새 퍼미션 표로 바꿈(옛 매핑 표 쓰기 중단), lov 에 폴더 목록 추가
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngRoleRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchObjectLovRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchPermRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.dto.CommRoleMngSearchRoleMapRequest;
import com.dongkuk.dmes.mcm.csa.commRoleMng.query.CommRoleMngQuery;
import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRole;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.entity.SecRolePermId;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingNativeRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;

/**
 * commRoleMng — OASIS BPMN serviceTask entry point (W3 / csa 9 화면 3번째).
 *
 * <p>Spring bean name {@code commRoleMngService} → BPMN {@code <camunda:class>commRoleMngService</camunda:class>}.
 *
 * <p>BPMN action 7 (As-Is 8 → To-Be 7 — 분석 §11 #11 / BPMN §1.3 / round-2 fix 2026-06-02):
 * <ol>
 *   <li>{@code searchCmRole}     → {@link #searchCmRole(CommRoleMngSearchRequest)} — 역할 마스터 그리드 조회 (selectCommRole)</li>
 *   <li>{@code saveCmRole}       → {@link #saveCmRole(List)} — 역할 마스터 일괄 저장 (rowStatus 분기 inserted/updated/deleted) + NOT EXISTS 검증</li>
 *   <li>{@code searchCmRoleMap}  → {@link #searchCmRoleMap(CommRoleMngSearchRoleMapRequest)} — 이 역할의 퍼미션(TB_MCM_SEC_ROLE_PERM, 2026-11-27)</li>
 *   <li>{@code saveCmRoleMap}    → {@link #saveCmRoleMap(CommRoleMngRoleRequest, List)} — 이 역할의 퍼미션 저장 MERGE|DEL (2026-11-27)</li>
 *   <li>{@code searchRoleGroups} → {@link #searchRoleGroups(CommRoleMngRoleRequest)} — 들어 있는 그룹 (2026-11-27)</li>
 *   <li>{@code searchFolderObj}  → {@link #searchFolderObj(CommRoleMngRoleRequest)} — 메뉴 폴더의 오브젝트 (2026-11-27)</li>
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
 * selectCommPerm NOT EXISTS / selectMenuId lov 는 모두 read-only →
 * {@link SecRoleMappingNativeRepository} native query 어댑터 + Service 후처리로 처리.
 * 퍼미션 모델 v2 읽기(2026-11-27)는 {@link CommPermQueryRepository}(공용) · {@link CommRoleMngQuery}(이 화면) 가 맡는다.
 * Entity {@link SecRole} / {@link SecRolePerm} 는 save / delete 트랜잭션에만 사용(2026-11-27 옛 SecRoleMapping 쓰기 중단).
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

    /** 퍼미션 값(BTN·POPUP·DATA) 최대 길이 — TB_MCM_SEC_ROLE_PERM VARCHAR(1000). */
    private static final int PERM_VALUE_MAX = 1000;

    /** SYSADMIN 퍼미션 수 표시 값(= 「모두」, 퍼미션 행 없이 계산 — D13). */
    private static final long SYSADMIN_PERM_CNT = -1L;

    private final SecRoleRepository secRoleRepository;
    private final SecRoleMappingNativeRepository secRoleMappingNativeRepository;
    private final SecRolePermRepository secRolePermRepository;
    private final SecObjRepository secObjRepository;
    private final CommPermQueryRepository commPermQueryRepository;
    private final CommRoleMngQuery commRoleMngQuery;
    private final ApplicationEventPublisher eventPublisher;
    private final SysadminGuard sysadminGuard;

    public CommRoleMngService(SecRoleRepository secRoleRepository,
                              SecRoleMappingNativeRepository secRoleMappingNativeRepository,
                              SecRolePermRepository secRolePermRepository,
                              SecObjRepository secObjRepository,
                              CommPermQueryRepository commPermQueryRepository,
                              CommRoleMngQuery commRoleMngQuery,
                              ApplicationEventPublisher eventPublisher,
                              SysadminGuard sysadminGuard) {
        this.sysadminGuard = sysadminGuard;
        this.secRoleRepository = secRoleRepository;
        this.secRoleMappingNativeRepository = secRoleMappingNativeRepository;
        this.secRolePermRepository = secRolePermRepository;
        this.secObjRepository = secObjRepository;
        this.commPermQueryRepository = commPermQueryRepository;
        this.commRoleMngQuery = commRoleMngQuery;
        this.eventPublisher = eventPublisher;
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
     *   <li>각 row 에 ROLE_GROUP_ID scalar subquery + ID (= ROLE_ID 전체, z2fix2 — 옛 마지막 `_` 자르기 없앰) 부착</li>
     *   <li>{@code ds_main} key 의 List&lt;Map&gt; 반환 → cactus 가 {@code grids.ds_main.rows} 로 응답</li>
     * </ol>
     *
     * <p>응답 row 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-002) 보존 — FE 가 As-Is {@code ds_main} 의 컬럼명을 사용.
     *
     * <p>2026-11-27 집계 칸 추가: GROUP_CNT(들어 있는 그룹 수) · USER_CNT(받는 사람 수, 그룹 겹침 제외) ·
     * PERM_CNT(퍼미션 수, SYSADMIN = -1). 집계는 호출마다 한 번씩만 읽는다.
     */
    public Map<String, Object> searchCmRole(CommRoleMngSearchRequest request) {
        String pRoleId = request != null ? request.getEdtROLEID() : null;
        String pRoleNm = request != null ? request.getEdtROLENM() : null;
        String pUseTp  = request != null ? request.getCboUSETP()  : null;

        List<SecRole> rows = secRoleRepository.searchByFilter(pRoleId, pRoleNm, pUseTp);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", toSearchRows(rows));
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
     * 2026-11-27 새 퍼미션 검사 덧붙임: {@link SecRolePermRepository#countByRoleId(String)} &gt; 0 이어도 silent skip.
     *
     * <p>캐시(D30): 기존 역할의 USE_TP·유효 기간이 바뀌었거나 실제로 지운 역할이 있으면 {@link RoleChangedEvent} 를 발행한다.
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — As-Is fn_callBack saveCmRole 의 fn_search 자동 재호출 정합).
     */
    public Map<String, Object> saveCmRole(List<Map<String, Object>> master) {
        requireRoleNames(master);
        requireDeletableRoles(master);
        // c5 d — SYSADMIN 역할 끄기·기간 줄이기가 마지막 시스템관리자를 없애면 거절. 쓰기 전에 잠근다.
        SysadminGuard.Check sysadminCheck = touchesSysadminRole(master) ? sysadminGuard.begin(SysadminGuard.PERM_BUSY) : null;
        int cnt = 0;
        Set<String> changedRoleIds = new LinkedHashSet<>(); // 캐시 무효화 대상(USE_TP·유효 기간 변경·삭제)
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
                    long rolePermCnt = secRolePermRepository.countByRoleId(roleId); // 새 퍼미션 표(v2)
                    if (roleGrpCnt > 0 || roleMapCnt > 0 || rolePermCnt > 0) {
                        log.warn("[commRoleMng.saveCmRole] delete blocked — ROLE_ID={} roleGroupMapping={} roleMapping={} rolePerm={} (silent skip)",
                                 roleId, roleGrpCnt, roleMapCnt, rolePermCnt);
                        continue;
                    }
                    if (secRoleRepository.existsById(roleId)) {
                        secRoleRepository.deleteById(roleId);
                        cnt++;
                        changedRoleIds.add(roleId);
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    SecRole entity = secRoleRepository.findById(roleId).orElseGet(SecRole::new);
                    boolean isNew = entity.getRoleId() == null;
                    // 바뀌기 전 값(엔티티가 영속 상태라 setter 가 덮어쓰므로 먼저 잡는다)
                    String oldUseTp = entity.getUseTp();
                    LocalDateTime oldStart = entity.getStartActiveDate();
                    LocalDateTime oldEnd = entity.getEndActiveDate();
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
                    if (!isNew && (!Objects.equals(oldUseTp, entity.getUseTp())
                                   || !Objects.equals(oldStart, entity.getStartActiveDate())
                                   || !Objects.equals(oldEnd, entity.getEndActiveDate()))) {
                        changedRoleIds.add(roleId);
                    }
                } else {
                    log.warn("[commRoleMng.saveCmRole] unknown status={} — skip", status);
                }
            }
        }
        if (sysadminCheck != null) {
            sysadminCheck.verify(SysadminGuard.LAST_SYSADMIN, SysadminGuard.LAST_MSG,
                    SysadminGuard.SELF_LOCKOUT, SysadminGuard.SELF_ROLE_MSG);
        }
        if (!changedRoleIds.isEmpty()) {
            eventPublisher.publishEvent(new RoleChangedEvent(changedRoleIds));
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:472~477 fn_msgSuccessSave → fn_search() 재호출 정합)
        List<SecRole> rows = secRoleRepository.findAll();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", toSearchRows(rows));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchRoleGroups — 이 역할이 들어 있는 그룹(퍼미션 모델 v2, 2026-11-27)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchRoleGroups} 진입점. params {@code roleId}.
     *
     * <p>응답: grids {@code groups}(ROLE_GROUP_ID · ROLE_GROUP_NM · USE_TP · USER_CNT, 그룹 USE_TP 무관) +
     * data {@code USER_CNT}(사용 중 그룹 기준, 그룹 겹침 뺀 사람 수). 빈 roleId = 빈 목록 · 0.
     */
    public Map<String, Object> searchRoleGroups(CommRoleMngRoleRequest request) {
        String roleId = request != null ? request.getRoleId() : null;
        boolean blank = roleId == null || roleId.isBlank();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("groups", blank ? new ArrayList<>() : commPermQueryRepository.groupsOfRole(roleId));
        out.put("USER_CNT", blank ? 0L : commPermQueryRepository.distinctUserCnt(List.of(roleId)));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmRoleMap — 이 역할의 퍼미션(TB_MCM_SEC_ROLE_PERM, 2026-11-27 옛 3-table JOIN 대체)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmRoleMap} 진입점. params {@code roleId}(옛 키 {@code ROLE_ID} 도 받는다).
     *
     * <p>응답: grids {@code perms} — ROLE_ID · OBJECT_ID · OBJECT_NM · MENU_FOLDER_ID · MENU_PATH · MENU_NM ·
     * OBJ_BTN_PERM · OBJ_POPUP_PERM · OBJ_READ_PERM · BTN_PERM · POPUP_PERM · DATA_PERM.
     * MENU_* = 오브젝트의 대표 메뉴({@link CommPermQueryRepository#objMenus()}). 정렬 = 메뉴 트리 순서(메뉴 없는 것 끝) → OBJECT_ID.
     * 옛 {@code ds_roleMap} 은 더 내지 않는다. SYSADMIN 은 퍼미션 행이 없어 빈 목록이다(D13).
     */
    public Map<String, Object> searchCmRoleMap(CommRoleMngSearchRoleMapRequest request) {
        String roleId = trimToNull(request != null ? request.getRoleId() : null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("perms", rolePermRows(roleId));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmRoleMap — 이 역할의 퍼미션 저장 MERGE|DEL (2026-11-27 옛 매핑 INSERT/DELETE 대체)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmRoleMap} 진입점. params {@code roleId} + grids {@code perms}
     * (ROLE_ID · OBJECT_ID · BTN_PERM · POPUP_PERM · DATA_PERM · OP_TP MERGE|DEL, D36).
     *
     * <p>모든 줄을 먼저 검사하고, 하나라도 틀리면 아무것도 쓰지 않고 {@link BusinessException} 을 던진다.
     * BusinessException 은 메시지만 받으므로 메시지가 오류 코드로 시작한다.
     * <ul>
     *   <li>params roleId 빔 · OBJECT_ID 빔 · OP_TP 모름 · 같은 PK 두 줄 → {@code PERM_BAD_ROW}</li>
     *   <li>줄의 ROLE_ID ≠ params roleId → {@code PERM_ROLE_MISMATCH}</li>
     *   <li>없는 역할 → {@code PERM_NO_ROLE} · 없는 오브젝트(MERGE) → {@code PERM_NO_OBJ}</li>
     *   <li>SYSADMIN 역할 → {@code PERM_SYSADMIN}(퍼미션 행 없이 계산 — D13)</li>
     *   <li>정규화한 BTN 빔(MERGE) → {@code PERM_EMPTY_BTN}(D14)</li>
     *   <li>BTN ⊄ 오브젝트 BTN 허용 값 · POPUP ⊄ 오브젝트 POPUP 허용 값 → {@code PERM_NOT_IN_OBJ}(D15)</li>
     *   <li>값 1000자 초과 → {@code PERM_TOO_LONG}</li>
     * </ul>
     * ROLE_ID·OBJECT_ID 는 앞뒤 공백을 지운다. MERGE = PK(ROLE_ID, OBJECT_ID) upsert, DEL = 있으면 지움. 옛 {@code TB_MCM_SEC_ROLE_MAPPING} 에는 쓰지 않는다(D10).
     *
     * <p>반환: data {@code cnt_merge} · {@code cnt_delete}. 바뀐 것이 있으면 {@link RoleChangedEvent}({roleId}) 발행(D30).
     */
    public Map<String, Object> saveCmRoleMap(CommRoleMngRoleRequest request, List<Map<String, Object>> perms) {
        String roleId = trimToNull(request != null ? request.getRoleId() : null);
        if (roleId == null) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: params roleId 가 비었습니다");
        }
        if (CommPermQueryRepository.isSysadmin(roleId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_SYSADMIN: " + roleId + " 역할은 퍼미션 없이 모든 권한을 가집니다(저장 불가)");
        }
        if (!secRoleRepository.existsById(roleId)) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NO_ROLE: 없는 역할입니다 (" + roleId + ")");
        }

        // 1) 검사 — 쓰기 전에 모든 줄을 본다. 값 null = DEL, 아니면 MERGE 할 줄. 같은 PK 두 줄 = PERM_BAD_ROW
        Map<SecRolePermId, SecRolePerm> ops = new LinkedHashMap<>();
        Map<String, SecObj> objCache = new HashMap<>();
        if (perms != null) {
            for (Map<String, Object> row : perms) {
                if (row == null) continue;
                String rowRoleId = trimToNull(strOf(row.get("ROLE_ID")));
                String objectId = trimToNull(strOf(row.get("OBJECT_ID")));
                String opTp = strOf(row.get("OP_TP"));
                if (!roleId.equals(rowRoleId)) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_ROLE_MISMATCH: 줄 ROLE_ID=" + rowRoleId + " ≠ params roleId=" + roleId);
                }
                if (objectId == null) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: " + roleId + " 줄의 OBJECT_ID 가 비었습니다");
                }
                String key = roleId + "/" + objectId;
                SecRolePermId pk = new SecRolePermId(roleId, objectId);
                if (ops.containsKey(pk)) {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: 같은 ROLE_ID·OBJECT_ID 가 한 번에 두 번 왔습니다 (" + key + ")");
                }
                String op = opTp == null ? "" : opTp.trim().toUpperCase(Locale.ROOT);
                if ("DEL".equals(op)) {
                    ops.put(pk, null);
                } else if ("MERGE".equals(op)) {
                    SecObj obj = objCache.computeIfAbsent(objectId, id -> secObjRepository.findById(id).orElse(null));
                    if (obj == null) {
                        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NO_OBJ: " + key + " 오브젝트가 없습니다");
                    }
                    List<String> btn = PermTokens.parse(strOf(row.get("BTN_PERM")));
                    List<String> popup = PermTokens.parse(strOf(row.get("POPUP_PERM")));
                    List<String> data = PermTokens.parse(strOf(row.get("DATA_PERM")));
                    if (btn.isEmpty()) {
                        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_EMPTY_BTN: " + key + " 버튼 권한이 비었습니다");
                    }
                    List<String> badBtn = PermTokens.notIn(btn, PermTokens.parse(obj.getBtnPerm()));
                    List<String> badPopup = PermTokens.notIn(popup, PermTokens.parse(obj.getPopupPerm()));
                    if (!badBtn.isEmpty() || !badPopup.isEmpty()) {
                        throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_NOT_IN_OBJ: " + key + " btn=" + badBtn + " popup=" + badPopup);
                    }
                    String btnStr = checkLength(key, "BTN_PERM", PermTokens.join(btn));
                    String popupStr = checkLength(key, "POPUP_PERM", PermTokens.join(popup));
                    String dataStr = checkLength(key, "DATA_PERM", PermTokens.join(data));
                    ops.put(pk, new SecRolePerm(roleId, objectId, btnStr,
                            popupStr.isEmpty() ? null : popupStr, dataStr.isEmpty() ? null : dataStr));
                } else {
                    throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_BAD_ROW: " + key + " OP_TP=" + opTp + " (MERGE|DEL)");
                }
            }
        }

        // 2) 쓰기 — 검사를 모두 통과한 뒤에만(전부 또는 없음)
        int cntMerge = 0;
        int cntDelete = 0;
        boolean changed = false;
        for (Map.Entry<SecRolePermId, SecRolePerm> e : ops.entrySet()) {
            SecRolePerm m = e.getValue();
            if (m == null) {
                if (secRolePermRepository.existsById(e.getKey())) {
                    secRolePermRepository.deleteById(e.getKey());
                    cntDelete++;
                    changed = true;
                }
                continue;
            }
            SecRolePerm entity = secRolePermRepository.findById(m.id()).orElse(null);
            if (entity == null) {
                secRolePermRepository.save(m);
                changed = true;
            } else {
                if (!Objects.equals(entity.getBtnPerm(), m.getBtnPerm())
                    || !Objects.equals(entity.getPopupPerm(), m.getPopupPerm())
                    || !Objects.equals(entity.getDataPerm(), m.getDataPerm())) {
                    changed = true;
                }
                entity.setBtnPerm(m.getBtnPerm());
                entity.setPopupPerm(m.getPopupPerm());
                entity.setDataPerm(m.getDataPerm());
                secRolePermRepository.save(entity);
            }
            cntMerge++;
        }
        if (changed) {
            eventPublisher.publishEvent(new RoleChangedEvent(Set.of(roleId)));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cntMerge);
        out.put("cnt_delete", cntDelete);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchFolderObj — 메뉴 폴더의 오브젝트(「메뉴에서 오브젝트 추가」 후보, 2026-11-27)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchFolderObj} 진입점. params {@code roleId} · {@code menuFolderId}.
     *
     * <p>폴더와 그 아래 모든 폴더 바로 밑 화면 메뉴가 가리키는 오브젝트({@link CommRoleMngQuery#folderObjects(String)}).
     * 빈 menuFolderId = 빈 목록. MENU_NM·MENU_PATH = 고른 폴더 안의 대표 메뉴(WEB 먼저).
     *
     * <p>응답: grids {@code objs} — OBJECT_ID · OBJECT_NM · MENU_NM · MENU_FOLDER_ID · MENU_PATH · OBJ_BTN_PERM · OBJ_POPUP_PERM ·
     * OBJ_READ_PERM · USE_TP · HAS_PERM(Y = 이 역할에 퍼미션 있음). 정렬 = 메뉴 트리 순서 → OBJECT_ID.
     */
    public Map<String, Object> searchFolderObj(CommRoleMngRoleRequest request) {
        String roleId = trimToNull(request != null ? request.getRoleId() : null);
        String menuFolderId = trimToNull(request != null ? request.getMenuFolderId() : null);
        List<Map<String, Object>> objs = new ArrayList<>();
        List<Map<String, Object>> raw = commRoleMngQuery.folderObjects(menuFolderId); // 하위 트리는 SQL 안에서 푼다
        if (!raw.isEmpty()) {
            // 폴더 경로·트리 순서 = folderLov 순서(트리 순서로 정렬되어 온다)
            Map<String, String> folderPath = new HashMap<>();
            Map<String, Integer> folderOrder = new HashMap<>();
            List<Map<String, Object>> folders = commPermQueryRepository.folderLov();
            for (int i = 0; i < folders.size(); i++) {
                String id = strOf(folders.get(i).get("MENU_ID"));
                folderPath.put(id, strOf(folders.get(i).get("MENU_PATH")));
                folderOrder.put(id, i);
            }
            Set<String> permObjIds = new HashSet<>();
            if (roleId != null) {
                for (SecRolePerm p : secRolePermRepository.findByRoleId(roleId)) permObjIds.add(p.getObjectId());
            }
            raw.sort(Comparator
                    .comparing((Map<String, Object> r) -> folderOrder.getOrDefault(strOf(r.get("MENU_FOLDER_ID")), Integer.MAX_VALUE))
                    .thenComparing(r -> Objects.toString(r.get("MENU_SORT"), ""))
                    .thenComparing(r -> Objects.toString(r.get("OBJECT_ID"), "")));
            for (Map<String, Object> r : raw) {
                String objectId = strOf(r.get("OBJECT_ID"));
                String objBtn = strOf(r.get("OBJ_BTN_PERM"));
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("OBJECT_ID", objectId);
                m.put("OBJECT_NM", r.get("OBJECT_NM"));
                m.put("MENU_NM", r.get("MENU_NM"));
                m.put("MENU_FOLDER_ID", r.get("MENU_FOLDER_ID"));
                m.put("MENU_PATH", folderPath.get(strOf(r.get("MENU_FOLDER_ID"))));
                m.put("OBJ_BTN_PERM", objBtn);
                m.put("OBJ_POPUP_PERM", r.get("OBJ_POPUP_PERM"));
                m.put("OBJ_READ_PERM", readPreset(objBtn));
                m.put("USE_TP", r.get("USE_TP"));
                m.put("HAS_PERM", permObjIds.contains(objectId) ? "Y" : "N");
                objs.add(m);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("objs", objs);
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
     *
     * <p>2026-11-27 grids {@code menus} 추가 — 메뉴 폴더 고르기 목록({@link CommPermQueryRepository#folderLov()},
     * MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_LV · MENU_PATH).
     */
    public Map<String, Object> lov() {
        List<Map<String, Object>> menuLov = secRoleMappingNativeRepository.findAllMenuIdLov();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_lovMenuId", menuLov);
        out.put("menus", commPermQueryRepository.folderLov());
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

    /** 역할 목록 → 응답 줄. 집계 3종(그룹 수·사람 수·퍼미션 수)은 여기서 한 번씩만 읽는다. */
    private List<Map<String, Object>> toSearchRows(List<SecRole> roles) {
        Map<String, Long> groupCnt = commPermQueryRepository.groupCntByRole();
        Map<String, Long> userCnt = commPermQueryRepository.userCntByRole();
        Map<String, Long> permCnt = commPermQueryRepository.permCntByRole();
        List<Map<String, Object>> outRows = new ArrayList<>(roles.size());
        for (SecRole r : roles) {
            Map<String, Object> row = toSearchRow(r);
            String roleId = r.getRoleId();
            row.put("GROUP_CNT", groupCnt.getOrDefault(roleId, 0L));
            row.put("USER_CNT", userCnt.getOrDefault(roleId, 0L));
            row.put("PERM_CNT", CommPermQueryRepository.isSysadmin(roleId) ? SYSADMIN_PERM_CNT : permCnt.getOrDefault(roleId, 0L));
            outRows.add(row);
        }
        return outRows;
    }

    /**
     * 역할 한 개의 퍼미션 줄(searchCmRoleMap 응답). 메뉴 칸은 대표 메뉴, 정렬 = 메뉴 트리 순서(메뉴 없는 것 끝) → OBJECT_ID.
     * 퍼미션 값 칸은 토큰 정규화한다(commPermMng 와 같음, null = "").
     */
    private List<Map<String, Object>> rolePermRows(String roleId) {
        List<Map<String, Object>> raw = commRoleMngQuery.rolePerms(roleId);
        if (raw.isEmpty()) return raw;
        Map<String, CommPermQueryRepository.ObjMenu> menus = commPermQueryRepository.objMenus();
        List<Map<String, Object>> out = new ArrayList<>(raw.size());
        for (Map<String, Object> r : raw) {
            String objectId = strOf(r.get("OBJECT_ID"));
            CommPermQueryRepository.ObjMenu menu = menus.get(objectId);
            String objBtn = strOf(r.get("OBJ_BTN_PERM"));
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("ROLE_ID", r.get("ROLE_ID"));
            m.put("OBJECT_ID", objectId);
            m.put("OBJECT_NM", r.get("OBJECT_NM"));
            m.put("MENU_FOLDER_ID", menu != null ? menu.folderId() : null);
            m.put("MENU_PATH", menu != null ? menu.folderPath() : null);
            m.put("MENU_NM", menu != null ? menu.menuNm() : null);
            m.put("OBJ_BTN_PERM", norm(objBtn));
            m.put("OBJ_POPUP_PERM", norm(strOf(r.get("OBJ_POPUP_PERM"))));
            m.put("OBJ_READ_PERM", readPreset(objBtn));
            m.put("BTN_PERM", norm(strOf(r.get("BTN_PERM"))));
            m.put("POPUP_PERM", norm(strOf(r.get("POPUP_PERM"))));
            m.put("DATA_PERM", norm(strOf(r.get("DATA_PERM"))));
            out.add(m);
        }
        out.sort(Comparator
                .comparing((Map<String, Object> m) -> {
                    CommPermQueryRepository.ObjMenu menu = menus.get(strOf(m.get("OBJECT_ID")));
                    return menu == null || menu.sortKey() == null ? null : menu.sortKey();
                }, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(m -> Objects.toString(m.get("OBJECT_ID"), "")));
        return out;
    }

    /** 「조회만」 프리셋(D18) = 오브젝트 BTN 허용 값 중 읽기 이름 규칙에 맞는 것. */
    private static String readPreset(String objBtnPerm) {
        return PermTokens.join(PermTokens.readPreset(PermTokens.parse(objBtnPerm)));
    }

    /** 토큰 정규화(trim·빈 값·중복 제거). null·빈 값 = "". */
    private static String norm(String csv) {
        return PermTokens.join(PermTokens.parse(csv));
    }

    private static String trimToNull(String v) {
        if (v == null) return null;
        String s = v.trim();
        return s.isEmpty() ? null : s;
    }

    /** 정규화한 퍼미션 값 길이 검사(1000자). */
    private static String checkLength(String key, String column, String value) {
        if (value.length() > PERM_VALUE_MAX) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_TOO_LONG: " + key + " " + column + " 가 " + PERM_VALUE_MAX + "자를 넘습니다(" + value.length() + "자)");
        }
        return value;
    }

    /**
     * As-Is {@code selectCommRole} (xml:7~37) 응답 row 조립 — 본 7 컬럼 (BIZ_SYSTEM_CODE 폐기) +
     * ROLE_GROUP_ID (scalar subquery) + ID (= ROLE_ID 전체, z2fix2).
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
        // ID = ROLE_ID 전체(z2fix2 c — 옛 「마지막 _ 이후」 자르기는 role_MN_MPP_WORK_VIEW 를 VIEW 로 보여 없앴다)
        row.put("ID", r.getRoleId());
        return row;
    }

    /**
     * 저장 전 검사(z2fix2 d): 추가·수정 줄은 ROLE_NM 이 있어야 한다. 하나라도 비면 아무것도 쓰지 않고
     * {@code ROLE_NM_REQUIRED: 상세} 로 거절한다(메시지 앞 코드로 FE 가 구분). 삭제 줄·ROLE_ID 없는 줄(건너뜀)은 보지 않는다.
     */
    private static String statusOf(Map<String, Object> row) {
        String status = strOf(row.get("rowStatus"));
        return status == null || status.isBlank() ? strOf(row.get("!nativeeditor_status")) : status;
    }

    /**
     * 저장 전 검사(perm-crudfix c4): 삭제 줄의 역할이 쓰이는 중이면(그룹·퍼미션·옛 매핑) 아무것도 쓰지 않고
     * {@code ROLE_IN_USE: <역할ID> …} 로 거절한다. SYSADMIN 역할(별칭 포함)은 쓰이지 않아도 지울 수 없다
     * (퍼미션 행 없이 모든 권한 — 쓰는 곳 수로 판정할 수 없다). 옛 동작 = 조용히 건너뜀(「역할 0건 저장」).
     */
    private void requireDeletableRoles(List<Map<String, Object>> master) {
        if (master == null) return;
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String status = statusOf(row);
            if (!"deleted".equals(status) && !"D".equals(status)) continue;
            String roleId = strOf(row.get("ROLE_ID"));
            if (roleId == null || roleId.isBlank()) continue;
            if (CommPermQueryRepository.isSysadmin(roleId)) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR,
                        "ROLE_IN_USE: " + roleId + " 시스템관리자 역할은 지울 수 없습니다");
            }
            // countRoleMappingByRoleId 도 지금은 TB_MCM_SEC_ROLE_PERM 을 센다(퍼미션 모델 v2) — 같은 수라 퍼미션 수 하나만 쓴다
            long grpCnt = secRoleRepository.countRoleGroupMappingByRoleId(roleId);
            long permCnt = secRolePermRepository.countByRoleId(roleId);
            if (grpCnt > 0 || permCnt > 0) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ROLE_IN_USE: " + roleId + " 퍼미션 " + permCnt
                        + "건·그룹 " + grpCnt + "개에서 쓰는 역할이라 지울 수 없습니다");
            }
        }
    }

    /**
     * SYSADMIN 역할(별칭 포함)을 쓰는 줄이 있나 — 끄거나 기간을 줄이면 보유자가 줄 수 있다(c5 d).
     * 「inserted」 줄도 본다: 저장은 있는 행이면 덮어쓰고(findById.orElseGet), 매핑만 있는 별칭 행을 새로 넣어 끌 수도 있다.
     */
    private static boolean touchesSysadminRole(List<Map<String, Object>> master) {
        if (master == null) return false;
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String status = statusOf(row);
            boolean write = "updated".equals(status) || "U".equals(status) || "inserted".equals(status) || "C".equals(status);
            if (write && CommPermQueryRepository.isSysadmin(strOf(row.get("ROLE_ID")))) {
                return true;
            }
        }
        return false;
    }

    private static void requireRoleNames(List<Map<String, Object>> master) {
        if (master == null) return;
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String status = strOf(row.get("rowStatus"));
            if (status == null || status.isBlank()) {
                status = strOf(row.get("!nativeeditor_status"));
            }
            boolean write = "inserted".equals(status) || "C".equals(status) || "updated".equals(status) || "U".equals(status);
            String roleId = strOf(row.get("ROLE_ID"));
            if (!write || roleId == null || roleId.isBlank()) continue;
            String roleNm = strOf(row.get("ROLE_NM"));
            if (roleNm == null || roleNm.isBlank()) {
                throw new BusinessException(ErrorCode.BUSINESS_ERROR, "ROLE_NM_REQUIRED: 역할명은 필수 입력입니다 (" + roleId + ")");
            }
        }
    }

}
