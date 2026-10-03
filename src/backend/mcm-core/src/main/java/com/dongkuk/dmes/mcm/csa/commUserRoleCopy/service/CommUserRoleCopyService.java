/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserRoleCopy OASIS BPMN serviceTask entry point — 3 action (W7)
 *       searchUserList / search / save
 */
package com.dongkuk.dmes.mcm.csa.commUserRoleCopy.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto.CommUserRoleCopySaveRequest;
import com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto.CommUserRoleCopySearchRequest;
import com.dongkuk.dmes.mcm.entity.SecUserMapping;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRollHisRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import static com.dongkuk.dmes.mcm.common.util.McmValues.strOf;

/**
 * commUserRoleCopy — OASIS BPMN serviceTask entry point (W7 / csa 9 화면 7번째).
 *
 * <p>Spring bean name {@code commUserRoleCopyService} → BPMN {@code <camunda:class>commUserRoleCopyService</camunda:class>}.
 *
 * <p>BPMN action 3 (As-Is 3 → To-Be 3 — 분석 §1 / §8.3 / BPMN설계서):
 * <ol>
 *   <li>{@code searchUserList} → {@link #searchUserList()} — 전체 사용자 List 조회 (selectUserList xml:7~19, ds_userFrom)</li>
 *   <li>{@code search}         → {@link #search(CommUserRoleCopySearchRequest)} — Copy 대상 사용자 + 보유 RoleGroup
 *       (selectCopyUserMap xml:21~27 + selectCopyRoleGroupList xml:29~37 chain, ds_copyUser + ds_copyRolegrp)</li>
 *   <li>{@code save}           → {@link #save(CommUserRoleCopySaveRequest, List)} — RoleGroup 일괄 복사 + 권한부여 이력
 *       (As-Is SaveRoleGroupCopy.java 본문 흡수 — 외곽 루프 + selectRoleMergeObject + saveAll 이력 + mergeCommonCopyRoleGrp)</li>
 * </ol>
 *
 * <p>가이드 §6-B (트랜잭션 / Proxy 안티패턴) — 본 Service 에 {@code @Transactional} ✗.
 * OASIS executor {@code SpringTransactionHandler} 가 BPMN process 단위로 자동 wrap (단일 UserTask 트랜잭션 등가).
 *
 * <p>본 화면 자체 Entity / Repository 신설 ✗ — 모두 commUserMng (W5) 정본 재사용 (정책 #11):
 * <ul>
 *   <li>{@code SecUserMapping} (W5 owner) / {@code SecUserMappingRepository#findRoleGroupIdsToCopy} 재사용</li>
 *   <li>{@code SecUserRollHis} (W5 owner) / {@code SecUserRollHisRepository#save} 재사용</li>
 *   <li>SecUser / DeptInfo (W5 owner) — EntityManager native query 직접 (W6 패턴 정합)</li>
 * </ul>
 *
 * <p>To-Be 정책 (분석 §11 + Q-001~Q-006 해소 2026-05-31):
 * <ul>
 *   <li>#1 / Q-001 — As-Is 외부 namespace {@code CommUserMngMapper.selectRoleMergeObject} 결함 정정 →
 *       본 화면 namespace 정본 → JPA {@code findRoleGroupIdsToCopy} 흡수</li>
 *   <li>#2 / Q-004 — As-Is EAI scalar subquery (EAIUSER.IF_GW01MMFSHD01/02) 폐기 →
 *       DMES 자체 {@code TB_MCM_DEPT_INFO LEFT JOIN}</li>
 *   <li>#3 / Q-003 — BPMN save flow 후속 task 미연결 = As-Is 의도된 분리 (FE 콜백 재조회 패턴) 보존</li>
 *   <li>#5 — Q-005 RESP_GBN='A' 추가 / Q-008 WORKS_CODE='P' Permission 하드코딩 보존</li>
 *   <li>#6 / Q-002 / Q-006 — As-Is 외부 namespace {@code TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK} 폐기 →
 *       JPA Entity {@code SecUserRollHis.saveAll} 흡수 (5 컬럼 복합 PK upsert 의 mergePK 동작 등가)</li>
 *   <li>#11 — Entity / Repository 자체 신설 ✗ — W5 owner 재사용</li>
 * </ul>
 *
 * <p>BPMN definition: {@code services/csa/commUserRoleCopy/commUserRoleCopy.bpmn}.
 */
@Service("commUserRoleCopyService")
public class CommUserRoleCopyService {

    private static final Logger log = LoggerFactory.getLogger(CommUserRoleCopyService.class);

    /** 권한부여 이력 WORKS_CODE 하드코딩 (As-Is SaveRoleGroupCopy.java:57 / LV-001 Q-008 — Permission 추정). */
    private static final String WORKS_CODE_PERMISSION = "P";

    /** 권한부여 이력 RESP_GBN 하드코딩 (As-Is SaveRoleGroupCopy.java:60 / LV-002 Q-005 — A=Add 확정). */
    private static final String RESP_GBN_ADD = "A";

    private static final DateTimeFormatter YYYYMMDD = DateTimeFormatter.ofPattern("yyyyMMdd");

    /**
     * 2026-06-04 사용자 명시 fix (a) — searchUserList 응답에서 Copy 대상 사용자(본인) 제외.
     * 권한 생성 대상자(target) 는 Copy 대상(source) 와 달라야 의미 있음 (자기 자신에게 자기 권한 복사는 no-op).
     * FE 가 edt_userIdCopy 로 검색한 USER_ID 또는 USER_EMP_NO 를 전달하면 본 메서드가 일치 row 를 제외.
     */

    private final SecUserMappingRepository secUserMappingRepository;
    private final SecUserRollHisRepository secUserRollHisRepository;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    private final SecRoleGroupMappingRepository secRoleGroupMappingRepository;
    private final ApplicationEventPublisher eventPublisher;

    public CommUserRoleCopyService(SecUserMappingRepository secUserMappingRepository,
                                   SecUserRollHisRepository secUserRollHisRepository,
                                   SecRoleGroupMappingRepository secRoleGroupMappingRepository,
                                   ApplicationEventPublisher eventPublisher) {
        this.secUserMappingRepository = secUserMappingRepository;
        this.secUserRollHisRepository = secUserRollHisRepository;
        this.secRoleGroupMappingRepository = secRoleGroupMappingRepository;
        this.eventPublisher = eventPublisher;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchUserList — 전체 사용자 List 조회 (selectUserList xml:7~19)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchUserList} 진입점. As-Is {@code selectUserList} (xml:7~19) 변환.
     *
     * <p>To-Be SQL (Q-004 해소 정책 #2 — EAI 폐기 + DEPT_INFO JOIN):
     * <pre>{@code
     * SELECT S.USER_ID, S.USER_EMP_NO, S.USER_NM, D.DEPT_NM
     *   FROM MCMAPUSER.TB_MCM_SEC_USER S
     *   LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D
     *     ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP = 'Y'
     *  WHERE S.END_ACTIVE_DATE > GETDATE() AND S.USE_TP = 'Y'
     *    AND (:pUserIdCopy IS NULL OR (S.USER_ID <> :pUserIdCopy AND S.USER_EMP_NO <> :pUserIdCopy))
     *  ORDER BY D.DEPT_NM, S.USER_NM ASC
     * }</pre>
     *
     * <p>2026-06-04 사용자 명시 fix (a) — {@code pUserIdCopy} 가 전달되면 본인(Copy 대상) row 를 응답에서 제외.
     * (USER_ID 또는 USER_EMP_NO 가 일치하는 경우 모두 제외 — search 와 동일 OR 조건).
     *
     * <p>응답: {@code ds_userFrom} (As-Is dataset 이름 보존 / 분석 §3.7 DS-003 / 5 컬럼 — CHK 는 클라이언트 only).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchUserList(CommUserRoleCopySearchRequest request) {
        String pUserIdCopy = request != null ? request.getPUserIdCopy() : null;
        boolean excludeSelf = pUserIdCopy != null && !pUserIdCopy.isBlank();

        StringBuilder sql = new StringBuilder()
                .append("SELECT S.USER_ID, S.USER_EMP_NO, S.USER_NM, D.DEPT_NM ")
                .append("  FROM MCMAPUSER.TB_MCM_SEC_USER S ")
                .append("  LEFT JOIN MCMAPUSER.TB_MCM_DEPT_INFO D ")
                .append("    ON D.DEPT_CD = S.DEPT_CD AND D.USE_TP = 'Y' ")
                // GETDATE() 는 MSSQL 전용 — 로컬 SQLite 개발계에서는 CURRENT_TIMESTAMP 로 분기한다.
                // (미분기 시 "no such function: GETDATE" 로 조회가 통째로 실패하고, OASIS 가 이를
                //  HTTP 200 + meta.success=false 로 돌려줘 화면에는 빈 목록으로만 보였다. 2026-08-07)
                .append(" WHERE S.END_ACTIVE_DATE > ")
                .append(McmAuditStatementInspector.isSqlite() ? "CURRENT_TIMESTAMP" : "GETDATE()")
                .append(" AND S.USE_TP = 'Y' ");
        if (excludeSelf) {
            // 2026-06-04 fix (a) — Copy 대상(본인) 제외
            // 2026-09-04 fix — USER_EMP_NO 가 NULL 인 사용자까지 함께 사라지던 3값 논리 결함 수정.
            //   `NULL <> 'x'` 는 TRUE 가 아니라 UNKNOWN 이라 WHERE 가 그 행을 통째로 버린다
            //   (사번 미등록 사용자가 권한 복사 대상 목록에서 전부 증발).
            sql.append("   AND S.USER_ID <> :pUserIdCopy ")
               .append("   AND (S.USER_EMP_NO IS NULL OR S.USER_EMP_NO <> :pUserIdCopy) ");
        }
        sql.append(" ORDER BY D.DEPT_NM, S.USER_NM ASC");

        var q = entityManager.createNativeQuery(sql.toString());
        if (excludeSelf) {
            q.setParameter("pUserIdCopy", pUserIdCopy);
        }
        List<Object[]> rows = q.getResultList();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("USER_ID", row[0]);
            r.put("USER_EMP_NO", row[1]);
            r.put("USER_NM", row[2]);
            r.put("DEPT_NM", row[3]);
            outRows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_userFrom", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: search — Copy 대상 사용자 + 보유 RoleGroup 조회 (chain)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code search} 진입점. As-Is {@code fn_search} (xfdl:299~314) 변환.
     *
     * <p>2 SQL chain:
     * <ol>
     *   <li>{@code selectCopyUserMap} (xml:21~27) — Copy 대상 사용자 1 명 조회 (USER_ID 또는 USER_EMP_NO OR)</li>
     *   <li>{@code selectCopyRoleGroupList} (xml:29~37) — Copy 대상이 보유한 RoleGroup List</li>
     * </ol>
     *
     * <p>응답: {@code ds_copyUser} + {@code ds_copyRolegrp} (As-Is dataset 이름 보존 / 분석 §3.7 DS-001, DS-002).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> search(CommUserRoleCopySearchRequest request) {
        String pUserIdCopy = request != null ? request.getPUserIdCopy() : null;

        // 1) selectCopyUserMap — Copy 대상 사용자 (USER_ID 또는 USER_EMP_NO)
        List<Map<String, Object>> userOut = new ArrayList<>();
        if (pUserIdCopy != null && !pUserIdCopy.isBlank()) {
            String userSql =
                    "SELECT USER_ID, USER_EMP_NO, USER_NM " +
                    "  FROM MCMAPUSER.TB_MCM_SEC_USER " +
                    " WHERE USER_ID = :p OR USER_EMP_NO = :p";
            List<Object[]> userRows = entityManager.createNativeQuery(userSql)
                    .setParameter("p", pUserIdCopy)
                    .getResultList();
            for (Object[] row : userRows) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("USER_ID", row[0]);
                r.put("USER_EMP_NO", row[1]);
                r.put("USER_NM", row[2]);
                userOut.add(r);
            }
        }

        // 2) selectCopyRoleGroupList — Copy 대상의 보유 RoleGroup
        //    As-Is xml:29~37 — USER_ID = pUserIdCopy OR USER_ID = (SELECT USER_ID FROM TB_MCM_SEC_USER WHERE USER_EMP_NO = pUserIdCopy)
        //    + scalar subquery ROLE_GROUP_NM
        List<Map<String, Object>> rolegrpOut = new ArrayList<>();
        if (pUserIdCopy != null && !pUserIdCopy.isBlank()) {
            String rgSql =
                    "SELECT A.USER_ID, A.ROLE_GROUP_ID, " +
                    "       (SELECT R.ROLE_GROUP_NM FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP R " +
                    "         WHERE R.ROLE_GROUP_ID = A.ROLE_GROUP_ID) AS ROLE_GROUP_NM " +
                    "  FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING A " +
                    " WHERE A.USER_ID = :p " +
                    "    OR A.USER_ID = (SELECT U.USER_ID FROM MCMAPUSER.TB_MCM_SEC_USER U " +
                    "                     WHERE U.USER_EMP_NO = :p) " +
                    " ORDER BY A.ROLE_GROUP_ID";
            List<Object[]> rgRows = entityManager.createNativeQuery(rgSql)
                    .setParameter("p", pUserIdCopy)
                    .getResultList();
            for (Object[] row : rgRows) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("USER_ID", row[0]);
                r.put("ROLE_GROUP_ID", row[1]);
                r.put("ROLE_GROUP_NM", row[2]);
                rolegrpOut.add(r);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_copyUser", userOut);
        out.put("ds_copyRolegrp", rolegrpOut);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: save — RoleGroup 일괄 복사 + 권한부여 이력 적재
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code save} 진입점. As-Is {@code SaveRoleGroupCopy.java:24~87} 본문 흡수 (Q-001/Q-002/Q-006 해소 적용).
     *
     * <p>처리 흐름 (N=ds_userTo 권한생성 대상자 수 / M=user 별 Copy 대상의 미보유 RoleGroup 수):
     * <pre>{@code
     * for user in ds_userTo (N건):
     *     roleGroupIds = secUserMappingRepository.findRoleGroupIdsToCopy(user.USER_ID, pUserIdCopy)
     *                    // To-Be (Q-001 정책 #1) — As-Is 외부 namespace CommUserMngMapper 결함 정정 →
     *                    // 본 화면 정본 → JPA Repository findRoleGroupIdsToCopy 흡수
     *
     *     for roleGroupId in roleGroupIds (M건):
     *         roleGroupNm = lookupRoleGroupNm(roleGroupId)
     *         secUserRollHisRepository.save(new SecUserRollHis(
     *             OP_SUMUP_DT=today_yyyyMMdd, WORKS_CODE='P', user.USER_ID, roleGroupId,
     *             RESP_GBN='A', roleGroupNm, pInfReqNo, pDescription))
     *             // To-Be (Q-002/Q-006 정책 #6) — As-Is 외부 namespace TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK
     *             //   폐기 → JPA Entity SecUserRollHis save() 흡수 (mergePK 5 복합 PK upsert 등가)
     *
     *     mergeCommonCopyRoleGrp(pUserIdCopy, user.USER_ID)
     *         // As-Is xml:53~68 MERGE 의 To-Be — JPA existsById 가드 + save (WHEN NOT MATCHED INSERT 등가)
     *
     *     cnt++ (사용자 단위)
     * }</pre>
     *
     * <p>응답: {@code cnt_save} (As-Is CommonDaoUtil.addDaoResultIntoContext java:79 등가).
     * BPMN flow save 분기는 EndEvent 직진 — FE 콜백이 별도 fn_searchUserList() 호출로 ds_userFrom 새로고침 (Q-003 보존).
     */
    public Map<String, Object> save(CommUserRoleCopySaveRequest request, List<Map<String, Object>> master) {
        int cnt = 0;
        String pUserIdCopy = request != null ? request.getPUserIdCopy() : null;
        // 2026-06-04 사용자 명시 — FE 가 정보처리의뢰서/처리사유 UI 폐기 후 빈 문자열("") 전달.
        //   빈 문자열을 null 로 정규화하여 SecUserRollHis 에 null 적재 (DB nullable 보존).
        String pInfReqNo   = blankToNull(request != null ? request.getPInfReqNo()    : null);
        String pDescription = blankToNull(request != null ? request.getPDescription() : null);

        if (pUserIdCopy == null || pUserIdCopy.isBlank()) {
            log.warn("[commUserRoleCopy.save] pUserIdCopy null/empty — skip");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("cnt_save", 0);
            return out;
        }
        if (master == null || master.isEmpty()) {
            log.warn("[commUserRoleCopy.save] master(ds_userTo) empty — skip");
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("cnt_save", 0);
            return out;
        }

        String today = LocalDate.now().format(YYYYMMDD);

        log.info("[commUserRoleCopy.save] start — pUserIdCopy=[{}], targets={}건",
                pUserIdCopy, master.size());

        Set<String> touchedRoleGroupIds = new LinkedHashSet<>(); // 캐시 무효화 대상

        // 외곽 루프 — 권한 생성 대상자 (ds_userTo 행 N건)
        for (Map<String, Object> row : master) {
            if (row == null) continue;
            String userId = strOf(row.get("USER_ID"));
            if (userId == null || userId.isBlank()) {
                log.warn("[commUserRoleCopy.save] USER_ID null — skip row");
                continue;
            }
            // 2026-06-04 fix (b) — target == source 방지 가드 (fix (a) FE 본인 제외 보강용 BE 안전망).
            //   자기 자신에게 자기 권한 복사 시 NOT IN 결과 = 0 → no-op 이긴 하나 명시적으로 skip + 로그.
            if (userId.equals(pUserIdCopy)) {
                log.warn("[commUserRoleCopy.save] target=={} same as source — skip (no-op)", userId);
                continue;
            }

            // (a) selectRoleMergeObject — Copy 대상의 RoleGroup 중 user 가 미보유 한 것 만
            //     To-Be (Q-001 정책 #1): 본 namespace 정본 → JPA findRoleGroupIdsToCopy 흡수.
            //     W5 SecUserMappingRepository#findRoleGroupIdsToCopy(userId, userIdCopy) 시그니처와 정합.
            List<String> roleGroupIds = secUserMappingRepository.findRoleGroupIdsToCopy(userId, pUserIdCopy);
            log.info("[commUserRoleCopy.save] target=[{}] — 신규 부여 ROLE_GROUP {}건", userId, roleGroupIds.size());

            // (b) 내부 루프 — 새로 부여될 RoleGroup 별 권한부여 이력 적재 + 매핑 INSERT
            //     To-Be (Q-002/Q-006 정책 #6): 외부 Mapper TB_MCM_SEC_USER_ROLL_HIS_Mapper.mergePK 폐기 →
            //                                 SecUserRollHis save() (5 복합 PK upsert 등가)
            for (String roleGroupId : roleGroupIds) {
                if (roleGroupId == null || roleGroupId.isBlank()) continue;
                String roleGroupNm = lookupRoleGroupNm(roleGroupId);

                // 권한부여 이력 (TB_MCM_SEC_USER_ROLL_HIS)
                SecUserRollHis h = new SecUserRollHis();
                h.setOpSumupDt(today);
                h.setWorksCode(WORKS_CODE_PERMISSION);
                h.setUserId(userId);
                h.setRoleGroupId(roleGroupId);
                h.setRespGbn(RESP_GBN_ADD);
                h.setRoleGroupNm(roleGroupNm);
                h.setInfReqNo(pInfReqNo);
                h.setDescription(pDescription);
                secUserRollHisRepository.save(h);

                // mergeCommonCopyRoleGrp (xml:53~68 MERGE WHEN NOT MATCHED THEN INSERT) 등가.
                //   2026-06-04 round-5 — 종전 entityManager.persist 분기는 OASIS transaction 컨텍스트에서
                //   commit 안 됨 결함 발견 → JpaRepository.save() 로 복원 (commRoleGrpMng 의 SecRoleGroupMapping
                //   복합 PK + @IdClass 동일 패턴 정상 동작 확인 — 본 화면도 동일 패턴 정합).
                SecUserMapping.PK pk = new SecUserMapping.PK(userId, roleGroupId);
                if (!secUserMappingRepository.existsById(pk)) {
                    SecUserMapping m = new SecUserMapping();
                    m.setUserId(userId);
                    m.setRoleGroupId(roleGroupId);
                    secUserMappingRepository.save(m);
                    log.info("[commUserRoleCopy.save] INSERT TB_MCM_SEC_USER_MAPPING (userId={}, roleGroupId={})",
                            userId, roleGroupId);
                } else {
                    log.info("[commUserRoleCopy.save] SKIP (이미 보유) userId={}, roleGroupId={}",
                            userId, roleGroupId);
                }
                touchedRoleGroupIds.add(roleGroupId);
            }

            cnt++; // 사용자 단위 counter (As-Is SaveRoleGroupCopy.java:77 cnt++)
        }

        // 영속 컨텍스트 flush 로 INSERT/UPDATE 실제 발행 확인 (이후 트랜잭션 commit 단계에서 실패 시 명확한 예외).
        entityManager.flush();

        // 2026-09-04 fix — 사용자↔역할그룹 매핑이 바뀌면 UserPermCache(TTL 10분)를 즉시 비운다.
        // 이 발행이 없어 권한을 복사해도 최대 10분간 실제 API 호출이 403 이었다.
        if (!touchedRoleGroupIds.isEmpty()) {
            List<String> roleIds = secRoleGroupMappingRepository
                    .findRoleIdsByRoleGroupIdIn(new ArrayList<>(touchedRoleGroupIds));
            if (roleIds != null && !roleIds.isEmpty()) {
                eventPublisher.publishEvent(new RoleChangedEvent(new LinkedHashSet<>(roleIds)));
            }
        }
        log.info("[commUserRoleCopy.save] done — cnt_save={}", cnt);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cnt_save", cnt);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // helpers
    // ────────────────────────────────────────────────────────────────

    /**
     * ROLE_GROUP_NM 단건 lookup — ROLL_HIS 적재 보조 (W5 패턴 정합).
     * As-Is selectRoleMergeObject 의 scalar subquery (xml:43) 등가.
     */
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

    /**
     * 2026-06-04 — 빈 문자열("") / 공백만 있는 문자열을 null 로 정규화.
     * FE 가 정보처리의뢰서/처리사유 UI 폐기 후 빈 문자열을 보냄 → DB nullable 컬럼에 null 적재.
     */
    private static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
