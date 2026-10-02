package com.dongkuk.dmes.mdm.dme;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleScreenSupport;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleViewService;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleListRow;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleMngViewResult;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleMngService;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * D-144 — 룰 버전 1.000·1.001·2.000 혼합에서 최신·현재 RELEASED, 버전 정렬, 정의 조회가 정확한지(Review Focus 1·2).
 *
 * <p>SQLite NUMERIC 친화도는 1.000 을 INTEGER, 1.001 을 REAL 로 저장한다. 정수 번호를 가정한 비교·정렬이 남아 있으면 1.001 이
 * 1.000 이나 1 로 잘리거나, 정렬에서 같은 major 의 minor 를 놓친다. 현재 시각은 {@link DmeTestSupport#NOW}(2026-06-15 09:00 KST).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleVersionDecimalSqliteTest extends AbstractMdmSharedDbTest {

    static final BigDecimal V1 = new BigDecimal("1.000");
    static final BigDecimal V1_1 = new BigDecimal("1.001");
    static final BigDecimal V2 = new BigDecimal("2.000");

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    RuleMngService ruleMng;
    @Autowired
    RuleViewService ruleEdit;
    @Autowired
    RuleQueries queries;
    @Autowired
    RuleConfirmService ruleConfirm;
    @Autowired
    RuleConfirmChecks confirmChecks;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleSetRepository setRepository;
    @Autowired
    RuleSetVersionQueries setVersions;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
    }

    /** v1.000(1~2월) → v1.001(2월~) RELEASED, v2.000 DRAFT. 결과 변수 이름은 버전마다 다르다. */
    private void mixedRule(String id) {
        DmeTestSupport.rule(jdbc, id, "혼합 " + id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, V1, "MAJOR", "FIRST", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
        DmeTestSupport.var(jdbc, id, V1, 1, "RESULT", "Value", "OUT_OLD", 1, "STRING");
        DmeTestSupport.row(jdbc, id, V1, 1, 0, "DEFAULT", "{\"1\":{\"val\":\"OLD\"}}");
        DmeTestSupport.released(jdbc, id, V1_1, "MINOR", "FIRST", "2026-02-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, V1_1, 1, "RESULT", "Value", "OUT_NEW", 1, "STRING");
        DmeTestSupport.row(jdbc, id, V1_1, 1, 0, "DEFAULT", "{\"1\":{\"val\":\"NEW\"}}");
        DmeTestSupport.pending(jdbc, id, V2, "MAJOR", "DRAFT", "kim", "FIRST", V1_1);
    }

    @Test
    void SQLite_는_1_000_을_INTEGER_로_1_001_을_REAL_로_저장한다() {
        mixedRule("R_MIX");
        assertThat(jdbc.queryForList("SELECT typeof(VER) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'R_MIX' ORDER BY COALESCE(APPLY_FROM, '9999')",
                String.class)).containsExactly("integer", "real", "integer");
    }

    @Test
    void 헤더_화면은_버전을_소수_내림차순_문자열로_싣고_현재_RELEASED_는_같은_major_의_minor_다() {
        mixedRule("R_MIX");

        RuleMngViewRequest req = new RuleMngViewRequest();
        req.setMaruRuleId("R_MIX");
        RuleMngViewResult view = ruleMng.view(req);

        assertThat(view.getVersions()).extracting(RuleMngViewResult.VersionRow::getVer).containsExactly("2.000", "1.001", "1.000");
        assertThat(view.getVersions()).extracting(RuleMngViewResult.VersionRow::getVerKind).containsExactly("MAJOR", "MINOR", "MAJOR");
        assertThat(view.getVersions()).extracting(RuleMngViewResult.VersionRow::getVerLabel).containsExactly("v2.000", "v1.001", "v1.000");
        assertThat(view.getVersions().get(0).getBaseVer()).isEqualTo("1.001");
        assertThat(view.getFlags().getCurrentVer()).isEqualTo("1.001");
    }

    @Test
    void 목록은_현재_RELEASED_와_미적용_버전을_소수_문자열로_싣는다() {
        mixedRule("R_MIX");

        RuleSearchRequest req = new RuleSearchRequest();
        req.setKeyword("R_MIX");
        List<RuleListRow> rows = ruleMng.search(req).getList();

        assertThat(rows).singleElement().satisfies(row -> {
            assertThat(row.getReleasedVer()).isEqualTo("1.001");
            assertThat(row.getPendingVer()).isEqualTo("2.000");
        });
    }

    @Test
    void 정의_조회는_판정_시각의_minor_버전을_잘리지_않게_읽는다() {
        mixedRule("R_MIN");
        StoredDefinitionLookup lookup = new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository);

        // 2026-03-01 00:00 KST — v1.001 구간
        RuleDefinition now = lookup.rule("R_MIN", Instant.parse("2026-02-28T15:00:00Z")).orElseThrow();
        assertThat(now.ver()).isEqualByComparingTo("1.001");
        assertThat(now.ver().scale()).isEqualTo(3);
        assertDefinitionOf(now, "OUT_NEW", "NEW"); // 버전 번호만이 아니라 1.001 의 변수·행을 읽었다(:ver 바인딩이 1 로 잘리면 OUT_OLD)
        // 2026-01-15 00:00 KST — v1.000 구간
        RuleDefinition old = lookup.rule("R_MIN", Instant.parse("2026-01-14T15:00:00Z")).orElseThrow();
        assertThat(old.ver()).isEqualByComparingTo("1.000");
        assertDefinitionOf(old, "OUT_OLD", "OLD");

        // prefetch 경로도 같은 버전을 고른다(varsOf·rowsOf 의 (룰, 버전) 쌍 조건)
        StoredDefinitionLookup prefetched = new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository);
        prefetched.prefetch(List.of("R_MIN"), Instant.parse("2026-02-28T15:00:00Z"));
        RuleDefinition viaPrefetch = prefetched.rule("R_MIN", Instant.parse("2026-02-28T15:00:00Z")).orElseThrow();
        assertThat(viaPrefetch.ver()).isEqualByComparingTo("1.001");
        assertDefinitionOf(viaPrefetch, "OUT_NEW", "NEW");
    }

    /** 정의의 결과 변수 이름과 기본 행의 결과 값 — 버전마다 다르게 넣었다({@link #mixedRule}). */
    private static void assertDefinitionOf(RuleDefinition def, String resultName, String defaultVal) {
        assertThat(def.vars()).extracting(RuleVar::varName).containsExactly(resultName);
        assertThat(def.rows()).singleElement().satisfies(r -> assertThat(r.cells().get(1).val()).isEqualTo(defaultVal));
    }

    @Test
    void 최신_RELEASED_결과_변수는_같은_major_의_minor_에서_읽는다() {
        mixedRule("R_LR");

        assertThat(queries.latestReleasedResultVars()).filteredOn(v -> "R_LR".equals(v.getMaruRuleId()))
                .extracting(MdmRuleVar::getVarName).containsExactly("OUT_NEW");
        assertThat(queries.latestReleasedVers(List.of("R_LR")).get("R_LR")).isEqualTo(V1_1);
    }

    @Test
    void 최신_RELEASED_에_결과_변수가_없으면_옛_버전의_결과_변수로_내려가지_않는다() {
        DmeTestSupport.rule(jdbc, "R_NORES", "결과 없음", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_NORES", V1, "MAJOR", "FIRST", "2026-01-01 00:00:00", "2026-02-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_NORES", V1, 1, "RESULT", "Value", "OUT_OLD", 1, "STRING");
        DmeTestSupport.released(jdbc, "R_NORES", V1_1, "MINOR", "FIRST", "2026-02-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_NORES", V1_1, 1, "COND", "1", "IN_A", 1, null);

        assertThat(queries.latestReleasedResultVars()).noneMatch(v -> "R_NORES".equals(v.getMaruRuleId()));
    }

    @Test
    void 내용_화면은_문자열_1_001_로_minor_버전을_고른다() {
        mixedRule("R_SEL");

        RuleEditViewRequest req = new RuleEditViewRequest();
        req.setMaruRuleId("R_SEL");
        req.setVer("1.001");
        RuleEditViewResult view = ruleEdit.view(req);

        assertThat(view.getSelectedVer()).isEqualTo("1.001");
        assertThat(view.getVersions()).extracting(r -> r.getVer()).containsExactly("2.000", "1.001", "1.000");
        // 1.001 의 내용을 읽었다 — 변수·행을 1.000 으로 잘라 읽으면 OUT_OLD·OLD 가 나온다
        assertThat(view.getVars()).extracting(ResolvedVar::varName).containsExactly("OUT_NEW");
        assertThat(view.getRows()).singleElement().satisfies(r -> assertThat(r.getCells()).contains("NEW").doesNotContain("OLD"));
        // 2.000 DRAFT 의 base 는 1.001 — base 화면 칸도 1.001 의 내용이다
        RuleEditViewRequest draft = new RuleEditViewRequest();
        draft.setMaruRuleId("R_SEL");
        draft.setVer("2.000");
        RuleEditViewResult draftView = ruleEdit.view(draft);
        assertThat(draftView.getBaseVars()).extracting(ResolvedVar::varName).containsExactly("OUT_NEW");
    }

    @Test
    void 확정_화면의_직전_RELEASED_는_같은_major_의_minor_다() {
        mixedRule("R_CNF");

        RuleConfirmViewRequest req = new RuleConfirmViewRequest();
        req.setMaruRuleId("R_CNF"); // ver 를 비우면 DRAFT(2.000)
        Map<String, Object> view = ruleConfirm.view(req);

        assertThat(map(view, "version")).containsEntry("ver", "2.000");
        assertThat(map(view, "previous")).containsEntry("ver", "1.001").containsEntry("verLabel", "v1.001");
        assertThat(view.get("firstVersion")).isEqualTo(false);
        // diff base 도 1.001 — 2.000 DRAFT 는 행이 없으므로 1.001 의 기본 행(NEW)이 REMOVED 로 보인다
        assertThat((List<?>) view.get("diff")).singleElement().satisfies(d -> {
            assertThat(map(d, null)).containsEntry("kind", "REMOVED");
            assertThat((String) map(d, null).get("oldCells")).contains("NEW").doesNotContain("OLD");
        });
        VersionDiff diff = confirmChecks.diff(new VersionRef(VersionTarget.BUSINESS_RULE, "R_CNF", new BigDecimal("2.000")));
        assertThat(diff.base()).isEqualTo(new VersionRef(VersionTarget.BUSINESS_RULE, "R_CNF", V1_1));
        assertThat(confirmChecks.previousReleased("R_CNF", V2)).map(v -> v.getVer()).contains(V1_1);
        assertThat(confirmChecks.previousReleased("R_CNF", V1_1)).map(v -> v.getVer()).contains(V1);
    }

    @Test
    void 버전_문자열_형식_오류는_MDM021_이고_빈_값은_필수_오류다() {
        mixedRule("R_FMT");
        for (String bad : List.of("1.0001", "v1", "abc")) {
            RuleEditViewRequest req = new RuleEditViewRequest();
            req.setMaruRuleId("R_FMT");
            req.setVer(bad);
            BusinessException e = assertThrows(BusinessException.class, () -> ruleEdit.view(req), bad);
            assertThat(e.getErrors()).hasSize(1);
            assertThat(e.getErrors().get(0).code()).isEqualTo("MDM021");
        }
        BusinessException blank = assertThrows(BusinessException.class, () -> RuleScreenSupport.requireVer(" "));
        assertThat(blank.getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(RuleScreenSupport.requireVer("1")).isEqualTo(V1); // 정수 문자열도 받는다(옛 화면 호환)
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object owner, String key) {
        return (Map<String, Object>) (key == null ? owner : ((Map<String, Object>) owner).get(key));
    }
}
