/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commObjMng OASIS BPMN serviceTask entry point — 3 action (searchCmObj / saveCmObj / lov) 분기
 */
package com.dongkuk.dmes.mcm.csa.commObjMng.service;

import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commObjMng.dto.CommObjMngSearchRequest;
import com.dongkuk.dmes.mcm.entity.SecObj;
import com.dongkuk.dmes.mcm.entity.SecRoleMapping;
import com.dongkuk.dmes.mcm.repository.SecMenuFldLovRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleMappingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;
import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;

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
    private final ApplicationEventPublisher eventPublisher;

    public CommObjMngService(SecObjRepository secObjRepository,
                             SecMenuFldLovRepository secMenuFldLovRepository,
                             SecRoleMappingRepository secRoleMappingRepository,
                             ApplicationEventPublisher eventPublisher) {
        this.secObjRepository = secObjRepository;
        this.secMenuFldLovRepository = secMenuFldLovRepository;
        this.secRoleMappingRepository = secRoleMappingRepository;
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

        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecObj o : rows) {
            outRows.add(toSearchRow(o));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmObj — OBJECT 일괄 저장 (status 분기 inserted/updated/deleted)
    // BPMN: As-Is CommonMultiSaveTask 자동 분기 → To-Be Service for-loop 명시 분기
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmObj} 진입점. As-Is BPMN {@code CommonMultiSaveTask} (insertSqlKey /
     * updateSqlKey / deleteSqlKey 자동 분기) 의 row.{@code !nativeeditor_status} 분기를
     * To-Be Service for-loop 의 명시 분기로 변환 (cma {@code MasterCodeMngService.saveDetail} 정본 패턴).
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
     * <p>SYSADMIN 자동 매핑 (2026-07-30 순수 RBAC 전환 — 설계 D4): insert/update 저장 시
     * {@code (SYSADMIN, OBJECT_ID, PERM_ALL)} 매핑을 멱등 생성 — 등록 누락으로 관리자가
     * 403 되는 것을 방지. 매핑 변경 시 {@link RoleChangedEvent} 발행(UserPermCache 즉시 무효화).
     *
     * <p>반환: {@code cnt_merge} (성공 행 수) + {@code ds_main} (재조회 결과 — cma 정본 패턴과 정합).
     */
    public Map<String, Object> saveCmObj(List<Map<String, Object>> master) {
        int cnt = 0;
        boolean rbacChanged = false;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = strOf(row.get("rowStatus"));
                if (status == null || status.isBlank()) {
                    // As-Is Nexacro 시스템 컬럼 fallback (cma 정본 동일 패턴)
                    status = strOf(row.get("!nativeeditor_status"));
                }
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
                    if (menuCnt > 0 || roleMapCnt > 0) {
                        log.warn("[commObjMng.saveCmObj] delete blocked — OBJECT_ID={} menu={} roleMap={} (silent skip)",
                                 objectId, menuCnt, roleMapCnt);
                        continue;
                    }
                    if (secObjRepository.existsById(objectId)) {
                        if (!objMappings.isEmpty()) {
                            secRoleMappingRepository.deleteAll(objMappings);
                            rbacChanged = true;
                        }
                        secObjRepository.deleteById(objectId);
                        cnt++;
                    }
                } else if ("inserted".equals(status) || "C".equals(status)
                           || "updated".equals(status) || "U".equals(status)) {
                    SecObj entity = secObjRepository.findById(objectId).orElseGet(SecObj::new);
                    boolean isNew = entity.getObjectId() == null;
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
                    secObjRepository.save(entity);
                    // SYSADMIN 자동 매핑 (2026-07-30 순수 RBAC 전환 D4) — 등록 누락으로 관리자가
                    // 403 되는 것 방지. 멱등(existsById) — update 재저장 시에도 무해(자기치유).
                    SecRoleMapping.PK autoPk = new SecRoleMapping.PK("SYSADMIN", objectId, "PERM_ALL");
                    if (!secRoleMappingRepository.existsById(autoPk)) {
                        SecRoleMapping autoMap = new SecRoleMapping();
                        autoMap.setRoleId("SYSADMIN");
                        autoMap.setObjectId(objectId);
                        autoMap.setPermissionId("PERM_ALL");
                        secRoleMappingRepository.save(autoMap);
                        rbacChanged = true;
                    }
                    cnt++;
                } else {
                    log.warn("[commObjMng.saveCmObj] unknown status={} — skip", status);
                }
            }
        }
        if (rbacChanged) {
            // SYSADMIN 매핑 변경 → UserPermCache 즉시 무효화 (BFF 게이팅은 TTL 60s + BE 백스톱)
            eventPublisher.publishEvent(new RoleChangedEvent(Set.of("SYSADMIN")));
        }
        if (cnt > 0) {
            // OBJECT 저장·삭제 → 메뉴 카탈로그(SEC_MENU·SEC_OBJ 전수 캐시) 무효화. 매핑 변화가 없어(rbacChanged=false)
            // RoleChangedEvent 가 안 나가는 update 도 카탈로그는 비워야 한다.
            eventPublisher.publishEvent(new MenuChangedEvent(MenuChangedEvent.OBJECT));
        }
        // 저장 후 후속 search 재조회 (As-Is xfdl:389 fn_msgSuccessSave 콜백 → fn_run("searchCmObj") 자동 재조회 정합)
        List<SecObj> rows = secObjRepository.findAll();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecObj o : rows) {
            outRows.add(toSearchRow(o));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_merge", cnt);
        out.put("ds_main", outRows);
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
