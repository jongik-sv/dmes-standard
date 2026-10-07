/*
 * 내용: commUserMng 조회 action 5개 — searchCmUser / searchUserRoleGrp / searchRoleGrp / commonUserDept / searchDeptLov.
 *       BPMN 진입점은 퍼사드 {@link CommUserMngService}(빈 commUserMngService)이고 이 클래스는 본문만 갖는다.
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngDeptRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.entity.DeptInfo;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * commUserMng 조회 — 사용자 그리드·보유/추가 가능 역할그룹·부서 팝업·부서 LoV.
 *
 * <p>BPMN 이 직접 부르지 않는다. {@link CommUserMngService} 퍼사드가 같은 이름의 메서드로 위임한다.
 * {@code @Transactional} 을 붙이지 않는다 — OASIS {@code SpringTransactionHandler} 가 BPMN 프로세스 단위로 감싼다.
 */
@Service("commUserMngQueryService")
public class CommUserMngQueryService {

    private final SecUserRepository secUserRepository;
    private final DeptInfoRepository deptInfoRepository;

    @PersistenceContext(unitName = "default")
    private EntityManager entityManager;

    public CommUserMngQueryService(SecUserRepository secUserRepository,
                                   DeptInfoRepository deptInfoRepository) {
        this.secUserRepository = secUserRepository;
        this.deptInfoRepository = deptInfoRepository;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchCmUser — 메인 사용자 그리드 조회 + ds_mainAll 후속 chain
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchCmUser} 본문. As-Is {@code selectCommUser} (xml:7~40) + {@code selectCommUserAll}
     * (xml:42~46) BPMN Task_searchCmUser → Task_0970821 chain 통합.
     *
     * <p>처리:
     * <ol>
     *   <li>{@link SecUserRepository#searchByFilter(String, String, String)} — 본 18 컬럼 검색</li>
     *   <li>각 row 의 DEPT_NM 부착 — distinct DEPT_CD 를 DeptInfoRepository.findAllById 1회로 조회 (정책 #2 / T-008)</li>
     *   <li>{@link SecUserRepository#findAllUserIdEmpNo()} — ds_mainAll 적재 (V-004 / V-006 중복 검증용)</li>
     *   <li>{@code ds_main} + {@code ds_mainAll} 두 grid 반환</li>
     * </ol>
     */
    public Map<String, Object> searchCmUser(CommUserMngSearchRequest request) {
        String pUserKey = request != null ? request.getEdtUSERID() : null;
        String pUseTp   = request != null ? request.getCboUSETP()  : null;
        String pInOut   = request != null ? request.getCboINOUTEMPTP() : null;

        List<SecUser> rows = secUserRepository.searchByFilter(pUserKey, pUseTp, pInOut);

        Map<String, String> deptNmCache = deptNamesOf(rows);

        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (SecUser u : rows) {
            outRows.add(toMainRow(u, deptNmCache.get(u.getDeptCd())));
        }

        // ds_mainAll (V-004 / V-006 전체 사용자 중복 검증용 USER_ID / USER_EMP_NO 만)
        List<Map<String, Object>> outAllRows = new ArrayList<>();
        for (Object[] row : secUserRepository.findAllUserIdEmpNo()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("USER_ID", row[0]);
            r.put("USER_EMP_NO", row[1]);
            outAllRows.add(r);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_main", outRows);
        out.put("ds_mainAll", outAllRows);
        return out;
    }

    /**
     * 조회 행들이 쓰는 부서코드의 부서명 — distinct DEPT_CD 를 모아 {@code findAllById} 1회로 읽는다.
     *
     * <p>의미(이전 findById 루프와 같다):
     * <ul>
     *   <li>null·공백 부서코드는 조회 대상에서 뺀다 → DEPT_NM null.</li>
     *   <li>없는 부서는 맵에 없다 → DEPT_NM null.</li>
     *   <li>USE_TP 를 거르지 않는다 → 비활성 부서도 이름이 붙는다({@code searchByDeptKey} 와 다르다).</li>
     *   <li>키는 DB 가 돌려준 DEPT_CD 그대로다(정확 일치). 행 순서는 호출측이 {@code rows} 순서로 만든다.</li>
     *   <li>알려진 차이 — MSSQL 의 대소문자·뒤 공백 무시 비교에서만 생긴다: 사용자 DEPT_CD 가 부서 마스터와 대소문자·뒤 공백만
     *       다르면 전(요청 키로 부착)에는 이름이 붙었고 지금은 null 이다. Oracle·PostgreSQL·SQLite·H2 에서는 같다(perf-mcm.md P1).</li>
     *   <li>전제 — distinct 부서코드 수 ≲ 2000(MSSQL 바인드 파라미터 한도 2100). Oracle 의 IN 1000 한도는 Hibernate dialect 가 나눈다.</li>
     * </ul>
     */
    private Map<String, String> deptNamesOf(List<SecUser> rows) {
        Set<String> deptCds = new LinkedHashSet<>();
        for (SecUser u : rows) {
            String deptCd = u.getDeptCd();
            if (deptCd != null && !deptCd.isBlank()) {
                deptCds.add(deptCd);
            }
        }
        Map<String, String> deptNms = new HashMap<>();
        if (deptCds.isEmpty()) return deptNms;
        for (DeptInfo d : deptInfoRepository.findAllById(deptCds)) {
            deptNms.put(d.getDeptCd(), d.getDeptNm());
        }
        return deptNms;
    }

    /**
     * As-Is {@code selectCommUser} (xml:7~40) 응답 row 조립 — 19 컬럼 (SecUser 18 + DEPT_NM scalar).
     *
     * <p>응답 컬럼명 (SNAKE_CASE) 은 As-Is dataset 컬럼명 (분석 §3.8 DS-001) 보존.
     */
    private Map<String, Object> toMainRow(SecUser u, String deptNm) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("USER_ID", u.getUserId());
        row.put("USER_EMP_NO", u.getUserEmpNo());
        row.put("SSO_ID", u.getSsoId());
        row.put("USER_NM", u.getUserNm());
        row.put("START_ACTIVE_DATE", u.getStartActiveDate());
        row.put("END_ACTIVE_DATE", u.getEndActiveDate());
        row.put("DEPT_CD", u.getDeptCd());
        row.put("USER_CATEGORY_CD", u.getUserCategoryCd());
        row.put("USE_TP", u.getUseTp());
        row.put("EMAIL", u.getEmail());
        row.put("TEL_NO", u.getTelNo());
        row.put("MOBILE_TEL_NO", u.getMobileTelNo());
        row.put("IN_OUT_EMP_TP", u.getInOutEmpTp());
        row.put("GROUP_ID1", u.getGroupId1());
        row.put("GROUP_ID2", u.getGroupId2());
        row.put("GROUP_ID3", u.getGroupId3());
        row.put("DEPT_NM", deptNm); // 정책 #2 — DeptInfo 별도 조회 부착 (As-Is EAI scalar subquery 대체)
        return row;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchUserRoleGrp — 선택 사용자의 보유 역할그룹 조회
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchUserRoleGrp} 본문. As-Is {@code selectCommUserRoleGrp} (xml:152~161).
     *
     * <p>TB_MCM_SEC_USER_MAPPING A JOIN TB_MCM_SEC_ROLEGROUP B ON A.ROLE_GROUP_ID=B.ROLE_GROUP_ID
     * WHERE A.USER_ID = #{USER_ID}.
     *
     * <p>응답: {@code ds_userRolegrp} (As-Is dataset 이름 보존 / 분석 §3.8 DS-002).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchUserRoleGrp(CommUserMngUserIdRequest request) {
        String userId = request != null ? request.getUSER_ID() : null;
        List<Map<String, Object>> outRows = new ArrayList<>();
        if (userId != null && !userId.isBlank()) {
            String sql =
                    "SELECT A.ROLE_GROUP_ID, B.ROLE_GROUP_NM, A.USER_ID " +
                    "  FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING A " +
                    "  JOIN MCMAPUSER.TB_MCM_SEC_ROLEGROUP B ON A.ROLE_GROUP_ID = B.ROLE_GROUP_ID " +
                    " WHERE A.USER_ID = :userId " +
                    " ORDER BY A.ROLE_GROUP_ID";
            List<Object[]> rows = entityManager.createNativeQuery(sql)
                    .setParameter("userId", userId)
                    .getResultList();
            for (Object[] row : rows) {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("ROLE_GROUP_ID", row[0]);
                r.put("ROLE_GROUP_NM", row[1]);
                r.put("USER_ID", row[2]);
                outRows.add(r);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_userRolegrp", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchRoleGrp — 추가 가능 역할그룹 조회 (활성 + 사용자 미보유)
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchRoleGrp} 본문. As-Is {@code selectCommRoleGrpList} (xml:182~194).
     *
     * <p>TB_MCM_SEC_ROLEGROUP WHERE USE_TP='Y' AND today BETWEEN START_ACTIVE_DATE AND COALESCE(END_ACTIVE_DATE, today+100)
     * AND NOT EXISTS (TB_MCM_SEC_USER_MAPPING B WHERE B.USER_ID = #{USER_ID} AND B.ROLE_GROUP_ID = A.ROLE_GROUP_ID).
     *
     * <p>응답: {@code ds_rolegrpList} (As-Is dataset 이름 보존 / 분석 §3.8 DS-003).
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> searchRoleGrp(CommUserMngUserIdRequest request) {
        String userId = request != null ? request.getUSER_ID() : null;
        // Oracle 단일화(oracle-1007) — 방언 분기 없이 Oracle·H2 공통 ANSI 형(LOCALTIMESTAMP·COALESCE·INTERVAL)을 쓴다.
        // CURRENT_TIMESTAMP 가 아니라 LOCALTIMESTAMP 인 까닭: Oracle COALESCE 는 인자 형이 같아야 한다(NVL 과 달리 암묵 변환을
        // 기대할 수 없다). END_ACTIVE_DATE 는 TIMESTAMP(6) 인데 CURRENT_TIMESTAMP 는 TIMESTAMP WITH TIME ZONE 이라 ORA-00932 위험이
        // 있다. LOCALTIMESTAMP 는 세션 시간대(Asia/Seoul) 기준 TIMESTAMP 라 형이 맞는다.
        // (방언에 없는 함수가 섞이면 조회가 통째로 실패하고, OASIS 가 이를 HTTP 200 + meta.success=false 로 돌려줘
        //  역할그룹 목록이 조용히 빈 채로 보인다 — 2026-08-07 SQLite 사례)
        String now = "LOCALTIMESTAMP";
        // INTERVAL '100' DAY 는 기본 앞자리 정밀도가 2라 ORA-01873 — 세 자리를 쓰려면 DAY(3) 을 적는다(2026-10-07 Oracle 26ai 실측).
        String endDefault = "COALESCE(A.END_ACTIVE_DATE, LOCALTIMESTAMP + INTERVAL '100' DAY(3))";
        String sql =
                "SELECT A.ROLE_GROUP_ID, A.ROLE_GROUP_NM " +
                "  FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP A " +
                " WHERE A.USE_TP = 'Y' " +
                "   AND " + now + " BETWEEN A.START_ACTIVE_DATE AND " + endDefault + " " +
                "   AND NOT EXISTS (SELECT 'X' FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING B " +
                "                    WHERE B.USER_ID = :userId AND B.ROLE_GROUP_ID = A.ROLE_GROUP_ID) " +
                " ORDER BY A.ROLE_GROUP_ID";
        List<Object[]> rows = entityManager.createNativeQuery(sql)
                .setParameter("userId", userId == null ? "" : userId)
                .getResultList();
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("ROLE_GROUP_ID", row[0]);
            r.put("ROLE_GROUP_NM", row[1]);
            outRows.add(r);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_rolegrpList", outRows);
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: commonUserDept — 부서 팝업 조회
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code commonUserDept} 본문. As-Is {@code selectCommDept} (xml:251~263 To-Be 갱신).
     *
     * <p>정책 #2 / Q-002 해소 — EAI 폐기, DMES 자체 {@code TB_MCM_DEPT_INFO} 단독 조회.
     *
     * <p>응답: {@code ds_userDept} (As-Is dataset 이름 보존 / 분석 §3.9 FX-006 commonDynamic 정합).
     */
    public Map<String, Object> commonUserDept(CommUserMngDeptRequest request) {
        String pDeptKey = request != null ? request.getEdt_DEPT_CD() : null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_userDept", deptRows(deptInfoRepository.searchByDeptKey(pDeptKey)));
        return out;
    }

    // ────────────────────────────────────────────────────────────────
    // action: searchDeptLov — Detail 부서 LoV 모달 (2026-06-04 신설 / 사용자 결정)
    // 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 그리드 (DEPT_CD/DEPT_NM) → 선택 시 자동 세트
    // ────────────────────────────────────────────────────────────────

    /**
     * action {@code searchDeptLov} 본문 (2026-06-04 신설 / 사용자 결정).
     *
     * <p>Detail 영역 부서코드를 직접 타이핑하지 않고 검색 모달로 선택.
     * 모달 그리드: DEPT_CD / DEPT_NM (TB_MCM_DEPT_INFO 조회).
     *
     * <p>처리: {@link DeptInfoRepository#searchByDeptKey(String)} 재사용 — keyword 를
     * DEPT_CD prefix LIKE 또는 DEPT_NM 부분 LIKE (UPPER) 로 검색 (USE_TP='Y' 강제).
     *
     * <p>응답: {@code ds_deptLov} key 의 {@code List<Map>} (2 컬럼 DEPT_CD / DEPT_NM).
     *
     * <p>참고 패턴: commRoleMng round-3 {@code searchObjectLov} (분석 §5 P-001 / Q-016).
     */
    public Map<String, Object> searchDeptLov(CommUserMngSearchDeptLovRequest request) {
        String keyword = request != null ? request.getKeyword() : null;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ds_deptLov", deptRows(deptInfoRepository.searchByDeptKey(keyword)));
        return out;
    }

    /** 부서 팝업·LoV 공통 행 — DEPT_CD / DEPT_NM 2 컬럼, 저장소가 돌려준 순서 그대로. */
    private static List<Map<String, Object>> deptRows(List<DeptInfo> rows) {
        List<Map<String, Object>> outRows = new ArrayList<>(rows.size());
        for (DeptInfo d : rows) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("DEPT_CD", d.getDeptCd());
            r.put("DEPT_NM", d.getDeptNm());
            outRows.add(r);
        }
        return outRows;
    }
}
