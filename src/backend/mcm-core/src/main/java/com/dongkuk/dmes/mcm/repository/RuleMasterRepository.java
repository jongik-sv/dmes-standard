package com.dongkuk.dmes.mcm.repository;

import com.dongkuk.dmes.mcm.entity.RuleMaster;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

/**
 * 업무기준 목록조회 (cmb/masterRuleList) Repository.
 *
 * <p>설계: `docs/mcm/design/masterRuleList/masterRuleList_분석리포트.md` §6.1
 * (As-Is MasterRuleListMapper.GetRuleMasterList) 의 ANSI/JPQL 변환.
 *
 * <p>INSERT/UPDATE 는 {@link JpaRepository#save} (PK=RULE_ID) — rowStatus C/U 분기는 Service.
 * 중복 PK 사전체크는 {@link JpaRepository#existsById} (BR-001/013). delete 경로 부재(As-Is 보존).
 */
public interface RuleMasterRepository extends JpaRepository<RuleMaster, String> {

    /**
     * 조회 (As-Is GetRuleMasterList 1:1, 분석 §6.1).
     *
     * <p>SELECT 12 컬럼 (As-Is dataset 보존):
     * RULE_ID / OLD_RULE_ID / RULE_NM / RULE_DESC / RULE_VER / RULE_TP /
     * RULE_OWNER_DEPT_NM / RULE_OWNER_EMP_NO / USE_TP /
     * CREATION_TIMESTAMP(C_AT) / LAST_UPDATED_OBJECT_ID(U_USR_ID) / LAST_UPDATE_TIMESTAMP(U_AT).
     *
     * <p>고정 필터 2 (As-Is 보존):
     * <ul>
     *   <li>BR-002 이력행 제외 — {@code RULE_ID != COALESCE(OLD_RULE_ID,'ZZZZ0000')}</li>
     *   <li>BR-003 활성만 — {@code COALESCE(USE_TP,'N') != 'N'}</li>
     * </ul>
     * 동적 필터 2 (UPPER 양변 contains — Q-012 유지):
     * pRuleId / pRuleNm (공란 시 제외).
     *
     * @return {@code Object[]{ ruleId, oldRuleId, ruleNm, ruleDesc, ruleVer, ruleTp,
     *         ruleOwnerDeptNm, ruleOwnerEmpNo, useTp, createdAt, updatedBy, updatedAt }}
     */
    @Query("""
            SELECT e.ruleId, e.oldRuleId, e.ruleNm, e.ruleDesc, e.ruleVer,
                   e.ruleTp, e.ruleOwnerDeptNm, e.ruleOwnerEmpNo, e.useTp,
                   e.createdAt, e.updatedBy, e.updatedAt
              FROM RuleMaster e
             WHERE e.ruleId <> COALESCE(e.oldRuleId, 'ZZZZ0000')
               AND COALESCE(e.useTp, 'N') <> 'N'
               AND (:pRuleId IS NULL OR :pRuleId = '' OR UPPER(e.ruleId) LIKE UPPER(CONCAT('%', :pRuleId, '%')))
               AND (:pRuleNm IS NULL OR :pRuleNm = '' OR UPPER(e.ruleNm) LIKE UPPER(CONCAT('%', :pRuleNm, '%')))
             ORDER BY e.ruleId
            """)
    List<Object[]> searchRuleMasterList(@Param("pRuleId") String pRuleId,
                                        @Param("pRuleNm") String pRuleNm);

    /**
     * 팝업 조회 (cmb/masterRuleListPop — As-Is MasterRuleListPopMapper.GetRuleMasterList 1:1,
     * 분석 §6.1).
     *
     * <p>SELECT 9 컬럼 (As-Is 보존 — 표시는 RULE_ID/RULE_NM 2종이나 SELECT 는 9 컬럼 유지):
     * RULE_ID / OLD_RULE_ID / RULE_NM / RULE_DESC / RULE_VER / RULE_TP /
     * RULE_OWNER_DEPT_NM / RULE_OWNER_EMP_NO / USE_TP.
     *
     * <p>{@link #searchRuleMasterList} (masterRuleList 화면용) 과의 As-Is 차이 (임의 통합 금지):
     * <ul>
     *   <li>고정 필터 = {@code RULE_ID != NVL(OLD_RULE_ID,' ')} 만 (BR-001 — 공백 폴백.
     *       masterRuleList 의 'ZZZZ0000' 폴백·USE_TP 활성 필터 없음 — 본 팝업은 USE_TP 무관 전체 현행 표시)</li>
     *   <li>audit 3 컬럼 미반환</li>
     * </ul>
     * 동적 2조건 pRuleId/pRuleNm = UPPER 양변 contains LIKE (BR-002/003), ORDER BY RULE_ID (BR-004).
     *
     * @return {@code Object[]{ ruleId, oldRuleId, ruleNm, ruleDesc, ruleVer, ruleTp,
     *         ruleOwnerDeptNm, ruleOwnerEmpNo, useTp }}
     */
    @Query("""
            SELECT e.ruleId, e.oldRuleId, e.ruleNm, e.ruleDesc, e.ruleVer,
                   e.ruleTp, e.ruleOwnerDeptNm, e.ruleOwnerEmpNo, e.useTp
              FROM RuleMaster e
             WHERE e.ruleId <> COALESCE(e.oldRuleId, ' ')
               AND (:pRuleId IS NULL OR :pRuleId = '' OR UPPER(e.ruleId) LIKE UPPER(CONCAT('%', :pRuleId, '%')))
               AND (:pRuleNm IS NULL OR :pRuleNm = '' OR UPPER(e.ruleNm) LIKE UPPER(CONCAT('%', :pRuleNm, '%')))
             ORDER BY e.ruleId
            """)
    List<Object[]> searchRuleMasterListPop(@Param("pRuleId") String pRuleId,
                                           @Param("pRuleNm") String pRuleNm);
}
