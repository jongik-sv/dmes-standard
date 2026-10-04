/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng OASIS BPMN serviceTask entry point — 11 action (W5)
 *       searchCmUser / saveCmUser / regCmUser / deleteCmUser / reRegCmUser / searchUserRoleGrp /
 *       saveUserRoleGrp / searchRoleGrp / pwdinit / saveUserRoleGrpCopy / commonUserDept
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngDeptRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.repository.SecUserPwdRepository;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commUserMng — OASIS BPMN serviceTask entry point (W5 / csa 9 화면 5번째).
 *
 * <p>Spring bean name {@code commUserMngService} → BPMN {@code <camunda:class>commUserMngService</camunda:class>}.
 *
 * <p>BPMN action 11 (As-Is 11 → To-Be 11 — 분석 §1 / §8 / BPMN설계서):
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
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap.
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

    private final SecUserPwdRepository secUserPwdRepository;
    private final CommUserMngQueryService queryService;
    private final CommUserMngSaveService saveService;
    private final CommUserMngPwdWriter pwdWriter;

    CommUserMngService(SecUserPwdRepository secUserPwdRepository,
                       CommUserMngQueryService queryService,
                       CommUserMngSaveService saveService,
                       CommUserMngPwdWriter pwdWriter) {
        this.secUserPwdRepository = secUserPwdRepository;
        this.queryService = queryService;
        this.saveService = saveService;
        this.pwdWriter = pwdWriter;
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
        return saveService.saveCmUser(master);
    }

    // ────────────────────────────────────────────────────────────────
    // action: reRegCmUser — 계정 재생성 (updateReRegUser + mergeCommonPwdInit + HIS)
    // ────────────────────────────────────────────────────────────────

    /** action {@code reRegCmUser} — 계정 재생성 단건(기간 재설정·비밀번호·이력). 본문: {@link CommUserMngSaveService#reRegCmUser}. */
    public Map<String, Object> reRegCmUser(List<Map<String, Object>> master) {
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
     * <p>분기 (java:31):
     * <ul>
     *   <li>SSO_RESET_FLAG="Y" → master(ds_main) for-loop, 각 row 별 USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → updateCommonSSOPwdInit</li>
     *   <li>그 외 → 단건 USER_ID — USER_ENC_PWD=bcrypt(DEFAULT_PASSWORD) + USER_SSO_PWD=bcrypt(USER_ID+USER_EMP_NO) → mergeCommonPwdInit</li>
     * </ul>
     *
     * <p><b>응답 (2026-09-28 신설)</b> — 단건 비밀번호 초기화 성공 시 발급된 평문 초기 비밀번호를
     * {@code INIT_PWD} 로 함께 돌려준다. As-Is {@code pwdtmp} 콜백이 하단 상태바에
     * "임시비밀번호가 [{strErrorMsg}] 로 전송되었습니다" 를 보여주던 것을 (분석 §5.5 / 기능설계서 M-032)
     * To-Be 화면 팝업 + 클립보드 복사로 대체하기 위한 것이다 — 초기 비밀번호가 bcrypt 해시로만 남으면
     * 관리자가 사용자에게 전달할 값 자체를 알 수 없어 "초기화는 되는데 로그인할 수 없다" 가 된다.
     *
     * <p>보안 주의: {@code INIT_PWD} 는 **응답으로만** 나가고 로그에는 남기지 않는다. 값이 고정
     * 상수인 점은 {@link CommUserMngPwdWriter#DEFAULT_PASSWORD} 주석의 외부화 선행 과제(운영 적용 전 반드시 처리) 그대로다.
     *
     * <p>SSO 일괄 분기는 초기 비밀번호를 반환하지 않는다. 대상이 그리드 전 행이라 평문 비밀번호를
     * 응답에 싣는 순간 프런트가 N건의 비밀번호를 화면에 펼쳐야 하고, 값 규칙(USER_ID+USER_EMP_NO)도
     * 사용자마다 달라 그대로 노출되면 DB 사본과 동등한 정보가 된다. 필요하면 별도 내려받기 화면을 연다.
     */
    public Map<String, Object> pwdinit(CommUserMngPwdInitRequest request, List<Map<String, Object>> master) {
        int cnt = 0;
        String initPwdUserId = null;
        boolean ssoReset = request != null && "Y".equals(request.getSSO_RESET_FLAG());
        if (ssoReset) {
            // SSO 전체 — ds_main for-loop
            if (master != null) {
                for (Map<String, Object> row : master) {
                    if (row == null) continue;
                    String userId = strOf(row.get("USER_ID"));
                    String userEmpNo = strOf(row.get("USER_EMP_NO"));
                    if (userId == null || userId.isBlank()) continue;
                    String ssoPwd = pwdWriter.encode(userId + (userEmpNo == null ? "" : userEmpNo));
                    int affected = secUserPwdRepository.updateSsoPwd(userId, ssoPwd);
                    if (affected == 0) {
                        // 행이 없으면 신규 PWD 행 upsert
                        pwdWriter.upsertUserPwd(userId, null, ssoPwd);
                    }
                    cnt++;
                }
            }
        } else {
            // 단건 PWD 초기화 — request 의 USER_ID 우선
            String userId = request != null ? request.getUSER_ID() : null;
            String userEmpNo = request != null ? request.getUSER_EMP_NO() : null;
            if (userId != null && !userId.isBlank()) {
                pwdWriter.resetToInitial(userId, userEmpNo);
                cnt = 1;
                initPwdUserId = userId;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        if (initPwdUserId != null) {
            out.put("INIT_PWD", CommUserMngPwdWriter.DEFAULT_PASSWORD);
            out.put("INIT_PWD_USER_ID", initPwdUserId);
        }
        return out;
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
}
