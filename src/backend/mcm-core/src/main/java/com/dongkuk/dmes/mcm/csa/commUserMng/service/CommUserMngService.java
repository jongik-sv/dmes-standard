/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng OASIS BPMN serviceTask entry point — 12 action (W5)
 *       searchCmUser / saveCmUser / regCmUser / deleteCmUser / reRegCmUser / searchUserRoleGrp /
 *       saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept / searchDeptLov
 *       2026-10-04 — 퍼사드로 바꾸고 본문을 조회·저장·비밀번호·SSO 빈으로 나눴다(이름·시그니처·반환 Map 불변).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngDeptRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchUserLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.csa.commPerm.SysadminGuard;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * commUserMng — OASIS BPMN serviceTask entry point (W5 / csa 9 화면 5번째).
 *
 * <p>Spring bean name {@code commUserMngService} → BPMN {@code <camunda:class>commUserMngService</camunda:class>}.
 *
 * <p>BPMN action 12 (As-Is 11 → To-Be 11 — 분석 §1 / §8 / BPMN설계서, 2026-06-04 searchDeptLov 추가):
 * <ol>
 *   <li>{@code searchCmUser}        → {@link #searchCmUser(CommUserMngSearchRequest)} — 메인 사용자 그리드 조회 + ds_mainAll 후속</li>
 *   <li>{@code saveCmUser}          → {@link #saveCmUser(List)} — 메인 그리드 저장 (status="updated" 분기만)</li>
 *   <li>{@code regCmUser}           → {@link #regCmUser(List)} — 계정 생성 (insertCommUser + mergeCommonPwdInit + 이력)</li>
 *   <li>{@code deleteCmUser}        → {@link #deleteCmUser(List)} — 계정 삭제 (END_ACTIVE_DATE 마감 + 이력)</li>
 *   <li>{@code reRegCmUser}         → {@link #reRegCmUser(List)} — 계정 재생성 (단건 처리)</li>
 *   <li>{@code searchUserRoleGrp}   → {@link #searchUserRoleGrp(CommUserMngUserIdRequest)} — 선택 사용자 보유 역할그룹</li>
 *   <li>{@code saveUserRoleGrp}     → {@link #saveUserRoleGrp(List)} — 역할그룹 추가/삭제 + 이력</li>
 *   <li>{@code searchRoleGrp}       → {@link #searchRoleGrp(CommUserMngUserIdRequest)} — 추가 가능 역할그룹 조회</li>
 *   <li>{@code pwdinit}             → {@link #pwdinit(CommUserMngPwdInitRequest, List)} — 비밀번호/SSO 초기화</li>
 *   <li>{@code saveUserRoleGrpCopy} → {@link #saveUserRoleGrpCopy(CommUserMngRoleCopyRequest)} — 역할그룹 복사</li>
 *   <li>{@code commonUserDept}      → {@link #commonUserDept(CommUserMngDeptRequest)} — 부서 팝업 조회</li>
 *   <li>{@code searchDeptLov}       → {@link #searchDeptLov(CommUserMngSearchDeptLovRequest)} — Detail 부서 LoV 모달
 *       (2026-06-04 신설 / 사용자 결정 — 직접 타이핑 ✗, 검색 버튼 + 모달 선택 → DEPT_CD/DEPT_NM 자동 세트.
 *       commRoleMng round-3 의 searchObjectLov 정합 패턴.)</li>
 * </ol>
 *
 * <p>구조 (2026-10-04 분할) — 이 클래스는 BPMN 이 부르는 퍼사드다. 빈 이름·public 12개 메서드의 이름·파라미터 이름
 * ({@code request}·{@code master} — OASIS 가 grids key 를 Java 파라미터 이름으로 묶는다)·반환 Map 은 분할 전과 같다.
 * 본문은 같은 패키지의 빈에 위임한다:
 * <ul>
 *   <li>{@link CommUserMngQueryService} — searchCmUser / searchUserRoleGrp / searchRoleGrp / commonUserDept / searchDeptLov</li>
 *   <li>{@link CommUserMngSaveService} — saveCmUser(regCmUser·deleteCmUser 도 이리로) / reRegCmUser / saveUserRoleGrp /
 *       saveUserRoleGrpCopy (RoleChangedEvent 발행 포함)</li>
 *   <li>{@link CommUserMngPasswordService} — pwdinit 단건 분기</li>
 *   <li>{@link CommUserMngSsoService} — pwdinit SSO 일괄 분기</li>
 *   <li>{@code CommUserMngPwdWriter}(패키지 private) — bcrypt 인코더·초기 비밀번호·PWD 행 upsert 공유</li>
 * </ul>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 와 위임 빈 어디에도 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap 하므로 위임 빈 호출도 같은 트랜잭션이다.
 *
 * <p>To-Be 정책:
 * <ul>
 *   <li>#1 — Entity 모듈 직속, schema=MCMAPUSER, McmAuditEntity 자동</li>
 *   <li>#2 / Q-002 — DEPT_NM = DeptInfoRepository 별도 조회 (As-Is EAI scalar subquery 폐기)</li>
 *   <li>#3 (B) — As-Is 미사용 SQL 5종 폐기</li>
 *   <li>#3 (C) — TB_MCM_SEC_USER_HIS / ROLL_HIS 외부 Mapper → JPA Entity 흡수 (별도 Mapper.xml ✗)</li>
 *   <li>#3 (D) / Q-005 — D-013~015 GROUP_ID 콤보 미반영 (DB 보존만)</li>
 *   <li>#3 (E) / Q-014 — Grid STATUS row state AG Grid 자연 흡수</li>
 *   <li>#3 (F) — 본 화면 비밀번호 정책 외부화는 기존 mcm-core McmPasswordProperties 보존 (별도 신규 properties 본 cycle 미도입)</li>
 *   <li>#6 (A) — Entity 직역 (SecUser/SecUserMapping/SecUserPwd/SecUserHis/SecUserRollHis/DeptInfo)</li>
 * </ul>
 *
 * <p>BPMN definition: {@code services/csa/commUserMng/commUserMng.bpmn}.
 */
@Service("commUserMngService")
public class CommUserMngService {

    private final CommUserMngQueryService queryService;
    private final CommUserMngSaveService saveService;
    private final CommUserMngPasswordService passwordService;
    private final CommUserMngSsoService ssoService;
    private final CommUserMngLifecycleService lifecycleService;
    private final CommUserMngHrService hrService;
    private final SysadminGuard sysadminGuard;

    /** 민감한 그룹(시스템관리자·SYSADMIN 전용 화면 권한)에 든 계정을 바꾸는 일 — 비밀번호 초기화·수정·삭제·재등록·정지·다시 사용·퇴직(m19). */
    static final String HOLDER_MSG = "시스템관리자 권한(또는 시스템관리자 전용 화면 권한)이 있는 계정의 비밀번호·정보·상태는 시스템관리자만 바꿀 수 있습니다";

    public CommUserMngService(CommUserMngQueryService queryService,
                              CommUserMngSaveService saveService,
                              CommUserMngPasswordService passwordService,
                              CommUserMngSsoService ssoService,
                              CommUserMngLifecycleService lifecycleService,
                              CommUserMngHrService hrService,
                              SysadminGuard sysadminGuard) {
        this.sysadminGuard = sysadminGuard;
        this.queryService = queryService;
        this.saveService = saveService;
        this.passwordService = passwordService;
        this.ssoService = ssoService;
        this.lifecycleService = lifecycleService;
        this.hrService = hrService;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmUser — 메인 사용자 그리드 조회 + ds_mainAll 후속 chain
    // ────────────────────────────────────────────────────────────────

    /** action {@code searchCmUser} — 메인 사용자 그리드 조회 + ds_mainAll. 본문: {@link CommUserMngQueryService#searchCmUser}. */
    public Map<String, Object> searchCmUser(CommUserMngSearchRequest request) {
        return queryService.searchCmUser(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmUser — 통합 저장 (inserted/updated/deleted 분기 / 2026-06-04 사용자 결정)
    // ────────────────────────────────────────────────────────────────

    /** action {@code saveCmUser} — rowStatus 별 inserted/updated/deleted 통합 저장. 본문: {@link CommUserMngSaveService#saveCmUser}. */
    public Map<String, Object> saveCmUser(List<Map<String, Object>> master) {
        requireSysadminForHolders(changedUsers(master));
        return saveService.saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: regCmUser — 계정 생성 (insertCommUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code regCmUser} 진입점 — 2026-06-04 통합 저장 위임 (호환 유지).
     *
     * <p>FE 단일 "저장" 버튼 통합 후, 본 BPMN action 은 직접 호출되지 않지만 BPMN 정의 보존을 위해 유지.
     * 내부는 통합 {@link #saveCmUser(List)} 로 위임 — rowStatus 별 분기.
     */
    public Map<String, Object> regCmUser(List<Map<String, Object>> master) {
        requireSysadminForHolders(changedUsers(master));
        return saveService.saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: deleteCmUser — 논리삭제 (END_ACTIVE_DATE 마감 + TB_MCM_SEC_USER_HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code deleteCmUser} 진입점 — 2026-06-04 통합 저장 위임 (호환 유지).
     *
     * <p>FE 단일 "저장" 버튼 통합 후, 본 BPMN action 은 직접 호출되지 않지만 BPMN 정의 보존을 위해 유지.
     * 내부는 통합 {@link #saveCmUser(List)} 로 위임 — rowStatus 별 분기 (9999-12-31 sentinel fix 포함).
     */
    public Map<String, Object> deleteCmUser(List<Map<String, Object>> master) {
        requireSysadminForHolders(changedUsers(master));
        return saveService.saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: reRegCmUser — 계정 재생성 (updateReRegUser + mergeCommonPwdInit + HIS)
    // ────────────────────────────────────────────────────────────────

    /** action {@code reRegCmUser} — 계정 재생성 단건(기간 재설정·비밀번호·이력). 본문: {@link CommUserMngSaveService#reRegCmUser}. */
    public Map<String, Object> reRegCmUser(List<Map<String, Object>> master) {
        requireSysadminForHolders(usersOf(master));
        return saveService.reRegCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchUserRoleGrp — 선택 사용자의 보유 역할그룹 조회
    // ────────────────────────────────────────────────────────────────

    /** action {@code searchUserRoleGrp} — 선택 사용자의 보유 역할그룹. 본문: {@link CommUserMngQueryService#searchUserRoleGrp}. */
    public Map<String, Object> searchUserRoleGrp(CommUserMngUserIdRequest request) {
        return queryService.searchUserRoleGrp(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrp — 역할그룹 추가/삭제 + 이력
    // ────────────────────────────────────────────────────────────────

    /** action {@code saveUserRoleGrp} — 역할그룹 추가/삭제 + 이력 + RoleChangedEvent. 본문: {@link CommUserMngSaveService#saveUserRoleGrp}. */
    public Map<String, Object> saveUserRoleGrp(List<Map<String, Object>> master) {
        return saveService.saveUserRoleGrp(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchRoleGrp — 추가 가능 역할그룹 조회 (활성 + 사용자 미보유)
    // ────────────────────────────────────────────────────────────────

    /** action {@code searchRoleGrp} — 추가 가능 역할그룹. 본문: {@link CommUserMngQueryService#searchRoleGrp}. */
    public Map<String, Object> searchRoleGrp(CommUserMngUserIdRequest request) {
        return queryService.searchRoleGrp(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: pwdinit — 비밀번호 / SSO 비밀번호 초기화
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code pwdinit} 진입점. As-Is PasswordInit.java.
     *
     * <p>분기 (java:31) 만 퍼사드가 정하고 본문은 위임한다:
     * <ul>
     *   <li>SSO_RESET_FLAG="Y" → {@link CommUserMngSsoService#resetSsoPwd(List)} — master(ds_main) 전 행 USER_SSO_PWD 일괄 초기화.
     *       응답은 {@code cnt_save} 만.</li>
     *   <li>그 외(request null 포함) → {@link CommUserMngPasswordService#initPwd(CommUserMngPwdInitRequest)} — 단건 USER_ID
     *       USER_ENC_PWD·USER_SSO_PWD 초기화. 성공 시 {@code INIT_PWD}·{@code INIT_PWD_USER_ID} 를 함께 돌려준다(2026-09-28).</li>
     * </ul>
     */
    public Map<String, Object> pwdinit(CommUserMngPwdInitRequest request, List<Map<String, Object>> master) {
        boolean ssoReset = request != null && "Y".equals(request.getSSO_RESET_FLAG());
        requireSysadminForHolders(ssoReset ? usersOf(master) : one(request == null ? null : request.getUSER_ID()));
        if (ssoReset) {
            return ssoService.resetSsoPwd(master);
        }
        return passwordService.initPwd(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrpCopy — 역할그룹 복사 (USER_ID_COPY → USER_ID, 비보유분만)
    // ────────────────────────────────────────────────────────────────

    /** action {@code saveUserRoleGrpCopy} — 다른 사용자의 역할그룹 복사 + 이력 + RoleChangedEvent. 본문: {@link CommUserMngSaveService#saveUserRoleGrpCopy}. */
    public Map<String, Object> saveUserRoleGrpCopy(CommUserMngRoleCopyRequest request) {
        return saveService.saveUserRoleGrpCopy(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: commonUserDept — 부서 팝업 조회
    // ────────────────────────────────────────────────────────────────

    /** action {@code commonUserDept} — 부서 팝업 조회. 본문: {@link CommUserMngQueryService#commonUserDept}. */
    public Map<String, Object> commonUserDept(CommUserMngDeptRequest request) {
        return queryService.commonUserDept(request);
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchDeptLov — Detail 부서 LoV 모달 (2026-06-04 신설 / 사용자 결정)
    // 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 그리드 (DEPT_CD/DEPT_NM) → 선택 시 자동 세트
    // ────────────────────────────────────────────────────────────────

    /** action {@code searchDeptLov} — Detail 부서 LoV 모달. 본문: {@link CommUserMngQueryService#searchDeptLov}. */
    public Map<String, Object> searchDeptLov(CommUserMngSearchDeptLovRequest request) {
        return queryService.searchDeptLov(request);
    }

    // ────────────────────────────────────────────────────────────────
    // 2026-11-28 — 계정 상태(시안 「사용자 비활성화·퇴직 처리」). BPMN 분기 이름 = 권한 action 이름.
    // ────────────────────────────────────────────────────────────────

    /** action {@code unlock} — 잠금 해제(비밀번호 유지). 본문: {@link CommUserMngLifecycleService#unlock}. */
    public Map<String, Object> unlockUser(CommUserMngStateRequest request) {
        return lifecycleService.unlock(request);
    }

    /** action {@code suspend} — 관리자 비활성. 본문: {@link CommUserMngLifecycleService#suspend}. */
    public Map<String, Object> suspendUser(CommUserMngStateRequest request) {
        requireSysadminForHolders(one(request == null ? null : request.getUSER_ID()));
        return lifecycleService.suspend(request);
    }

    /** action {@code resume} — 다시 사용. 본문: {@link CommUserMngLifecycleService#resume}. */
    public Map<String, Object> resumeUser(CommUserMngStateRequest request) {
        requireSysadminForHolders(one(request == null ? null : request.getUSER_ID()));
        return lifecycleService.resume(request);
    }

    /** action {@code retire} — 퇴직 처리(역할 회수·배정 해제·인계). 본문: {@link CommUserMngLifecycleService#retire}. */
    public Map<String, Object> retireUser(CommUserMngStateRequest request) {
        requireSysadminForHolders(one(request == null ? null : request.getUSER_ID()));
        return lifecycleService.retire(request);
    }

    /** action {@code handover} — 담당 데이터 인계. 본문: {@link CommUserMngLifecycleService#handover}. */
    public Map<String, Object> handoverUser(CommUserMngStateRequest request) {
        return lifecycleService.handover(request);
    }

    /** action {@code searchOwned} — 한 사람의 담당 데이터. 본문: {@link CommUserMngLifecycleService#searchOwned}. */
    public Map<String, Object> searchOwned(CommUserMngStateRequest request) {
        return lifecycleService.searchOwned(request);
    }

    /**
     * action {@code searchRetirePreview} — 퇴직 처리 팝업 미리 보기(역할그룹·사용자 쿼리 배정·MDM 담당 건수, 바꾸지 않음).
     * 본문: {@link CommUserMngLifecycleService#retirePreview}.
     */
    public Map<String, Object> searchRetirePreview(CommUserMngStateRequest request) {
        return lifecycleService.retirePreview(request);
    }

    /**
     * action {@code searchActiveUserLov} — 받을 사람 고르기(상태 활성·잠금만, 앞부분 일치, 상한 200).
     * 본문: {@link CommUserMngQueryService#searchActiveUserLov}.
     */
    public Map<String, Object> searchActiveUserLov(CommUserMngSearchUserLovRequest request) {
        return queryService.searchActiveUserLov(request);
    }

    /** action {@code searchHrEvt} — ERP 인사 정보 목록(실패·계정 생성 대기·대기). 본문: {@link CommUserMngHrService#search}. */
    public Map<String, Object> searchHrEvt(CommUserMngStateRequest request) {
        return hrService.search(request == null ? null : request.getPROC_ST());
    }

    /** action {@code retryHrEvt} — 고른 인사 정보 다시 처리. 본문: {@link CommUserMngHrService#retry}. */
    public Map<String, Object> retryHrEvt(CommUserMngStateRequest request) {
        return hrService.retry(request == null ? null : request.getEVT_ID());
    }

    /** action {@code regHrEvtUser} — 입사 「계정 생성 대기」로 계정 만들기(D12). 본문: {@link CommUserMngHrService#createAccount}. */
    public Map<String, Object> regHrEvtUser(CommUserMngStateRequest request) {
        return hrService.createAccount(request == null ? null : request.getEVT_ID(),
                request == null ? null : request.getNEW_USER_ID());
    }

    // ── m19 SYSADMIN 보유자 계정 보호 ─────────────────────────────

    /**
     * 대상 가운데 민감한 그룹에 매핑된 계정({@link SysadminGuard#usersInSensitiveGroups} — 활성 여부 무관)이 있으면 SYSADMIN 만.
     * 기간이 지났거나 정지된 SYSADMIN 계정도 비밀번호 초기화 → 다시 켜기로 넘겨받을 수 있어 활성 보유자만 보지 않는다.
     * 잠금 해제(unlock)·담당 데이터 인계(handover)·인사 이벤트 처리는 대상이 아니다(조정자 결정 m19).
     */
    private void requireSysadminForHolders(List<String> userIds) {
        if (userIds.isEmpty() || sysadminGuard.currentUserId() == null) return;
        if (!sysadminGuard.usersInSensitiveGroups(userIds).isEmpty()) {
            sysadminGuard.requireSysadmin(HOLDER_MSG);
        }
    }

    /** 수정·삭제 행의 USER_ID(새 행은 아직 보유자가 아니다). */
    private static List<String> changedUsers(List<Map<String, Object>> master) {
        List<String> out = new ArrayList<>();
        if (master == null) return out;
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String st = CommUserMngSaveService.resolveStatus(row);
            if ("updated".equals(st) || "U".equals(st) || "deleted".equals(st) || "D".equals(st)) {
                out.addAll(one(row.get("USER_ID") == null ? null : String.valueOf(row.get("USER_ID"))));
            }
        }
        return out;
    }

    private static List<String> usersOf(List<Map<String, Object>> master) {
        List<String> out = new ArrayList<>();
        if (master == null) return out;
        for (Map<String, Object> row : master) {
            if (row != null && row.get("USER_ID") != null) out.addAll(one(String.valueOf(row.get("USER_ID"))));
        }
        return out;
    }

    private static List<String> one(String userId) {
        return userId == null || userId.isBlank() ? List.of() : List.of(userId.trim());
    }
}
