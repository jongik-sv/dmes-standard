package com.dongkuk.dmes.mcm.init.seed;

import com.dongkuk.dmes.mcm.entity.RuleMaster;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;

import java.math.BigDecimal;
import java.util.List;

/**
 * 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 시드 (2026-10-04 DataInitializer 분할).
 *
 * <p>local/local-ph/local-kp 프로필에서만 돌고, sentinel PK 'USD' 가 있으면 skip 한다. 저장소 빈이 없으면 skip 한다.
 */
public final class RuleMasterSampleSeeder {

    private static final Logger log = LoggerFactory.getLogger("com.dongkuk.dmes.mcm.init.DataInitializer");

    private final Environment environment;
    private final RuleMasterRepository ruleMasterRepository;

    /** {@code ruleMasterRepository} 는 null 일 수 있다(빈 미등록 환경). */
    public RuleMasterSampleSeeder(Environment environment, RuleMasterRepository ruleMasterRepository) {
        this.environment = environment;
        this.ruleMasterRepository = ruleMasterRepository;
    }

    /**
     * 업무기준(cmb/masterRuleList) 조회 필터 검증용 샘플 시드 — 개발체크리스트 ITEM-BE-05.
     *
     * <p><b>local/local-ph/local-kp tier 한정</b>(WildFly dev/prod·실운영 제외) — 사용자 결정 2026-06-05:
     * MSSQL 검증용으로 직결 프로파일에도 허용(구 mssql/dev → 신 local-ph/local-kp, 2026-07-07 개편).
     * <b>idempotent</b> — sentinel PK 'USD' 존재 시 skip (재부팅 누적 방지).
     *
     * <p>6 row 로 고정 필터 2종(분석 §6.1 / 기능 BR-002·BR-003)을 교차 검증:
     * USD/USDFWD/EUR/JPY 활성 + USDOFF(USE_TP='N', BR-003) + USDHIST(OLD_RULE_ID=RULE_ID, BR-002).
     * audit(C_USR_ID 등)는 인증 컨텍스트 없는 시드라 McmAuditListener 가 null 로 둠(C_AT/VER 만 채움).
     */
    public void initRuleMasterSampleData() {
        if (ruleMasterRepository == null) {
            return;   // mcm-core repository 빈 미등록 환경 — skip
        }
        // 시드 허용 = local/local-ph/local-kp (bootRun 직결 개발·검증 tier). WildFly JNDI(dev/prod) 및 실운영 제외.
        // 프로파일 개편 (2026-07-07 JNDI 전환 설계): 구 mssql→local-ph, 구 dev(직결)→local-kp.
        //   신 dev 는 WildFly JNDI 프로파일이 되어 시드 대상에서 제외 (가짜 시드가 개발계 WAS 기동으로 주입되는 것 방지).
        // acceptsProfiles — 프로파일 미지정 bootRun 의 default(local) 폴백도 인식.
        boolean seedAllowed = environment.acceptsProfiles(Profiles.of("local", "local-ph", "local-kp"));
        if (!seedAllowed) {
            return;   // dev/prod 등 WAS·실운영 — 가짜 시드 미주입
        }
        List<String> active = List.of(environment.getActiveProfiles());   // 로그 표기용
        if (ruleMasterRepository.existsById("USD")) {
            return;   // 이미 시드됨 — idempotent
        }

        List<RuleMaster> samples = List.of(
                rule("USD", null, "USD 미국 달러 환율 적용기준", "수출입 USD 환산 기준", "재무팀", "E0001", "Y"),
                rule("USDFWD", null, "USD 선물환 적용기준", "선물환 USD 헤지 기준", "재무팀", "E0002", "Y"),
                rule("EUR", null, "유로 환율 적용기준 EUR", "유럽향 EUR 환산 기준", "재무팀", "E0003", "Y"),
                rule("JPY", null, "엔화 환율 적용기준 JPY", "일본향 JPY 환산 기준", "재무팀", "E0004", "Y"),
                // BR-003 검증 — USE_TP='N' (검색어 USD 매칭이어도 제외돼야 정상)
                rule("USDOFF", null, "USD 사용중지 기준", "폐기된 USD 기준(미사용)", "재무팀", "E0005", "N"),
                // BR-002 검증 — OLD_RULE_ID=RULE_ID 이력행 (검색어 USD 매칭이어도 제외돼야 정상)
                rule("USDHIST", "USDHIST", "USD 구 환율기준(이력)", "이전 버전 USD 기준", "재무팀", "E0006", "Y")
        );
        ruleMasterRepository.saveAll(samples);
        log.info("[DataInitializer] 업무기준(TB_MCA_RULE_MASTER) 샘플 시드 완료 — {} row ({} profile·BR-002/003 검증용)",
                samples.size(), active);
    }

    /** RuleMaster 샘플 행 빌더 — RULE_TP='A'·RULE_VER=1 고정(As-Is rowAdd 기본값 xfdl:229·231). */
    private static RuleMaster rule(String ruleId, String oldRuleId, String ruleNm, String ruleDesc,
                                   String ownerDeptNm, String ownerEmpNo, String useTp) {
        RuleMaster e = new RuleMaster();
        e.setRuleId(ruleId);
        e.setOldRuleId(oldRuleId);
        e.setRuleNm(ruleNm);
        e.setRuleDesc(ruleDesc);
        e.setRuleVer(BigDecimal.ONE);
        e.setRuleTp("A");
        e.setRuleOwnerDeptNm(ownerDeptNm);
        e.setRuleOwnerEmpNo(ownerEmpNo);
        e.setUseTp(useTp);
        return e;
    }
}
