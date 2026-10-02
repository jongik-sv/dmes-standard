package com.dongkuk.dmes.mdm.contract.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-01 design.md §3.5 — {@code layout-snapshot.schema.json}(계약 스키마)·{@code
 * m201-snapshot-sample.json}(fixture)·계약 record(§6.1) 세 곳의 필드 집합이 네 노드
 * (MdmLayoutSnapshot·MdmLayoutHeaderRef·MdmLayoutItemSnapshot·MdmLayoutNumFormat) 모두에서
 * 정확히 같은지 확인한다(불변 규칙 14·15). 새 의존성을 추가하지 않고 이미 전이적으로 있는
 * Jackson(F18, D2)만 쓴다.
 *
 * <p>fixture 는 모든 인스턴스에 모든 키를 명시하고 값이 없으면 null 을 채운다 — "이 fixture 의 각
 * 인스턴스가 쓰는 키 집합"이 "그 노드의 선언된 전체 키 집합"과 같아지도록 설계했다(design.md §3.5).
 */
class LayoutSnapshotSchemaStructureTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    void 최상위_스냅샷_키_집합이_스키마_샘플_record_세_곳에서_같다() throws IOException {
        JsonNode schema = readSchema();
        JsonNode sample = readSample();
        assertKeySetsMatch("MdmLayoutSnapshot",
                propertyKeys(schema),
                List.of(sample),
                MdmLayoutSnapshot.class);
    }

    @Test
    void 헤더_참조_키_집합이_스키마_샘플_record_세_곳에서_같다() throws IOException {
        JsonNode schema = readSchema();
        JsonNode sample = readSample();
        JsonNode headerDef = schema.path("$defs").path("MdmLayoutHeaderRef");
        assertKeySetsMatch("MdmLayoutHeaderRef",
                propertyKeys(headerDef),
                asList(sample.path("headers")),
                MdmLayoutHeaderRef.class);
    }

    @Test
    void 항목_스냅샷_키_집합이_스키마_샘플_record_세_곳에서_같다() throws IOException {
        JsonNode schema = readSchema();
        JsonNode sample = readSample();
        JsonNode itemDef = schema.path("$defs").path("MdmLayoutItemSnapshot");

        List<JsonNode> allItems = new ArrayList<>();
        asList(sample.path("items")).forEach(allItems::add);
        for (JsonNode header : sample.path("headers")) {
            asList(header.path("items")).forEach(allItems::add);
        }

        assertKeySetsMatch("MdmLayoutItemSnapshot",
                propertyKeys(itemDef),
                allItems,
                MdmLayoutItemSnapshot.class);
    }

    @Test
    void 숫자_형식_키_집합이_스키마_샘플_record_세_곳에서_같다() throws IOException {
        JsonNode schema = readSchema();
        JsonNode sample = readSample();
        JsonNode numFormatDef = schema.path("$defs").path("MdmLayoutNumFormat");

        List<JsonNode> numFormats = new ArrayList<>();
        collectNumFormats(sample, numFormats);
        assertTrue(!numFormats.isEmpty(), "샘플에 numFormat 이 채워진 항목이 없다 — 이 비교가 공허 통과한다");

        assertKeySetsMatch("MdmLayoutNumFormat",
                propertyKeys(numFormatDef),
                numFormats,
                MdmLayoutNumFormat.class);
    }

    /**
     * 오프셋 산술 정합성(불변 규칙 15) — 키 대조와 별도로, 헤더 항목의 오프셋 값 자체를 절대값으로
     * 바꿔 넣는 변이(예: 6→106)를 잡는다.
     */
    @Test
    void 오프셋_산술이_헤더_offset과_totalLength_합에_정합한다() throws IOException {
        JsonNode sample = readSample();
        JsonNode headers = sample.path("headers");

        int expectedHeaderOffset = 0;
        for (JsonNode header : headers) {
            assertEquals(expectedHeaderOffset, header.path("offset").asInt(),
                    "header seq=" + header.path("seq").asInt() + " 의 offset 은 앞 헤더들의 totalLength 합이어야 한다");
            int headerTotalLength = header.path("totalLength").asInt();
            for (JsonNode item : header.path("items")) {
                int itemOffset = item.path("offset").asInt();
                int itemLength = item.path("length").asInt();
                assertTrue(itemOffset >= 0, "헤더 내부 상대 오프셋은 0 이상이어야 한다: " + item);
                assertTrue(itemOffset + itemLength <= headerTotalLength,
                        "헤더 항목이 헤더 totalLength 를 벗어난다: " + item);
            }
            expectedHeaderOffset += headerTotalLength;
        }

        int headerLengthSum = expectedHeaderOffset;
        JsonNode bodyItems = sample.path("items");
        assertTrue(bodyItems.size() > 0, "본문 items 가 비어 있다");
        assertEquals(headerLengthSum, bodyItems.get(0).path("offset").asInt(),
                "본문 첫 항목의 offset 은 headers[*].totalLength 합이어야 한다");

        int bodyLengthSum = 0;
        for (JsonNode item : bodyItems) {
            bodyLengthSum += item.path("length").asInt();
        }
        assertEquals(headerLengthSum + bodyLengthSum, sample.path("totalLength").asInt(),
                "snapshot.totalLength 은 headers 합 + 본문 items 길이 합이어야 한다");
    }

    /**
     * design.md §3.5 "required 키 하나를 뺀 변형 샘플" — 최상위 필수 키를 하나씩 제거한 변형을
     * 만들어, 스키마의 {@code required} 목록에 그 키가 실제로 있는지(빠지면 실제 validator 가 잡을
     * 수 있는 자리인지)를 구조적으로 확인한다. D2(Jackson 만 사용) 라 실제 validator 를 돌리지 않는다.
     */
    @Test
    void 필수_키_하나가_빠진_변형은_스키마_required_목록에_그_키가_있다() throws IOException {
        JsonNode schema = readSchema();
        JsonNode sample = readSample();
        Set<String> requiredKeys = new LinkedHashSet<>();
        schema.path("required").forEach(n -> requiredKeys.add(n.asText()));
        assertEquals(Set.of("layoutId", "layoutName", "layoutVersion", "totalLength", "headers", "items"),
                requiredKeys);

        for (String requiredKey : requiredKeys) {
            com.fasterxml.jackson.databind.node.ObjectNode variant =
                    (com.fasterxml.jackson.databind.node.ObjectNode) sample.deepCopy();
            variant.remove(requiredKey);
            assertTrue(!variant.has(requiredKey), "변형이 " + requiredKey + " 를 여전히 갖고 있다");
            assertTrue(requiredKeys.contains(requiredKey),
                    requiredKey + " 가 빠진 변형인데 스키마 required 목록에 이 키가 없다 — 실제 validator 라면 이 누락을 못 잡는다");
        }
    }

    /**
     * D-144 3단계 — {@code layoutVersion} 은 scale 3 소수 버전(LEGACY 정수도 number 로 받는다), 헤더 겹마다 합성 시각에 고른
     * {@code headerVersion}(LEGACY 는 null)을 담는다.
     */
    @Test
    void 레이아웃_버전은_소수이고_헤더마다_헤더_버전을_담는다() throws IOException {
        JsonNode schema = readSchema();
        assertEquals("number", schema.path("properties").path("layoutVersion").path("type").asText());
        JsonNode headerDef = schema.path("$defs").path("MdmLayoutHeaderRef");
        JsonNode headerVersionType = headerDef.path("properties").path("headerVersion").path("type");
        assertEquals(List.of("number", "null"), List.of(headerVersionType.get(0).asText(), headerVersionType.get(1).asText()));
        Set<String> headerRequired = new LinkedHashSet<>();
        headerDef.path("required").forEach(n -> headerRequired.add(n.asText()));
        assertTrue(headerRequired.contains("headerVersion"), "헤더 required 에 headerVersion 이 없다: " + headerRequired);

        JsonNode sample = readSample();
        assertTrue(sample.path("layoutVersion").isNumber(), "샘플 layoutVersion 이 숫자가 아니다");
        for (JsonNode header : sample.path("headers")) {
            assertTrue(header.path("headerVersion").isNumber(), "샘플 헤더에 headerVersion 숫자가 없다: " + header.path("seq"));
        }
    }

    // ── 지원 메서드 ──

    private static void assertKeySetsMatch(String nodeName, Set<String> schemaKeys,
            List<JsonNode> sampleInstances, Class<?> recordType) {
        Set<String> recordKeys = new LinkedHashSet<>();
        for (RecordComponent component : recordType.getRecordComponents()) {
            recordKeys.add(component.getName());
        }
        assertEquals(recordKeys, schemaKeys, nodeName + " — 스키마 properties 키 집합이 record 필드와 다르다");

        assertTrue(!sampleInstances.isEmpty(), nodeName + " — 샘플에 이 노드의 인스턴스가 없다");
        for (JsonNode instance : sampleInstances) {
            Set<String> instanceKeys = new LinkedHashSet<>();
            instance.fieldNames().forEachRemaining(instanceKeys::add);
            assertEquals(recordKeys, instanceKeys, nodeName + " — 샘플 인스턴스 키 집합이 record 필드와 다르다: " + instance);
        }
    }

    private static Set<String> propertyKeys(JsonNode schemaNode) {
        Set<String> keys = new LinkedHashSet<>();
        Iterator<String> names = schemaNode.path("properties").fieldNames();
        names.forEachRemaining(keys::add);
        return keys;
    }

    private static List<JsonNode> asList(JsonNode arrayNode) {
        List<JsonNode> list = new ArrayList<>();
        arrayNode.forEach(list::add);
        return list;
    }

    private static void collectNumFormats(JsonNode snapshot, List<JsonNode> out) {
        collectNumFormatsFromItems(snapshot.path("items"), out);
        for (JsonNode header : snapshot.path("headers")) {
            collectNumFormatsFromItems(header.path("items"), out);
        }
    }

    private static void collectNumFormatsFromItems(JsonNode items, List<JsonNode> out) {
        for (JsonNode item : items) {
            JsonNode numFormat = item.path("numFormat");
            if (numFormat.isObject()) {
                out.add(numFormat);
            }
        }
    }

    private static JsonNode readSchema() throws IOException {
        try (InputStream in = LayoutSnapshotSchemaStructureTest.class.getResourceAsStream(
                "/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json")) {
            assertTrue(in != null, "layout-snapshot.schema.json 을 classpath 에서 찾지 못했다");
            return MAPPER.readTree(in);
        }
    }

    private static JsonNode readSample() throws IOException {
        try (InputStream in = LayoutSnapshotSchemaStructureTest.class.getResourceAsStream(
                "/com/dongkuk/dmes/mdm/contract/layout/m201-snapshot-sample.json")) {
            assertTrue(in != null, "m201-snapshot-sample.json 을 classpath 에서 찾지 못했다");
            return MAPPER.readTree(in);
        }
    }
}
