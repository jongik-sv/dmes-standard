/*
 * 내용: commUserMng 저장 action — saveCmUser(regCmUser·deleteCmUser 위임 포함) / reRegCmUser /
 *       saveUserRoleGrp / saveUserRoleGrpCopy. BPMN 진입점은 퍼사드 {@link CommUserMngService}(빈 commUserMngService).
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserHisRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.common.util.McmValues.parseLocalDateTime;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commUserMng 저장 — 사용자 통합 저장·계정 재생성·역할그룹 추가/삭제·역할그룹 복사.
 *
 * <p>BPMN 이 직접 부르지 않는다. {@link CommUserMngService} 퍼사드가 위임한다({@code regCmUser}·{@code deleteCmUser} 는
 * 퍼사드에서 {@link #saveCmUser(List)} 로 위임).
 * {@code @Transactional} 을 붙이지 않는다 — OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 단위로 감싼다.
 *
 * <p>로그 범주는 분할 전과 같게 {@code CommUserMngService} 로거를 쓴다.
 */
@Service("commUserMngSaveService")
public class CommUserMngSaveService {

    private static final Logger log = LoggerFactory.getLogger(CommUserMngService.class);

    /**
     * As-Is xfdl:863 행추가 default {@code "99991231"} 8자 (ST-002) → As-Is Mapper insertCommUser:90~95
     * `#{START_ACTIVE_DATE}` / `#{END_ACTIVE_DATE}` 직접 바인딩 (TO_DATE 변환 ✗) → Oracle DATE 자동 변환 시
     * 시분초 = 00:00:00. AsIs DB 저장 결과 = {@code 9999-12-31 00:00:00}.
     *
     * <p>2026-06-02 iter#3 — 사용자 검수 J-011 결과 23:59:59 → **00:00:00 정정** (AsIs 1:1 정합).
     * 모든 START_ACTIVE_DATE / END_ACTIVE_DATE 도 yyyy-MM-dd 입력값 → atStartOfDay (00:00:00).
     */
    private static final LocalDateTime END_OF_TIME =
            LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    private final SecUserRepository secUserRepository;
    private final SecUserMappingRepository secUserMappingRepository;
    private final SecUserHisRepository secUserHisRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;
    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final CommUserMngPwdWriter pwdWriter;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    CommUserMngSaveService(SecUserRepository secUserRepository,
                           SecUserMappingRepository secUserMappingRepository,
                           SecUserHisRepository secUserHisRepository,
                           SecUserRollHisRepository secUserRollHisRepository,
                           SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                           ApplicationEventPublisher eventPublisher,
                           CommUserMngPwdWriter pwdWriter) {
        this.secUserRepository = secUserRepository;
        this.secUserMappingRepository = secUserMappingRepository;
        this.secUserHisRepository = secUserHisRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.eventPublisher = eventPublisher;
        this.pwdWriter = pwdWriter;
    }

    /**
     * 사용자↔역할그룹 매핑이 바뀌면 그 그룹들이 품고 있는 역할 ID 로 {@link RoleChangedEvent} 를 발행한다.
     *
     * <p>2026-09-04 fix — 이 발행이 없어 {@code UserPermCache}(TTL 10분)가 그대로 남았고,
     * "역할그룹을 붙였는데 최대 10분간 403 / 뗐는데 계속 통과" 가 발생했다. 메뉴 트리는 DB 직독이라
     * 즉시 바뀌는데 API 만 막히는 비대칭 증상의 원인이기도 하다.
     */
    private void publishRoleChanged(Set<String> roleGroupIds) {
        if (roleGroupIds == null || roleGroupIds.isEmpty()) return;
        List<String> roleIds = secRoleGroupMappingRepository.findRoleIdsByRoleGroupIdIn(new ArrayList<>(roleGroupIds));
        if (roleIds == null || roleIds.isEmpty()) return;
        eventPublisher.publishEvent(new RoleChangedEvent(new LinkedHashSet<>(roleIds)));
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveCmUser — 통합 저장 (inserted/updated/deleted 분기 / 2026-06-04 사용자 결정)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveCmUser} 본문. 통합 저장 (2026-06-04 사용자 결정).
     *
     * <p>FE 의 단일 "저장" 버튼이 master rows 의 변경된 모든 row 를 일괄 전송.
     * 본 메서드가 row 별 {@code rowStatus} 를 보고 분기 처리:
     * <ul>
     *   <li>{@code "inserted"} / {@code "C"} → {@link #applyInsert(Map)} (As-Is regCmUser — TB_MCM_SEC_USER + PWD + HIS)</li>
     *   <li>{@code "updated"}  / {@code "U"} → {@link #applyUpdate(Map)} (As-Is saveCmUser — 12 컬럼 UPDATE)</li>
     *   <li>{@code "deleted"}  / {@code "D"} → {@link #applyDelete(Map)} (As-Is deleteCmUser — 논리삭제 + HIS)</li>
     * </ul>
     *
     * <p>정보처리의뢰서 (INF_REQ_NO / DESCRIPTION) 정책 제거 (2026-06-04 사용자 결정).
     * 본 메서드 내부 helper 가 row 인입 시 null 로 강제 — 이력 (USER_HIS) 의 두 컬럼은 null 적재.
     *
     * <p>응답: {@code cnt_save} = inserted + updated + deleted 처리 row 수 합산.
     */
    public Map<String, Object> saveCmUser(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null) {
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String userId = strOf(row.get("USER_ID"));
                if (userId == null || userId.isBlank()) {
                    log.warn("[commUserMng.saveCmUser] USER_ID null — skip row (status={})", status);
                    continue;
                }
                if ("inserted".equals(status) || "C".equals(status)) {
                    if (applyInsert(row)) cnt++;
                } else if ("updated".equals(status) || "U".equals(status)) {
                    if (applyUpdate(row)) cnt++;
                } else if ("deleted".equals(status) || "D".equals(status)) {
                    if (applyDelete(row)) cnt++;
                } else {
                    log.debug("[commUserMng.saveCmUser] skip unknown status={} userId={}", status, userId);
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    /**
     * inserted 분기 — As-Is regCmUser 로직 흡수 (insertCommUser + mergeCommonPwdInit + TB_MCM_SEC_USER_HIS).
     * INF_REQ_NO / DESCRIPTION 은 null 로 적재 (정책 제거).
     */
    private boolean applyInsert(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        String userEmpNo = strOf(row.get("USER_EMP_NO"));
        if (secUserRepository.existsById(userId)) {
            log.warn("[commUserMng.saveCmUser/insert] blocked — duplicate USER_ID={} (silent skip)", userId);
            return false;
        }
        SecUser u = new SecUser();
        u.setUserId(userId);
        u.setUserEmpNo(userEmpNo);
        u.setSsoId(strOf(row.get("SSO_ID")));
        u.setUserNm(strOf(row.get("USER_NM")));
        u.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), LocalDateTime.now()));
        u.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), END_OF_TIME));
        u.setDeptCd(strOf(row.get("DEPT_CD")));
        u.setUserCategoryCd(strOf(row.get("USER_CATEGORY_CD")));
        u.setUseTp("Y"); // 계정 생성 default Y 강제 (java:52)
        u.setEmail(strOf(row.get("EMAIL")));
        u.setTelNo(strOf(row.get("TEL_NO")));
        u.setMobileTelNo(strOf(row.get("MOBILE_TEL_NO")));
        u.setInOutEmpTp(strOf(row.get("IN_OUT_EMP_TP")));
        u.setGroupId1(strOf(row.get("GROUP_ID1")));
        u.setGroupId2(strOf(row.get("GROUP_ID2")));
        u.setGroupId3(strOf(row.get("GROUP_ID3")));
        secUserRepository.save(u);

        pwdWriter.resetToInitial(userId, userEmpNo);

        // TB_MCM_SEC_USER_HIS — INF_REQ_NO / DESCRIPTION null
        saveUserHis(userId, currentYyyymmdd(), "C", "M",
                strOf(row.get("USER_NM")), null, null);
        return true;
    }

    /** updated 분기 — As-Is updateCommUser (xml:110~128) 12 컬럼 UPDATE. */
    private boolean applyUpdate(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        SecUser entity = secUserRepository.findById(userId).orElse(null);
        if (entity == null) {
            log.warn("[commUserMng.saveCmUser/update] skip — USER_ID={} not found", userId);
            return false;
        }
        entity.setUserEmpNo(strOf(row.get("USER_EMP_NO")));
        entity.setSsoId(strOf(row.get("SSO_ID")));
        entity.setUserNm(strOf(row.get("USER_NM")));
        entity.setStartActiveDate(parseLocalDateTime(row.get("START_ACTIVE_DATE"), entity.getStartActiveDate()));
        entity.setEndActiveDate(parseLocalDateTime(row.get("END_ACTIVE_DATE"), entity.getEndActiveDate()));
        entity.setDeptCd(strOf(row.get("DEPT_CD")));
        entity.setUserCategoryCd(strOf(row.get("USER_CATEGORY_CD")));
        entity.setEmail(strOf(row.get("EMAIL")));
        entity.setTelNo(strOf(row.get("TEL_NO")));
        entity.setMobileTelNo(strOf(row.get("MOBILE_TEL_NO")));
        entity.setInOutEmpTp(strOf(row.get("IN_OUT_EMP_TP")));
        entity.setGroupId1(strOf(row.get("GROUP_ID1")));
        entity.setGroupId2(strOf(row.get("GROUP_ID2")));
        entity.setGroupId3(strOf(row.get("GROUP_ID3")));
        secUserRepository.save(entity);
        return true;
    }

    /**
     * deleted 분기 — As-Is deleteCmUser 로직 흡수 (논리삭제 END_ACTIVE_DATE + TB_MCM_SEC_USER_HIS).
     *
     * <p><b>2026-06-04 fix — 계정삭제 동작 점검 (사용자 명시 #3):</b> row 의 {@code END_ACTIVE_DATE} 가
     * "9999-12-31" sentinel (rowAdd default / 활성 사용자의 미지정 값) 이면 today 로 강제 정정.
     * 이전 구현은 9999-12-31 을 그대로 SET 해서 실제 마감이 일어나지 않았음 (계정삭제 무동작 원인).
     *
     * <p><b>2026-09-04 fix — {@code USE_TP='N'} 동시 SET (사용자 결정):</b> 종전에는 END_ACTIVE_DATE 만
     * 마감해서 삭제한 계정이 기본 필터({@code USE_TP='Y'}) 목록에 계속 "사용 여부 Yes" 로 남았고,
     * "계정 재생성" 버튼(FE {@code USE_TP === "Y"} 면 비활성)이 영영 열리지 않았다.
     * 되돌리는 경로는 {@link #reRegCmUser}(→ {@code updateReRegUser(…, "Y")}) 가 이미 담당한다.
     */
    private boolean applyDelete(Map<String, Object> row) {
        String userId = strOf(row.get("USER_ID"));
        LocalDateTime endDt = parseLocalDateTime(row.get("END_ACTIVE_DATE"), LocalDateTime.now());
        // 9999-12-31 sentinel → today 정정 (계정삭제 동작 fix)
        if (endDt != null && endDt.getYear() >= 9999) {
            log.info("[commUserMng.saveCmUser/delete] END_ACTIVE_DATE sentinel ({}) → today 로 정정 (userId={})",
                    endDt, userId);
            endDt = LocalDate.now().atStartOfDay();
        }
        int affected = secUserRepository.updateEndActiveDate(userId, endDt, "N");
        if (affected > 0) {
            String activeDt = endDt.format(YYYYMMDD);
            saveUserHis(userId, activeDt, "D", "M",
                    strOf(row.get("USER_NM")), null, null);
            return true;
        }
        log.warn("[commUserMng.saveCmUser/delete] UPDATE 0 rows — USER_ID={} not found", userId);
        return false;
    }

    // ────────────────────────────────────────────────────────────────
    // action: reRegCmUser — 계정 재생성 (updateReRegUser + mergeCommonPwdInit + HIS)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code reRegCmUser} 본문. As-Is ReRegCommUserMng.java (ds_main.get(0) 단건 처리).
     *
     * <p>처리:
     * <ol>
     *   <li>updateReRegUser — START_ACTIVE_DATE=today / END_ACTIVE_DATE=9999-12-31 / USE_TP=Y</li>
     *   <li>updateReRegUserCnt < 1 → UserException ("사용자 정보 업데이트에 실패했습니다.")</li>
     *   <li>mergeCommonPwdInit (bcrypt DEFAULT_PASSWORD + bcrypt(USER_ID+USER_EMP_NO))</li>
     *   <li>TB_MCM_SEC_USER_HIS insert — PROC_TYPE='C', PROC_CASE='M'</li>
     * </ol>
     */
    public Map<String, Object> reRegCmUser(List<Map<String, Object>> master) {
        int cnt = 0;
        if (master != null && !master.isEmpty()) {
            Map<String, Object> row = master.get(0);
            String userId = strOf(row.get("USER_ID"));
            String userEmpNo = strOf(row.get("USER_EMP_NO"));
            if (userId == null || userId.isBlank()) {
                log.warn("[commUserMng.reRegCmUser] USER_ID null — skip");
            } else {
                LocalDateTime startDt = LocalDate.now().atStartOfDay();
                int affected = secUserRepository.updateReRegUser(userId, startDt, END_OF_TIME, "Y");
                if (affected < 1) {
                    // As-Is UserException — 본 미적용 시 silent log + cnt 0 (오아시스 layer 가 응답 envelope 처리)
                    log.error("[commUserMng.reRegCmUser] 사용자 정보 업데이트에 실패했습니다. USER_ID={}", userId);
                } else {
                    // userId 는 이 분기에서 null 이 아니다 — 분할 전 (userId == null ? "" : userId) 와 같은 값.
                    pwdWriter.resetToInitial(userId, userEmpNo);
                    // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                    saveUserHis(userId, currentYyyymmdd(), "C", "M",
                            strOf(row.get("USER_NM")), null, null);
                    cnt = 1;
                }
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrp — 역할그룹 추가/삭제 + 이력
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrp} 본문. As-Is BPMN SaveRoleGroupHis → Task_saveUserRoleGrp 통합.
     *
     * <p>입력: {@code master} = ds_userRolegrp:U (변경 행만).
     *
     * <p>status 분기 (As-Is SaveRoleGroupHis.java + CommonMultiSaveTask 통합):
     * <ul>
     *   <li>"inserted" / "C" → INSERT (TB_MCM_SEC_USER_MAPPING) + TB_MCM_SEC_USER_ROLL_HIS (RESP_GBN='A')</li>
     *   <li>"deleted"  / "D" → DELETE + TB_MCM_SEC_USER_ROLL_HIS (RESP_GBN='D')</li>
     * </ul>
     */
    public Map<String, Object> saveUserRoleGrp(List<Map<String, Object>> master) {
        int cnt = 0;
        Set<String> touchedRoleGroupIds = new LinkedHashSet<>(); // 캐시 무효화 대상
        if (master != null) {
            String today = currentYyyymmdd();
            for (Map<String, Object> row : master) {
                if (row == null) continue;
                String status = resolveStatus(row);
                String userId = strOf(row.get("USER_ID"));
                String roleGroupId = strOf(row.get("ROLE_GROUP_ID"));
                if (userId == null || userId.isBlank() || roleGroupId == null || roleGroupId.isBlank()) {
                    log.warn("[commUserMng.saveUserRoleGrp] PK null — skip (status={} USER_ID={} ROLE_GROUP_ID={})",
                            status, userId, roleGroupId);
                    continue;
                }
                SecUserMapping.PK pk = new SecUserMapping.PK(userId, roleGroupId);

                if ("inserted".equals(status) || "C".equals(status)) {
                    if (!secUserMappingRepository.existsById(pk)) {
                        SecUserMapping m = new SecUserMapping();
                        m.setUserId(userId);
                        m.setRoleGroupId(roleGroupId);
                        secUserMappingRepository.save(m);
                    }
                    // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                    saveUserRollHis(today, "P", userId, roleGroupId, "A",
                            strOf(row.get("ROLE_GROUP_NM")), null, null);
                    touchedRoleGroupIds.add(roleGroupId);
                    cnt++;
                } else if ("deleted".equals(status) || "D".equals(status)) {
                    if (secUserMappingRepository.existsById(pk)) {
                        secUserMappingRepository.deleteById(pk);
                    }
                    saveUserRollHis(today, "P", userId, roleGroupId, "D",
                            strOf(row.get("ROLE_GROUP_NM")), null, null);
                    touchedRoleGroupIds.add(roleGroupId);
                    cnt++;
                } else {
                    log.debug("[commUserMng.saveUserRoleGrp] skip status={}", status);
                }
            }
        }
        publishRoleChanged(touchedRoleGroupIds);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: saveUserRoleGrpCopy — 역할그룹 복사 (USER_ID_COPY → USER_ID, 비보유분만)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code saveUserRoleGrpCopy} 본문. As-Is SaveRoleGroupCopyHis → Task_0v3mxy0 통합.
     *
     * <p>처리:
     * <ol>
     *   <li>selectRoleMergeObject — USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만 ({@link SecUserMappingRepository#findRoleGroupIdsToCopy})</li>
     *   <li>각 row 별 TB_MCM_SEC_USER_ROLL_HIS save (WORKS_CODE='P', RESP_GBN='A')</li>
     *   <li>mergeCommonCopyRoleGrp 등가 — TB_MCM_SEC_USER_MAPPING saveAll (USER_ID, ROLE_GROUP_ID)</li>
     * </ol>
     */
    public Map<String, Object> saveUserRoleGrpCopy(CommUserMngRoleCopyRequest request) {
        int cnt = 0;
        if (request != null
            && request.getUSER_ID() != null && !request.getUSER_ID().isBlank()
            && request.getUSER_ID_COPY() != null && !request.getUSER_ID_COPY().isBlank()) {
            String userId = request.getUSER_ID();
            String userIdCopy = request.getUSER_ID_COPY();
            String today = currentYyyymmdd();
            List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsToCopy(userId, userIdCopy);
            for (String roleGroupId : roleGroupIds) {
                // ROLE_GROUP_NM — scalar subquery 결과 (xml:271~273) — 단건 lookup
                String roleGroupNm = lookupRoleGroupNm(roleGroupId);
                // 2026-06-04 — INF_REQ_NO / DESCRIPTION 정책 제거. null 적재.
                //   DTO 필드는 호환 유지 (FE 미전송 → null) — request.getINF_REQ_NO() / getDESCRIPTION() 무시.
                saveUserRollHis(today, "P", userId, roleGroupId, "A", roleGroupNm, null, null);
                // TB_MCM_SEC_USER_MAPPING upsert (mergeCommonCopyRoleGrp 등가 — NOT MATCHED INSERT)
                SecUserMapping.PK pk = new SecUserMapping.PK(userId, roleGroupId);
                if (!secUserMappingRepository.existsById(pk)) {
                    SecUserMapping m = new SecUserMapping();
                    m.setUserId(userId);
                    m.setRoleGroupId(roleGroupId);
                    secUserMappingRepository.save(m);
                }
                cnt++;
            }
            publishRoleChanged(new LinkedHashSet<>(roleGroupIds));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /** TB_MCM_SEC_USER_HIS save — 정책 #3 (C) JPA Entity 흡수. */
    private void saveUserHis(String userId, String activeDt, String procType, String procCase,
                             String userNm, String infReqNo, String description) {
        if (userId == null || activeDt == null) return;
        SecUserHis h = new SecUserHis();
        h.setUserId(userId);
        h.setActiveDt(activeDt);
        h.setProcType(procType);
        h.setProcCase(procCase);
        h.setUserNm(userNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(description);
        secUserHisRepository.save(h);
    }

    /** TB_MCM_SEC_USER_ROLL_HIS save — 정책 #3 (C) JPA Entity 흡수 (5 복합 PK upsert / mergePK 등가). */
    private void saveUserRollHis(String opSumupDt, String worksCode, String userId, String roleGroupId,
                                 String respGbn, String roleGroupNm, String infReqNo, String description) {
        if (userId == null || roleGroupId == null) return;
        SecUserRollHis h = new SecUserRollHis();
        h.setOpSumupDt(opSumupDt);
        h.setWorksCode(worksCode);
        h.setUserId(userId);
        h.setRoleGroupId(roleGroupId);
        h.setRespGbn(respGbn);
        h.setRoleGroupNm(roleGroupNm);
        h.setInfReqNo(infReqNo);
        h.setDescription(description);
        secUserRollHisRepository.save(h);
    }

    /** ROLE_GROUP_NM 단건 lookup — saveUserRoleGrpCopy 의 ROLL_HIS 적재 보조. */
    private String lookupRoleGroupNm(String roleGroupId) {
        if (roleGroupId == null || roleGroupId.isBlank()) return null;
        try {
            Object o = entityManager.createNativeQuery(
                    "SELECT ROLE_GROUP_NM FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP WHERE ROLE_GROUP_ID = :id")
                    .setParameter("id", roleGroupId)
                    .getSingleResult();
            return o == null ? null : String.valueOf(o);
        } catch (Exception e) {
            return null;
        }
    }

    /** rowStatus 우선, fallback !nativeeditor_status (As-Is Nexacro 시스템 컬럼). */
    private static String resolveStatus(Map<String, Object> row) {
        String status = strOf(row.get("rowStatus"));
        if (status == null || status.isBlank()) {
            status = strOf(row.get("!nativeeditor_status"));
        }
        return status;
    }

    private static String currentYyyymmdd() {
        return LocalDate.now().format(YYYYMMDD);
    }
}
