package com.dongkuk.dmes.mcm.queryroute;

import com.dongkuk.dmes.mcm.cma.masterCodeSelPop.service.MasterCodeSelPopService;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 조회 라우터 시범(설계 §10) — 마스터코드 선택 팝업의 OASIS 경로(masterCodeSelPop.bpmn → MasterCodeSelPopService, JPA native)와
 * 조회 라우터 경로(/query/masterCodeSelPop.search → 매퍼 persistence/query/cma/masterCodeSelPop.xml)가 같은 입력에 같은 행을
 * 같은 순서·같은 키·같은 값(NULL 포함)으로 돌려주는지 본다. Oracle 시험 PDB 의 MCMAPUSER 를 두 경로가 함께 쓴다.
 *
 * <p>시드는 NULL 인 CODE_VAL_MEAN·CATEGORY_NM, 대소문자 섞인 값, 한글, LIKE 와일드카드 문자(_ %)를 넣고 CODE_VAL 은 모두 달라
 * 정렬(ORDER BY CODE_VAL)이 결정적이다. 행은 운영 뷰 VI_MCM_CODE_ACCESS(Flyway 기준선)의 사본 3표에 넣는다
 * ({@link QueryRouteHarness#insertCodeRows}). Oracle 은 빈 문자열을 NULL 로 저장하므로 CATEGORY_NM "" 행은 두 경로 모두 NULL 을 본다.
 */
class MasterCodeSelPopQueryRouteParityTest {

    static final String MAPPER = "classpath*:persistence/query/cma/masterCodeSelPop.xml";

    private static QueryRouteHarness harness;

    @BeforeAll
    static void start() throws Exception {
        harness = new QueryRouteHarness("query-route-parity", MAPPER,
                ctx -> ctx.registerBean("masterCodeSelPopService", MasterCodeSelPopService.class));
        List<Object[]> rows = new ArrayList<>();
        rows.add(new Object[]{"B029", "abc", "알파벳 소문자", "C1", "분류1"});
        rows.add(new Object[]{"B029", "ABD", "Alpha Upper", "C1", "분류1"});
        rows.add(new Object[]{"B029", "a_1", "밑줄 포함", "C2", null});
        rows.add(new Object[]{"B029", "a%2", null, "C2", null});
        rows.add(new Object[]{"B029", "Z9", "한글 의미", "C3", "분류3"});
        rows.add(new Object[]{"b029", "low-code-id", "코드 ID 소문자", "C1", "분류1"});
        rows.add(new Object[]{"B053", "X1", "Xylophone", "C9", "분류9"});
        rows.add(new Object[]{"B053", "x2", null, "C9", "분류9"});
        rows.add(new Object[]{"B053", "가나", "한글 값", "C9", ""});
        harness.insertCodeRows(rows);
    }

    @AfterAll
    static void stop() {
        harness.close();
    }

    static Stream<Arguments> inputs() {
        return Stream.of(
                Arguments.of("조건 없음", params()),
                Arguments.of("코드 ID 일치", params("pCodeId", "B029")),
                Arguments.of("코드 ID 대소문자 무시", params("pCodeId", "b053")),
                Arguments.of("빈 코드 ID 는 조건 아님", params("pCodeId", "")),
                Arguments.of("값 LIKE", params("pDiv", "CODE_VAL", "pValue", "ab")),
                Arguments.of("값 LIKE 대소문자 무시", params("pDiv", "CODE_VAL", "pValue", "X")),
                Arguments.of("값 LIKE 인데 pValue 없음", params("pDiv", "CODE_VAL")),
                Arguments.of("값 LIKE 와일드카드 문자", params("pDiv", "CODE_VAL", "pValue", "a_")),
                Arguments.of("의미 LIKE 한글", params("pDiv", "CODE_VAL_MEAN", "pValue", "한글")),
                Arguments.of("의미 LIKE — NULL 의미 행 제외", params("pDiv", "CODE_VAL_MEAN", "pValue", "")),
                Arguments.of("알 수 없는 pDiv 는 조건 아님", params("pDiv", "OTHER", "pValue", "a")),
                Arguments.of("코드 ID + 값 LIKE", params("pCodeId", "B029", "pDiv", "CODE_VAL", "pValue", "a")),
                Arguments.of("일치 없음", params("pCodeId", "NONE")));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("inputs")
    void 같은_입력에_같은_행(String name, Map<String, Object> params) throws Exception {
        List<Map<String, Object>> viaOasis = harness.oasis("masterCodeSelPop", "search", "items", params);
        List<Map<String, Object>> viaQuery = harness.query("masterCodeSelPop.search", params);

        assertThat(viaQuery).as("행 순서·키·값(NULL 포함)").containsExactlyElementsOf(viaOasis);
    }

    /**
     * 알려진 차이(현재 동작 고정) — params 에 값이 null 인 키를 명시하면 OASIS 경로는 서비스까지 가지 못하고 S999
     * 「The type cannot be determined because object is null」로 실패한다(oasis 입력 변환). 조회 라우터는 매퍼 bind 가 null 을
     * 빈 문자열로 보므로 키를 뺀 것과 같은 행을 돌려준다. FE 는 지금 null 을 보내지 않는다(pValue 는 늘 문자열).
     */
    @Test
    void pValue_null_명시는_OASIS_만_실패하고_라우터는_키가_없을_때와_같다() throws Exception {
        Map<String, Object> explicitNull = params("pDiv", "CODE_VAL", "pValue", null);

        assertThatThrownBy(() -> harness.oasis("masterCodeSelPop", "search", "items", explicitNull))
                .hasMessageContaining("S999");
        assertThat(harness.query("masterCodeSelPop.search", explicitNull))
                .containsExactlyElementsOf(harness.query("masterCodeSelPop.search", params("pDiv", "CODE_VAL")));
    }

    @Test
    void 결과_키는_FE_가_쓰는_대문자_스네이크_네_개() throws Exception {
        List<Map<String, Object>> rows = harness.query("masterCodeSelPop.search", params("pCodeId", "B029"));

        assertThat(rows).as("CODE_ID 는 UPPER 비교라 b029 행도 든다").hasSize(6);
        assertThat(rows.get(0)).containsOnlyKeys("CODE_VAL", "CODE_VAL_MEAN", "CATEGORY_ID", "CATEGORY_NM");
        assertThat(rows).anySatisfy(r -> assertThat(r).containsEntry("CATEGORY_NM", null));
    }

    private static Map<String, Object> params(Object... kv) {
        Map<String, Object> m = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }
}
