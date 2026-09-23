package kr.dongkuk.maru.mdm.engine.contract;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.AstNode;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.MdmFunction;
import kr.dongkuk.maru.mdm.engine.rule.RuleEngine;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RuleView;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-03-01 design.md §3.1·§6.5·§5 I12-I18 — Java 계약 타입과 엔진 스키마 정본을 양방향으로 대조한다. 영구 규칙.
 *
 * <p>스키마 정본은 main resources 의 {@code engine-contract.schema.json} 한 벌이다. m-mdm 의 TS 타입도 같은 파일에서
 * 생성된다(수용 기준 "Java·TS 타입이 같은 JSON 스키마에서 나온다"). Jackson 은 이 테스트에서만 쓴다(test 의존).
 */
class EngineContractSchemaTest {

    private static final String SCHEMA_RESOURCE = "/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json";
    private static final String DEFS_REF = "#/$defs/";

    private static final JsonNode SCHEMA = load();
    private static final JsonNode DEFS = SCHEMA.get("$defs");

    // ------------------------------------------------------------------ 대응표(design §6.5)

    /** E1-E8 — Java 상수 집합 ↔ 스키마 enum 집합. */
    private static final Map<String, EnumPair> ENUMS = orderedMap(
            new EnumPair("E1", "AstNode", () -> enumNames(AstNode.Type.class), () -> astNodeTypeConsts()),
            new EnumPair("E2", "InfixOperator", () -> AstNode.INFIX_OPERATORS, () -> enumOf("InfixOperator")),
            new EnumPair("E3", "PrefixOperator", () -> AstNode.PREFIX_OPERATORS, () -> enumOf("PrefixOperator")),
            new EnumPair("E4", "DataType", () -> enumNames(DefinitionLookup.DataType.class), () -> enumOf("DataType")),
            new EnumPair("E5", "ErrorCode", () -> enumNames(EngineEvaluationException.Code.class), () -> enumOf("ErrorCode")),
            new EnumPair("E6", "ViolationStage", () -> enumNames(EngineEvaluationException.Stage.class),
                    () -> enumOf("ViolationStage")),
            new EnumPair("E7", "EngineWarningCode", () -> enumNames(EngineWarning.Code.class),
                    () -> enumOf("EngineWarningCode")),
            new EnumPair("E8", "ExprSlot", () -> enumNames(FunctionSets.Slot.class), () -> enumOf("ExprSlot")));

    /** R1-R11 — Java record ↔ 스키마 객체 정의(유니온이면 유니온 뷰). */
    private static final Map<String, RecordPair> RECORDS = orderedMap(
            // params: Java 는 빈 목록(null 아님), JSON 은 자식이 없으면 키를 뺀다(AstExporter 규칙) — 표지 대조에서 뺀다.
            new RecordPair("R1", AstNode.class, "AstNode", Set.of(), Set.of("params")),
            // text: 스냅샷 생성 텍스트(06:1164) — Java 전용 컴포넌트라 이름 대조에서 뺀다.
            new RecordPair("R2", DefinitionLookup.RuleCell.class, "CellJson", Set.of("text"), Set.of()),
            new RecordPair("R3", DefinitionLookup.VarType.class, "VarType", Set.of(), Set.of()),
            new RecordPair("R4", DefinitionLookup.RowContract.class, "RowContract", Set.of(), Set.of()),
            new RecordPair("R5", DefinitionLookup.InputContract.class, "InputContract", Set.of(), Set.of()),
            new RecordPair("R6", EngineEvaluationException.Violation.class, "Violation", Set.of(), Set.of()),
            new RecordPair("R7", EngineWarning.class, "EngineWarning", Set.of(), Set.of()),
            new RecordPair("R8", RuleResult.class, "RuleResult", Set.of(), Set.of()),
            new RecordPair("R9", RuleResult.Hit.class, "RuleHit", Set.of(), Set.of()),
            new RecordPair("R10", RuleResult.RowTrace.class, "RowTrace", Set.of(), Set.of()),
            new RecordPair("R11", RuleSetResult.class, "RuleSetResult", Set.of(), Set.of()));

    /** Java 대응이 없는 $defs 와 그 사유. */
    private static final Set<String> SCHEMA_ONLY = Set.of(
            // AstNode 유니온의 변형 — R1 유니온 뷰로 대조한다.
            "AstNumberLiteral", "AstStringLiteral", "AstVariable", "AstPrefix", "AstInfix", "AstFunction",
            // Java 값은 Object 이고 JSON 직렬화는 호출자 몫이다(06:467).
            "TypedValue",
            // Java RuleCell.op 는 String 이다. op 해석은 TSK-03-03 텍스트 생성기 몫이다. 합집합은 CellOp 테스트가 본다.
            "CellOp", "NoValueOp", "SingleValueOp", "ListOp", "RangeOp",
            // 정합성 코퍼스 — TSK-03-04 러너가 읽는다.
            "CorpusFile", "CorpusCase", "ExprCase", "CellCase", "CodeSets", "Expect",
            // 문자열 형식(KST 벽시계 초 단위).
            "LocalDateTime",
            // 예외 응답 래퍼 — 내용은 R6(Violation)으로 대조한다.
            "EngineError");

    /** expr·rule 패키지의 record·enum 중 스키마 대응이 없는 것과 그 사유. */
    private static final Set<Class<?>> JAVA_ONLY = Set.of(
            // 식 함수 시그니처 — JSON 모양이 아니다(design D7).
            MdmFunction.class,
            // 정의 조회 결과 — JSON 모양은 서버 API 가 정한다(TSK-03-03).
            RuleView.class, RuleView.ColumnView.class, RuleView.RowView.class, RuleView.CellView.class,
            // 입구 인자 — JSON 이 아니다.
            RuleEngine.Part.class);

    // ------------------------------------------------------------------ 테스트

    static Stream<Arguments> enumPairs() {
        return ENUMS.values().stream().map(p -> Arguments.of(p.id(), p));
    }

    static Stream<Arguments> recordPairs() {
        return RECORDS.values().stream().map(p -> Arguments.of(p.id(), p));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("enumPairs")
    void enum_상수_집합이_스키마와_같다(String id, EnumPair pair) {
        assertEquals(new TreeSet<>(pair.java().get()), new TreeSet<>(pair.schema().get()),
                id + " Java 상수 집합과 $defs/" + pair.def() + " 가 다르다");
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("recordPairs")
    void record_컴포넌트_이름이_스키마_속성과_같다(String id, RecordPair pair) {
        Set<String> java = new TreeSet<>(componentNames(pair.type()));
        java.removeAll(pair.javaOnlyComponents());
        Set<String> schema = new TreeSet<>(view(pair.def()).properties().keySet());
        assertEquals(schema, java, id + " " + pair.type().getSimpleName() + " 컴포넌트와 $defs/" + pair.def() + " 속성이 다르다");
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("recordPairs")
    void Nullable_표지가_스키마의_선택_또는_null_허용과_같다(String id, RecordPair pair) {
        View view = view(pair.def());
        List<String> violations = new ArrayList<>();
        for (RecordComponent c : pair.type().getRecordComponents()) {
            String name = c.getName();
            if (pair.javaOnlyComponents().contains(name) || pair.nullableExempt().contains(name)
                    || !view.properties().containsKey(name)) {
                continue;
            }
            boolean marked = c.isAnnotationPresent(Nullable.class);
            boolean optional = !view.required().contains(name) || view.nullable().contains(name);
            if (marked && c.getType().isPrimitive()) {
                violations.add(name + ": primitive 에 @Nullable");
            } else if (marked != optional) {
                violations.add(name + ": @Nullable=" + marked + ", 스키마 선택/null 허용=" + optional);
            }
        }
        assertEquals(List.of(), violations, id + " " + pair.type().getSimpleName() + " ↔ $defs/" + pair.def());
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("recordPairs")
    void record_컴포넌트_타입_종류가_스키마와_맞는다(String id, RecordPair pair) {
        View view = view(pair.def());
        List<String> violations = new ArrayList<>();
        for (RecordComponent c : pair.type().getRecordComponents()) {
            JsonNode prop = view.properties().get(c.getName());
            if (prop == null) {
                continue;
            }
            String kind = kind(prop);
            if (!javaTypeMatches(kind, c.getType(), isLocalDateTimeRef(prop))) {
                violations.add(c.getName() + ": Java " + c.getType().getSimpleName() + " ↔ 스키마 " + kind);
            }
        }
        assertEquals(List.of(), violations, id + " " + pair.type().getSimpleName() + " ↔ $defs/" + pair.def());
    }

    @Test
    void CellOp_는_op_네_묶음의_합집합이고_묶음끼리_겹치지_않는다() {
        List<String> groups = List.of("NoValueOp", "SingleValueOp", "ListOp", "RangeOp");
        Set<String> union = new TreeSet<>();
        int total = 0;
        for (String g : groups) {
            Set<String> values = enumOf(g);
            total += values.size();
            union.addAll(values);
        }
        assertEquals(new TreeSet<>(enumOf("CellOp")), union, "CellOp 가 네 묶음의 합집합이 아니다");
        assertEquals(union.size(), total, "op 묶음끼리 겹치는 값이 있다");
    }

    @Test
    void 모든_defs_는_Java_대응이_있거나_스키마_전용_목록에_있다() {
        Set<String> mapped = new TreeSet<>();
        ENUMS.values().forEach(p -> mapped.add(p.def()));
        RECORDS.values().forEach(p -> mapped.add(p.def()));
        Set<String> overlap = new TreeSet<>(mapped);
        overlap.retainAll(SCHEMA_ONLY);
        assertEquals(Set.of(), overlap, "대응 정의가 스키마 전용 목록에도 있다");

        Set<String> expected = new TreeSet<>(mapped);
        expected.addAll(SCHEMA_ONLY);
        Set<String> actual = new TreeSet<>();
        DEFS.fieldNames().forEachRemaining(actual::add);
        assertEquals(expected, actual, "$defs 목록이 대응표 ∪ 스키마 전용 목록과 다르다");
    }

    @Test
    void expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다() {
        // E1·E4-E8 의 Java enum 과 R1-R11 record 중 expr·rule 에 있는 것(spi 의 대응 타입은 검사 범위 밖이다).
        Set<String> mapped = Stream.concat(
                        RECORDS.values().stream().map(RecordPair::type),
                        Stream.of(AstNode.Type.class, DefinitionLookup.DataType.class, EngineEvaluationException.Code.class,
                                EngineEvaluationException.Stage.class, EngineWarning.Code.class, FunctionSets.Slot.class))
                .map(Class::getName)
                .filter(EngineContractSchemaTest::inExprOrRule)
                .collect(Collectors.toCollection(TreeSet::new));
        Set<String> javaOnly = JAVA_ONLY.stream().map(Class::getName).collect(Collectors.toCollection(TreeSet::new));
        Set<String> overlap = new TreeSet<>(mapped);
        overlap.retainAll(javaOnly);
        assertEquals(Set.of(), overlap, "대응 타입이 Java 전용 목록에도 있다");

        Set<String> actual = new TreeSet<>();
        for (JavaClass c : new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("kr.dongkuk.maru.mdm.engine.expr", "kr.dongkuk.maru.mdm.engine.rule")) {
            if (c.isRecord() || c.isEnum()) {
                actual.add(c.getName());
            }
        }
        Set<String> expected = new TreeSet<>(mapped);
        expected.addAll(javaOnly);
        assertEquals(expected, actual, "expr·rule 의 record·enum 이 대응표 ∪ Java 전용 목록과 다르다");
    }

    @Test
    void 모든_ref_는_defs_안에서_풀린다() {
        List<String> unresolved = new ArrayList<>();
        collectRefs(SCHEMA).forEach(ref -> {
            if (!ref.startsWith(DEFS_REF) || !DEFS.has(ref.substring(DEFS_REF.length()))) {
                unresolved.add(ref);
            }
        });
        assertEquals(List.of(), unresolved, "풀리지 않는 $ref");
    }

    @Test
    void 스키마는_2020_12_이고_title_이_EngineContract_다() {
        assertEquals("https://json-schema.org/draft/2020-12/schema", SCHEMA.path("$schema").asText());
        assertEquals("EngineContract", SCHEMA.path("title").asText());
    }

    // ------------------------------------------------------------------ 판정 헬퍼(design §6.5 알고리즘)

    record EnumPair(String id, String def, Supplier<Set<String>> java, Supplier<Set<String>> schema) implements Keyed {
        @Override
        public String toString() {
            return id + " " + def;
        }
    }

    record RecordPair(String id, Class<?> type, String def, Set<String> javaOnlyComponents, Set<String> nullableExempt)
            implements Keyed {
        @Override
        public String toString() {
            return id + " " + type.getSimpleName() + " ↔ " + def;
        }
    }

    interface Keyed {
        String id();
    }

    /** 유니온 뷰 — 속성은 변형 속성의 합집합, required 는 모든 변형에서 required, null 허용은 어느 변형이든 type 에 null. */
    record View(Map<String, JsonNode> properties, Set<String> required, Set<String> nullable) {}

    @SafeVarargs
    private static <T extends Keyed> Map<String, T> orderedMap(T... values) {
        Map<String, T> map = new LinkedHashMap<>();
        for (T v : values) {
            map.put(v.id(), v);
        }
        return map;
    }

    private static JsonNode load() {
        try (InputStream in = EngineContractSchemaTest.class.getResourceAsStream(SCHEMA_RESOURCE)) {
            assertNotNull(in, "스키마 정본이 classpath 에 없다: " + SCHEMA_RESOURCE);
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static JsonNode resolve(JsonNode node) {
        JsonNode current = node;
        while (current.has("$ref")) {
            String ref = current.get("$ref").asText();
            assertTrue(ref.startsWith(DEFS_REF), "지원하지 않는 $ref: " + ref);
            current = DEFS.get(ref.substring(DEFS_REF.length()));
            assertNotNull(current, "풀리지 않는 $ref: " + ref);
        }
        return current;
    }

    private static JsonNode def(String name) {
        JsonNode node = DEFS.get(name);
        assertNotNull(node, "$defs/" + name + " 가 없다");
        return node;
    }

    private static View view(String defName) {
        JsonNode def = resolve(def(defName));
        List<JsonNode> variants = new ArrayList<>();
        if (def.has("oneOf")) {
            def.get("oneOf").forEach(v -> variants.add(resolve(v)));
        } else {
            variants.add(def);
        }
        Map<String, JsonNode> properties = new LinkedHashMap<>();
        Set<String> required = null;
        Set<String> nullable = new TreeSet<>();
        for (JsonNode v : variants) {
            v.path("properties").fields().forEachRemaining(e -> {
                properties.putIfAbsent(e.getKey(), e.getValue());
                if (typeNames(e.getValue()).contains("null")) {
                    nullable.add(e.getKey());
                }
            });
            Set<String> req = new HashSet<>();
            v.path("required").forEach(r -> req.add(r.asText()));
            if (required == null) {
                required = req;
            } else {
                required.retainAll(req);
            }
        }
        return new View(properties, required == null ? Set.of() : required, nullable);
    }

    private static List<String> typeNames(JsonNode schema) {
        JsonNode type = schema.get("type");
        if (type == null) {
            return List.of();
        }
        if (type.isArray()) {
            List<String> names = new ArrayList<>();
            type.forEach(t -> names.add(t.asText()));
            return names;
        }
        return List.of(type.asText());
    }

    /** 속성 스키마의 종류 — type 의 null 아닌 첫 값, 문자열 const·enum 이면 string, oneOf 면 첫 변형의 종류. */
    private static String kind(JsonNode prop) {
        JsonNode p = resolve(prop);
        List<String> types = typeNames(p).stream().filter(t -> !t.equals("null")).toList();
        if (!types.isEmpty()) {
            return types.get(0);
        }
        if (p.has("const")) {
            return p.get("const").isTextual() ? "string" : "non-string-const";
        }
        if (p.has("enum")) {
            boolean allText = true;
            for (JsonNode v : p.get("enum")) {
                allText &= v.isTextual();
            }
            return allText ? "string" : "mixed-enum";
        }
        if (p.has("oneOf")) {
            return kind(p.get("oneOf").get(0));
        }
        return "unknown";
    }

    private static boolean isLocalDateTimeRef(JsonNode prop) {
        return (DEFS_REF + "LocalDateTime").equals(prop.path("$ref").asText());
    }

    private static boolean javaTypeMatches(String kind, Class<?> t, boolean localDateTimeRef) {
        return switch (kind) {
            // Instant: RuleResult·RuleSetResult.evalTs 는 Java 가 Instant, JSON 은 KST 벽시계 LocalDateTime 문자열이다.
            // 엔진은 record 를 돌려주고 JSON 직렬화는 호출자 몫이라(06:467) 직렬화 층이 MdmExpressionConfig.ZONE 으로 바꾼다.
            case "string" -> t == String.class || t.isEnum()
                    || (localDateTimeRef && (t == Instant.class || t == LocalDateTime.class));
            case "integer" -> t == int.class || t == Integer.class;
            case "boolean" -> t == boolean.class || t == Boolean.class;
            case "array" -> t == List.class;
            case "object" -> t == Map.class || t.isRecord();
            default -> false;
        };
    }

    private static Set<String> enumOf(String defName) {
        JsonNode node = resolve(def(defName));
        JsonNode values = node.get("enum");
        assertNotNull(values, "$defs/" + defName + " 에 enum 이 없다");
        Set<String> result = new TreeSet<>();
        values.forEach(v -> result.add(v.asText()));
        assertEquals(values.size(), result.size(), "$defs/" + defName + " enum 에 중복 값이 있다");
        return result;
    }

    private static Set<String> astNodeTypeConsts() {
        Set<String> result = new TreeSet<>();
        JsonNode oneOf = def("AstNode").get("oneOf");
        assertNotNull(oneOf, "$defs/AstNode 가 oneOf 유니온이 아니다");
        oneOf.forEach(v -> {
            JsonNode c = resolve(v).path("properties").path("type").get("const");
            assertNotNull(c, "AstNode 변형에 type.const 가 없다: " + v);
            result.add(c.asText());
        });
        return result;
    }

    private static Set<String> enumNames(Class<? extends Enum<?>> type) {
        return Arrays.stream(type.getEnumConstants()).map(Enum::name).collect(Collectors.toCollection(TreeSet::new));
    }

    private static List<String> componentNames(Class<?> record) {
        assertTrue(record.isRecord(), record.getName() + " 가 record 가 아니다");
        return Arrays.stream(record.getRecordComponents()).map(RecordComponent::getName).toList();
    }

    private static boolean inExprOrRule(String className) {
        return className.startsWith("kr.dongkuk.maru.mdm.engine.expr.")
                || className.startsWith("kr.dongkuk.maru.mdm.engine.rule.");
    }

    private static List<String> collectRefs(JsonNode node) {
        List<String> refs = new ArrayList<>();
        if (node.isObject()) {
            node.fields().forEachRemaining(e -> {
                if (e.getKey().equals("$ref")) {
                    refs.add(e.getValue().asText());
                } else {
                    refs.addAll(collectRefs(e.getValue()));
                }
            });
        } else if (node.isArray()) {
            node.forEach(n -> refs.addAll(collectRefs(n)));
        }
        return refs;
    }
}
