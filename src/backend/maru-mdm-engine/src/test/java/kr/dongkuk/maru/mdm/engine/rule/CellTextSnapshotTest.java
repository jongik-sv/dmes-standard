package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 수용 기준 2 — 같은 셀 입력에 바이트 동일 출력(TSK-03-03 design §3.1·§3.2, I1-I16).
 *
 * <p>기대 텍스트는 {@code cell-text-snapshot.json} 이 정본이고(design §6.10.4 표를 옮김), 생성기 출력으로 재생성하지 않는다.
 * 생성 규칙을 바꿔 텍스트가 바뀌면 스냅샷을 손으로 고치고 design.md 이탈 기록에 이유를 적는다(06:269 재배포 필요).
 */
class CellTextSnapshotTest {

    static final String RESOURCE = "cell-text-snapshot.json";

    /** 스냅샷 항목 하나. */
    record SnapshotCase(String id, String kind, DataType dataType, String subject, String maruCodeId, RuleCell cell,
            String text) {

        String generate() {
            return kind.equals("cond")
                    ? CellTextGenerator.conditionText(cell, subject, dataType, maruCodeId)
                    : CellTextGenerator.resultText(cell, dataType);
        }

        @Override
        public String toString() {
            return id;
        }
    }

    static JsonNode root() {
        try (InputStream in = CellTextSnapshotTest.class.getResourceAsStream(RESOURCE)) {
            return new ObjectMapper().readTree(new String(in.readAllBytes(), StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static List<SnapshotCase> cases() {
        List<SnapshotCase> out = new ArrayList<>();
        for (JsonNode c : root().get("cases")) {
            JsonNode cell = c.get("cell");
            List<String> list = null;
            if (cell.hasNonNull("list")) {
                list = new ArrayList<>();
                for (JsonNode e : cell.get("list")) {
                    list.add(e.asText());
                }
                list = List.copyOf(list);
            }
            out.add(new SnapshotCase(
                    c.get("id").asText(),
                    c.get("kind").asText(),
                    DataType.valueOf(c.get("dataType").asText()),
                    text(c, "subject"),
                    text(c, "maruCodeId"),
                    new RuleCell(text(cell, "op"), text(cell, "left"), text(cell, "right"), list, text(cell, "expr"),
                            null, text(cell, "val"), null),
                    c.get("text").asText()));
        }
        return out;
    }

    private static String text(JsonNode n, String field) {
        return n.hasNonNull(field) ? n.get(field).asText() : null;
    }

    static Stream<Arguments> snapshot() {
        return cases().stream().map(Arguments::of);
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("snapshot")
    void 생성_결과가_스냅샷과_바이트_단위로_같다(SnapshotCase c) {
        String actual = c.generate();
        assertEquals(c.text(), actual, c.id());
        assertEquals(List.of(), diffBytes(c.text(), actual), c.id() + " UTF-8 바이트");
    }

    private static List<Integer> diffBytes(String expected, String actual) {
        byte[] e = expected.getBytes(StandardCharsets.UTF_8);
        byte[] a = actual.getBytes(StandardCharsets.UTF_8);
        List<Integer> diff = new ArrayList<>();
        for (int i = 0; i < Math.max(e.length, a.length); i++) {
            if (i >= e.length || i >= a.length || e[i] != a[i]) {
                diff.add(i);
            }
        }
        return diff;
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("snapshot")
    void 같은_입력을_두_번_생성하면_결과가_같다(SnapshotCase c) {
        assertEquals(c.generate(), c.generate(), c.id());
    }

    @Test
    void 숫자_표기만_다른_셀은_같은_텍스트를_낸다() {
        assertEquals(CellTextGenerator.conditionText(new RuleCell("EQ", "1.60", null, null, null, null, null, null),
                        "COIL_THK", DataType.NUMBER, null),
                CellTextGenerator.conditionText(new RuleCell("EQ", "1.6", null, null, null, null, null, null),
                        "COIL_THK", DataType.NUMBER, null));
        assertEquals(CellTextGenerator.conditionText(new RuleCell("EQ", "+007.10", null, null, null, null, null, null),
                        "COIL_THK", DataType.NUMBER, null),
                CellTextGenerator.conditionText(new RuleCell("EQ", "7.1", null, null, null, null, null, null),
                        "COIL_THK", DataType.NUMBER, null));
        assertEquals(CellTextGenerator.resultText(new RuleCell(null, null, null, null, null, null, "1.050", null),
                        DataType.NUMBER),
                CellTextGenerator.resultText(new RuleCell(null, null, null, null, null, null, "1.05", null),
                        DataType.NUMBER));
    }

    @Test
    void 스냅샷_id_는_유일하고_항목은_50개_이상이다() {
        List<SnapshotCase> all = cases();
        Set<String> ids = new HashSet<>();
        for (SnapshotCase c : all) {
            assertTrue(ids.add(c.id()), "중복 id " + c.id());
        }
        assertTrue(all.size() >= 50, "항목 수 " + all.size());
        assertEquals(1, root().get("version").asInt());
    }

    @Test
    void 원소_다섯_개_IN_은_여러_번_생성해도_저장_순서를_지킨다() {
        RuleCell cell = new RuleCell("IN", null, null, List.of("C", "A", "E", "B", "D"), null, null, null, null);
        String first = CellTextGenerator.conditionText(cell, "SURF_GRD", DataType.STRING, null);
        for (int i = 0; i < 20; i++) {
            assertEquals(first, CellTextGenerator.conditionText(cell, "SURF_GRD", DataType.STRING, null));
        }
        assertTrue(first.indexOf("\"C\"") < first.indexOf("\"A\"") && first.indexOf("\"A\"") < first.indexOf("\"E\""),
                first);
    }
}
