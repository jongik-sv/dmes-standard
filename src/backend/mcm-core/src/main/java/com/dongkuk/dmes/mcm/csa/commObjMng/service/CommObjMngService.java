/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commObjMng OASIS BPMN serviceTask entry point — 3 action (searchCmObj / saveCmObj / lov) 분기
 */
package com.dongkuk.dmes.mcm.csa.commObjMng.service;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.dto.CommObjMngObjRequest;
import com.dongkuk.dmes.mcm.csa.commObjMng.dto.CommObjMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commObjMng.query.CommObjMngQuery;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.entity.SecRolePerm;
import com.dongkuk.dmes.mcm.repository.CommPermQueryRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.security.perm.PermTokens;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;
import static com.dongkuk.dmes.mcm.common.util.McmValues.blankToNullTrim;

/**
 * commObjMng — OASIS BPMN serviceTask entry point.
 *
 * <p>Spring bean name {@code commObjMngService} → BPMN
 * {@code <camunda:class>commObjMngService</camunda:class>}.
 *
 * <p>BPMN action 3 (As-Is enum 보존 — 분석 §1 / 기능 §5.2 / BPMN §1.1):
 * <ol>
 *   <li>{@code searchCmObj} → {@link #searchCmObj(CommObjMngSearchRequest)} — OBJECT 그리드 조회</li>
 *   <li>{@code saveCmObj} → {@link #saveCmObj(List)} — OBJECT 일괄 저장 (status 분기 inserted/updated/deleted) + NOT EXISTS 검증</li>
 *   <li>{@code lov} → {@link #lov()} — MENU_ID lov (To-Be 정책 #1: APP_HOST_ID 폐기 → MENU_ID 1 dataset 만)</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
 *
 * <p>가이드 §6-A-1 (Entity 본 컬럼만) — MENU_ID scalar subquery / ID 계산 / lov 의 read-only join 은
 * native query 또는 row 후처리로 처리. SecObj entity 에 캐싱 ✗.
 *
 * <p>audit 9 컬럼 (C_USR_ID / C_AT / C_SVC_ID / C_PGM_ID / U_USR_ID / U_AT / U_SVC_ID / U_PGM_ID / VER) 은
 * mcm-core {@code McmAuditListener} 가 JPA PrePersist / PreUpdate 콜백으로 자동 채움 — service body 미설정.
 *
 * <p>메뉴 카탈로그 무효화 — OBJECT 저장·삭제에서 실제로 바뀐 행이 있으면 {@link MenuChangedEvent} 를 발행한다
 * ({@code mcm.menu.MenuCatalog}). 본 서비스는 카탈로그로 읽지 않는다.
 *
 * <p>BPMN definition: {@code services/csa/commObjMng/commObjMng.bpmn}.
 */
@Service("commObjMngService")
public class CommObjMngService {

    private static final Logger log = LoggerFactory.getLogger(CommObjMngService.class);

    /**
     * As-Is xfdl:421 행추가 default {@code "99991231"} 8자 (ST-005).
     * <p>2026-06-02 W5 pattern G — AsIs Mapper insertCommObjMng `#{END_ACTIVE_DATE}` 직접 바인딩
     * (TO_DATE 변환 ✗) → Oracle DATE 자동 변환 시 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00}.
     * 모든 START/END_ACTIVE_DATE 도 yyyy-MM-dd 입력값 → atStartOfDay (00:00:00). (W5 commUserMng 정본)
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private final SecObjRepository secObjRepository;
    private final SecMenuFldLovRepository secMenuFldLovRepository;
    private final SecRoleMappingRepository secRoleMappingRepository;
    private final SecRolePermRepository secRolePermRepository;
    private final CommPermQueryRepository commPermQueryRepository;
    private final CommObjMngQuery commObjMngQuery;
    private final ApplicationEventPublisher eventPublisher;

    /** 허용 값(BTN·POPUP·DATA) 한 칸의 최대 길이 — 컬럼 VARCHAR(1000). */
    private static final int PERM_MAX_LEN = 1000;

    /** 허용 값 칸 — 검증 단계에서 정규화한다. */
    private static final List<String> PERM_COLUMNS = List.of("BTN_PERM", "POPUP_PERM", "DATA_PERM");

    /** RoleChangedEvent 에 넣는 SYSADMIN 직무 ID (D13 — 퍼미션 행 없이 계산되는 직무). */
    private static final String SYSADMIN_ROLE = "SYSADMIN";

    public CommObjMngService(SecObjRepository secObjRepository,
                             SecMenuFldLovRepository secMenuFldLovRepository,
                             SecRoleMappingRepository secRoleMappingRepository,
                             SecRolePermRepository secRolePermRepository,
                             CommPermQueryRepository commPermQueryRepository,
                             CommObjMngQuery commObjMngQuery,
                             ApplicationEventPublisher eventPublisher) {
        this.secObjRepository = secObjRepository;
        this.secMenuFldLovRepository = secMenuFldLovRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
        this.secRolePermRepository = secRolePermRepository;
        this.commPermQueryRepository = commPermQueryRepository;
        this.commObjMngQuery = commObjMngQuery;
        this.eventPublisher = eventPublisher;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmObj — OBJECT 그리드 조회 (selectCommObjMng 매핑)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmObj} 진입점. As-Is {@code selectCommObjMng} (xml:7~41) 변환.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecObjRepository#searchByFilter(String, String)} — 본 13 컬럼 (To-Be 정책 #1) 검색</li>
     *   <li>각 row 에 MENU_ID scalar subquery ({@link SecObjRepository#findOneMenuIdByObjectId(String)})
     *       + ID (SUBSTR/INSTR/LEN 등가 — Java {@code substring} / {@code indexOf}) 부착</li>
     *   <li>{@code ds_main} key 의 List<Map> 반환 → cactus 가 {@code grids.ds_main.rows} 로 응답</li>
     * </ol>
     *
     * <p>응답 row 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-001 / §5.1 BPMN §5.1) 보존 —
     * FE 가 As-Is {@code ds_main} 의 컬럼명을 사용.
     */
    public Map<String, Object> searchCmObj(CommObjMngSearchRequest request) {
        String pObjectId = request != null ? request.getEdtOBJECTID() : null;
        String pUseTp = request != null ? request.getCboUSETP() : null;

        List<SecObj> rows = secObjRepository.searchByFilter(pObjectId, pUseTp);

        // 퍼미션 모델 v2 — 메뉴 폴더 조건: 폴더(하위 포함)의 메뉴가 하나라도 가리키는 오브젝트만
        String folderId = request != null ? request.getMenuFolderId() : null;
        if (folderId != null && !folderId.isBlank()) {
            Set<String> inFolder = commObjMngQuery.objectIdsUnderFolder(folderId);
            rows = rows.stream().filter(o -> inFolder.contains(o.getObjectId())).toList();
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", toSearchRows(rows));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmObj — OBJECT 일괄 저장 (status 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask 자동 분기 → To-Be Service for-loop 명시 분기
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmObj} 진입점. As-Is BPMN {@code CommonMultiSaveTask} (insertSqlKey /
     * updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (옛 cma MasterCodeMngService.saveDetail 정본 패턴 — 2026-10-16 걷어냄).
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
     * <p>NOT EXISTS 이중 검증 (deleteCommObjMng 의 server 차단 — xml:101~110 / 분석 §6 #4):
     * 메뉴 참조 0 AND <b>비-SYSADMIN</b> 롤 매핑 0 일 때만 실제 삭제. 위반 시 silent skip
     * (As-Is 동작 보존 — 분석 §10.1 ST-009 / BPMN §4.2). SYSADMIN 자동 매핑(하단)은
     * 시스템 관리분이라 차단 사유에서 제외하고 obj 삭제 시 동반 삭제한다 (2026-07-30).
     *
     * <p>퍼미션 모델 v2 (decompose D13·D15): SYSADMIN 자동 매핑은 없앴다(SYSADMIN 은 퍼미션 행 없이 계산).
     * 허용 값 BTN_PERM·POPUP_PERM·DATA_PERM 을 함께 저장하고, 수정에서 BTN·POPUP 토큰이 빠지거나
     * USE_TP 가 Y→N 이면 영향({@code impacts})만 알린다 — 직무 퍼미션 행은 건드리지 않는다.
     * 쓰기 전에 모든 행의 허용 값을 먼저 검증한다(1000자 초과 = PERM_TOO_LONG, 아무 행도 쓰지 않는다).
     * 오브젝트 추가·삭제, 또는 허용 값·USE_TP·SYSTEM_CODE·유효 기간이 바뀐 수정이 있으면 SYSADMIN(D13)과
     * 그 오브젝트에 퍼미션을 가진 직무들로 {@link RoleChangedEvent} 하나를 발행한다(D30).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — cma 정본 패턴과 정합)
     * + {@code impacts} (OBJECT_ID·KIND·CODE·PERM_CNT·USER_CNT).
     */
    public Map<String, Object> saveCmObj(List<Map<String, Object>> master) {
        int cnt = 0;
        List<Map<String, Object>> impacts = new ArrayList<>();
        // RoleChangedEvent 대상 — 바뀐 행이 하나라도 있으면 SYSADMIN 을 넣는다(D13: SYSADMIN = 사용 중 오브젝트 전부 × 허용 값, D30)
        Set<String> eventRoles = new LinkedHashSet<>();
        // 1단계 — 쓰기 전에 모든 insert·update 행의 허용 값을 정규화·검증한다(PERM_TOO_LONG 이면 아무것도 쓰지 않는다)
        List<Map<String, String>> tokensByRow = validatePermTokens(master);
        if (master != null) {
            for (int i = 0; i < master.size(); i++) {
                Map<String, Object> row = master.get(i);
                if (row == null) continue;
                String status = statusOf(row);
                String objectId = strOf(row.get("OBJECT_ID"));
                if (objectId == null || objectId.isBlank()) {
                    log.warn("[commObjMng.saveCmObj] OBJECT_ID null — skip row (status={})", status);
                    continue;
                }

                if ("deleted".equals(status) || "D".equals(status)) {
                    // NOT EXISTS 이중 검증 (xml:101~110) — SYSADMIN 자동 매핑은 시스템 관리분이라
                    // 차단 사유에서 제외하고 obj 삭제 시 동반 삭제 (2026-07-30 순수 RBAC 전환 D4).
                    long menuCnt = secObjRepository.countMenuByObjectId(objectId);
                    List<SecRoleMapping> objMappings = secRoleMappingRepository.findByObjectId(objectId);
                    long roleMapCnt = objMappings.stream()
                            .filter(m -> !"SYSADMIN".equals(m.getRoleId())).count();
                    long permCnt = secRolePermRepository.countByObjectId(objectId);
                    if (menuCnt > 0 || roleMapCnt > 0 || permCnt > 0) {
                        log.warn("[commObjMng.saveCmObj] delete blocked — OBJECT_ID={} menu={} roleMap={} perm={} (silent skip)",
                                 objectId, menuCnt, roleMapCnt, permCnt);
                        continue;
                    }
                    if (secObjRepository.existsById(objectId)) {
                        if (!objMappings.isEmpty()) {
                            secRoleMappingRepository.deleteAll(objMappings);
                        }
                        secObjRepository.deleteById(objectId);
                        // 오브젝트가 빠지면 SYSADMIN 효과 퍼미션이 바뀐다(퍼미션 행은 위 검사로 0 건)
                        eventRoles.add(SYSADMIN_ROLE);
                        cnt++;
                    }
                } else if (isUpsert(status)) {
                    SecObj entity = secObjRepository.findById(objectId).orElseGet(SecObj::new);
                    boolean isNew = entity.getObjectId() == null;
                    ObjBefore before = new ObjBefore(entity.getBtnPerm(), entity.getPopupPerm(), entity.getUseTp(),
                            entity.getSystemCode(), entity.getStartActiveDate(), entity.getEndActiveDate());
                    entity.setObjectId(objectId);
                    entity.setObjectNm(strOf(row.get("OBJECT_NM")));
                    entity.setProgramDesc(strOf(row.get("PROGRAM_DESC")));
                    entity.setSystemCode(strOf(row.get("SYSTEM_CODE")));
                    entity.setObjectType(strOf(row.get("OBJECT_TYPE")));
                    entity.setService(strOf(row.get("SERVICE")));
                    entity.setUseTp(strOf(row.get("USE_TP")));
                    entity.setAccessTp(strOf(row.get("ACCESS_TP")));
                    entity.setFormUrl(strOf(row.get("FORM_URL")));
                    entity.setOutAccessIp(strOf(row.get("OUT_ACCESS_IP")));
                    entity.setParam(strOf(row.get("PARAM")));
                    entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"),
                            isNew ? LocalDateTime.now() : entity.getStartActiveDate()));
                    entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"),
                            isNew ? END_OF_TIME : entity.getEndActiveDate()));
                    applyPermTokens(entity, tokensByRow.get(i));
                    secObjRepository.save(entity);
                    if (isNew) {
                        // 새 오브젝트 → SYSADMIN 효과 퍼미션이 늘어난다(퍼미션 행은 아직 없다)
                        eventRoles.add(SYSADMIN_ROLE);
                    } else {
                        collectImpacts(entity, before, impacts, eventRoles);
                    }
                    cnt++;
                } else {
                    log.warn("[commObjMng.saveCmObj] unknown status={} — skip", status);
                }
            }
        }
        if (!eventRoles.isEmpty()) {
            // 오브젝트 추가·삭제·허용 값·USE_TP·SYSTEM_CODE·유효 기간 변경 → 권한 캐시 무효화 (D30, D13)
            eventPublisher.publishEvent(new RoleChangedEvent(eventRoles));
        }
        if (cnt > 0) {
            // OBJECT 저장·삭제 → 메뉴 카탈로그(SEC_MENU·SEC_OBJ 전수 캐시) 무효화. 권한에 닿지 않는 update
            // (이름·설명 등)는 RoleChangedEvent 가 안 나가도 카탈로그는 비워야 한다.
            eventPublisher.publishEvent(new MenuChangedEvent(MenuChangedEvent.OBJECT));
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:389 fn_msgSuccessSave 콜백 → fn_run("searchCmObj") 자동 재조회 정합)
        List<SecObj> rows = secObjRepository.findAll();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", toSearchRows(rows));
        out.put("impacts", impacts);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: lov — MENU_ID lov (To-Be 정책 #1 — APP_HOST 폐기 → 1 dataset 만)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code lov} 진입점. As-Is BPMN flow:
     * Task_0wm0wlq (selectAppHostId) → Task_1lhctxq (selectMenuId).
     * <b>To-Be 정책 #1</b>: Task_0wm0wlq + selectAppHostId 폐기 → selectMenuId 1 Task 만.
     *
     * <p>처리: {@link SecMenuFldLovRepository#findAllMenuIdLov()} 호출 후
     * {@code ds_lovMenuId} key 의 List<Map> 반환 → cactus 가 {@code grids.ds_lovMenuId.rows} 로 응답.
     */
    public Map<String, Object> lov() {
        List<Map<String, Object>> menuLov = secMenuFldLovRepository.findAllMenuIdLov();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_lovMenuId", menuLov);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchObjPerm — 오브젝트의 직무별 퍼미션 (퍼미션 모델 v2)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchObjPerm} 진입점. 오브젝트 하나를 퍼미션으로 가진 직무 목록.
     *
     * <p>grids {@code perms}: ROLE_ID · ROLE_NM · ROLE_USE_TP · BTN_PERM · POPUP_PERM · DATA_PERM ·
     * EFF_BTN_PERM · EFF_POPUP_PERM · USER_CNT (EFF = 직무 값 ∩ 오브젝트 허용 값, 직무 값의 순서). 정렬 = ROLE_ID.
     * 최상위 {@code USER_CNT} = 이 직무들을 받는 서로 다른 사람 수(그룹 겹침 제외, 사용 안 함 확인용).
     */
    public Map<String, Object> searchObjPerm(CommObjMngObjRequest request) {
        String objectId = request != null ? request.getObjectId() : null;
        List<Map<String, Object>> perms = commObjMngQuery.rolePermsOfObject(objectId);
        SecObj obj = (objectId == null || objectId.isBlank()) ? null : secObjRepository.findById(objectId).orElse(null);
        List<String> objBtn = PermTokens.parse(obj != null ? obj.getBtnPerm() : null);
        List<String> objPopup = PermTokens.parse(obj != null ? obj.getPopupPerm() : null);

        Map<String, Long> userCntByRole = perms.isEmpty() ? Map.of() : commPermQueryRepository.userCntByRole();
        List<String> roleIds = new ArrayList<>(perms.size());
        for (Map<String, Object> p : perms) {
            String roleId = String.valueOf(p.get("ROLE_ID"));
            roleIds.add(roleId);
            p.put("EFF_BTN_PERM", effective(strOf(p.get("BTN_PERM")), objBtn));
            p.put("EFF_POPUP_PERM", effective(strOf(p.get("POPUP_PERM")), objPopup));
            p.put("USER_CNT", userCntByRole.getOrDefault(roleId, 0L));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("perms", perms);
        out.put("USER_CNT", commPermQueryRepository.distinctUserCnt(roleIds));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchObjMenu — 오브젝트를 가리키는 메뉴 (퍼미션 모델 v2)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchObjMenu} 진입점. 오브젝트를 가리키는 모든 메뉴(WEB 먼저, 그다음 MENU_ID).
     *
     * <p>grids {@code menus}: MENU_ID · MENU_NM · PARENT_MENU_ID · MENU_PATH(부모 폴더 경로) · MENU_TP · MENU_VIEW_YN · USE_TP.
     */
    public Map<String, Object> searchObjMenu(CommObjMngObjRequest request) {
        String objectId = request != null ? request.getObjectId() : null;
        List<Map<String, Object>> menus = commObjMngQuery.menusOfObject(objectId);
        Map<String, String> pathByFolder = new HashMap<>();
        if (!menus.isEmpty()) {
            for (Map<String, Object> f : commPermQueryRepository.folderLov()) {
                pathByFolder.put(String.valueOf(f.get("MENU_ID")), strOf(f.get("MENU_PATH")));
            }
        }
        List<Map<String, Object>> outRows = new ArrayList<>(menus.size());
        for (Map<String, Object> m : menus) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("MENU_ID", m.get("MENU_ID"));
            row.put("MENU_NM", m.get("MENU_NM"));
            row.put("PARENT_MENU_ID", m.get("PARENT_MENU_ID"));
            row.put("MENU_PATH", pathByFolder.get(strOf(m.get("PARENT_MENU_ID"))));
            row.put("MENU_TP", m.get("MENU_TP"));
            row.put("MENU_VIEW_YN", m.get("MENU_VIEW_YN"));
            row.put("USE_TP", m.get("USE_TP"));
            outRows.add(row);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("menus", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchSystemLov — SYSTEM 필드 콤보박스 옵션 (TB_MCM_SEC_MENU_FLD root)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchSystemLov} 진입점.
     *
     * <p>2026-06-05 — Detail SYSTEM 입력란을 콤보박스화. 옵션 source 는
     * {@code TB_MCM_SEC_MENU_FLD WHERE PARENT_MENU_ID IS NULL} (root = 모듈 단위).
     * 현 시점 시드는 'mcm' 1행. 추후 다른 모듈(mpn/mqc 등) 이 root 로 추가되면 자동 노출.
     *
     * <p>응답: {@code ds_systemLov} key 의 List<Map> ({ MENU_ID, MENU_NM }).
     */
    public Map<String, Object> searchSystemLov() {
        List<Map<String, Object>> rows = secMenuFldLovRepository.findRootMenuFlds();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_systemLov", rows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // row mapping helpers — As-Is selectCommObjMng SELECT 결과 컬럼명 (SNAKE_CASE) 보존
    // ────────────────────────────────────────────────────────────────

    /** 직무 값 중 오브젝트 허용 값에 있는 것만(직무 값의 순서). */
    private static String effective(String roleValue, List<String> objAllowed) {
        List<String> eff = new ArrayList<>();
        for (String t : PermTokens.parse(roleValue)) {
            if (objAllowed.contains(t)) eff.add(t);
        }
        return PermTokens.join(eff);
    }

    /**
     * 쓰기 전 검증 단계. insert·update 행마다 BTN_PERM·POPUP_PERM·DATA_PERM 칸이 있으면 정규화한 값을 담는다
     * (칸이 없으면 키 없음, 빈 값 = null). 결과는 {@code master} 와 같은 순서다(대상이 아닌 행 = null).
     * 1000자 초과 = BusinessException(PERM_TOO_LONG) — 아직 아무 행도 쓰지 않았다.
     */
    private static List<Map<String, String>> validatePermTokens(List<Map<String, Object>> master) {
        List<Map<String, String>> out = new ArrayList<>();
        if (master == null) return out;
        for (Map<String, Object> row : master) {
            if (row == null || !isUpsert(statusOf(row))) {
                out.add(null);
                continue;
            }
            String objectId = strOf(row.get("OBJECT_ID"));
            if (objectId == null || objectId.isBlank()) {
                out.add(null);
                continue;
            }
            Map<String, String> tokens = new HashMap<>();
            for (String column : PERM_COLUMNS) {
                if (row.containsKey(column)) tokens.put(column, normalizeTokens(row.get(column), column));
            }
            out.add(tokens);
        }
        return out;
    }

    /** 검증 단계에서 정규화한 허용 값을 entity 에 옮긴다(칸이 없던 값은 그대로 둔다). */
    private static void applyPermTokens(SecObj entity, Map<String, String> tokens) {
        if (tokens == null) return;
        if (tokens.containsKey("BTN_PERM")) entity.setBtnPerm(tokens.get("BTN_PERM"));
        if (tokens.containsKey("POPUP_PERM")) entity.setPopupPerm(tokens.get("POPUP_PERM"));
        if (tokens.containsKey("DATA_PERM")) entity.setDataPerm(tokens.get("DATA_PERM"));
    }

    /** 행 상태 — rowStatus, 없으면 As-Is Nexacro 시스템 컬럼 fallback (cma 정본 동일 패턴). */
    private static String statusOf(Map<String, Object> row) {
        String status = strOf(row.get("rowStatus"));
        if (status == null || status.isBlank()) {
            status = strOf(row.get("!nativeeditor_status"));
        }
        return status;
    }

    private static boolean isUpsert(String status) {
        return "inserted".equals(status) || "C".equals(status)
                || "updated".equals(status) || "U".equals(status);
    }

    private static String normalizeTokens(Object raw, String column) {
        String joined = PermTokens.join(PermTokens.parse(strOf(raw)));
        if (joined.length() > PERM_MAX_LEN) {
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, "PERM_TOO_LONG: " + column + " " + PERM_MAX_LEN + "자 초과 (" + joined.length() + ")");
        }
        return joined.isEmpty() ? null : joined;
    }

    /** 수정 전 값 — 권한 캐시 무효화 판단용(허용 값·USE_TP·SYSTEM_CODE·유효 기간). */
    private record ObjBefore(String btnPerm, String popupPerm, String useTp, String systemCode,
                             LocalDateTime startActiveDate, LocalDateTime endActiveDate) {
    }

    /**
     * 수정 저장의 영향 모음. 허용 BTN·POPUP 에서 빠진 토큰마다, USE_TP Y→N 이면 한 줄씩 {@code impacts} 에 더한다
     * (PERM_CNT = 영향받는 직무 퍼미션 수, USER_CNT = 그 직무를 받는 서로 다른 사람 수, PERM_CNT 0 이면 줄 없음).
     * 허용 값·USE_TP·SYSTEM_CODE(D26 키 접두)·유효 기간 중 하나라도 바뀌었으면 SYSADMIN(D13)과
     * 그 오브젝트에 퍼미션을 가진 직무를 {@code eventRoles} 에 더한다. 퍼미션 행은 고치지 않는다(D15).
     */
    private void collectImpacts(SecObj entity, ObjBefore before,
                                List<Map<String, Object>> impacts, Set<String> eventRoles) {
        List<String> btnBefore = PermTokens.parse(before.btnPerm());
        List<String> btnAfter = PermTokens.parse(entity.getBtnPerm());
        List<String> popupBefore = PermTokens.parse(before.popupPerm());
        List<String> popupAfter = PermTokens.parse(entity.getPopupPerm());
        List<String> btnRemoved = PermTokens.notIn(btnBefore, btnAfter);
        List<String> popupRemoved = PermTokens.notIn(popupBefore, popupAfter);
        boolean valuesChanged = !btnRemoved.isEmpty() || !popupRemoved.isEmpty()
                || !PermTokens.notIn(btnAfter, btnBefore).isEmpty()
                || !PermTokens.notIn(popupAfter, popupBefore).isEmpty();
        boolean useTpChanged = !sameText(before.useTp(), entity.getUseTp());
        boolean useTpOff = "Y".equals(before.useTp()) && "N".equals(entity.getUseTp());
        boolean systemCodeChanged = !sameText(before.systemCode(), entity.getSystemCode());
        boolean datesChanged = !Objects.equals(before.startActiveDate(), entity.getStartActiveDate())
                || !Objects.equals(before.endActiveDate(), entity.getEndActiveDate());
        if (!valuesChanged && !useTpChanged && !systemCodeChanged && !datesChanged) return;

        // SYSADMIN 효과 퍼미션은 퍼미션 행 없이 오브젝트 값으로 계산된다 → 퍼미션 행이 없어도 무효화한다
        eventRoles.add(SYSADMIN_ROLE);
        List<SecRolePerm> perms = secRolePermRepository.findByObjectId(entity.getObjectId());
        if (perms.isEmpty()) return;
        for (SecRolePerm p : perms) eventRoles.add(p.getRoleId());

        for (String token : btnRemoved) {
            addImpact(impacts, entity.getObjectId(), "BTN", token,
                    perms.stream().filter(p -> PermTokens.parse(p.getBtnPerm()).contains(token)).toList());
        }
        for (String token : popupRemoved) {
            addImpact(impacts, entity.getObjectId(), "POPUP", token,
                    perms.stream().filter(p -> PermTokens.parse(p.getPopupPerm()).contains(token)).toList());
        }
        if (useTpOff) {
            addImpact(impacts, entity.getObjectId(), "USE_TP", "N", perms);
        }
    }

    /** null·공백을 같게 보고(Oracle 은 "" 를 NULL 로 저장) 앞뒤 공백을 무시해 비교한다. */
    private static boolean sameText(String a, String b) {
        return Objects.equals(blankToNullTrim(a), blankToNullTrim(b));
    }

    private void addImpact(List<Map<String, Object>> impacts, String objectId, String kind, String code,
                           List<SecRolePerm> hit) {
        if (hit.isEmpty()) return;
        Set<String> roleIds = new LinkedHashSet<>();
        for (SecRolePerm p : hit) roleIds.add(p.getRoleId());
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("OBJECT_ID", objectId);
        m.put("KIND", kind);
        m.put("CODE", code);
        m.put("PERM_CNT", (long) hit.size());
        m.put("USER_CNT", commPermQueryRepository.distinctUserCnt(roleIds));
        impacts.add(m);
    }

    /** 검색 결과 행 조립 — 새 칸(MENU_CNT·PERM_CNT)용 집계는 한 번만 읽는다. */
    private List<Map<String, Object>> toSearchRows(List<SecObj> rows) {
        if (rows.isEmpty()) return new ArrayList<>();
        Map<String, CommPermQueryRepository.ObjMenu> menus = commPermQueryRepository.objMenus();
        Map<String, Long> permCnt = commPermQueryRepository.permCntByObject();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecObj o : rows) {
            Map<String, Object> row = toSearchRow(o);
            row.put("BTN_PERM", o.getBtnPerm());
            row.put("POPUP_PERM", o.getPopupPerm());
            row.put("DATA_PERM", o.getDataPerm());
            CommPermQueryRepository.ObjMenu menu = menus.get(o.getObjectId());
            row.put("MENU_CNT", menu != null ? menu.menuCnt() : 0);
            row.put("PERM_CNT", permCnt.getOrDefault(o.getObjectId(), 0L));
            outRows.add(row);
        }
        return outRows;
    }

    /**
     * As-Is {@code selectCommObjMng} (xml:7~25) 의 응답 row 조립 — 본 13 컬럼 + MENU_ID (scalar subquery)
     * + ID (OBJECT_ID 의 {@code ::} 이후 부분 — As-Is SUBSTR/INSTR/LENGTH 등가).
     *
     * <p>As-Is BIZ_SYSTEM_CODE 컬럼 (To-Be 정책 #1) 미반영.
     */
    private Map<String, Object> toSearchRow(SecObj o) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("OBJECT_ID", o.getObjectId());
        row.put("OBJECT_NM", o.getObjectNm());
        row.put("PROGRAM_DESC", o.getProgramDesc());
        row.put("SYSTEM_CODE", o.getSystemCode());
        row.put("OBJECT_TYPE", o.getObjectType());
        row.put("SERVICE", o.getService());
        row.put("USE_TP", o.getUseTp());
        row.put("ACCESS_TP", o.getAccessTp());
        row.put("FORM_URL", o.getFormUrl());
        row.put("OUT_ACCESS_IP", o.getOutAccessIp());
        row.put("PARAM", o.getParam());
        row.put("START_ACTIVE_DATE", o.getStartActiveDate());
        row.put("END_ACTIVE_DATE", o.getEndActiveDate());
        // MENU_ID scalar subquery — As-Is xml:22~25
        row.put("MENU_ID", secObjRepository.findOneMenuIdByObjectId(o.getObjectId()));
        // 2026-06-03 — ToBe FORM_URL 자동 세트 (`{group}/{OBJECT_ID}`) 의 group prefix 결정용.
        row.put("PARENT_MENU_ID", secObjRepository.findOneParentMenuIdByObjectId(o.getObjectId()));
        // ID = OBJECT_ID 의 "::" 이후 — As-Is SUBSTR(OBJECT_ID, INSTR(OBJECT_ID,'::')+2, LENGTH(OBJECT_ID))
        row.put("ID", extractIdFromObjectId(o.getObjectId()));
        return row;
    }

    /** As-Is {@code SUBSTR(A.OBJECT_ID, INSTR(A.OBJECT_ID,'::')+2, LENGTH(A.OBJECT_ID))} (xml:26) Java 등가. */
    private static String extractIdFromObjectId(String objectId) {
        if (objectId == null) return null;
        int idx = objectId.indexOf("::");
        if (idx < 0) return objectId; // "::" 없으면 전체 반환 (As-Is INSTR 0 → SUBSTR(_, 2, _) 와 mismatch — Java 보수 처리)
        return objectId.substring(idx + 2);
    }

}
