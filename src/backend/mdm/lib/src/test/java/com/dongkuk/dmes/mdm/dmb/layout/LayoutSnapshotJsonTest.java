package com.dongkuk.dmes.mdm.dmb.layout;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;

/**
 * TSK-05-03 design.md §3.1 — 스냅샷 JSON 정규화(키 정렬·공백 없음, naming-dialect-rules §3 #6)와 계약 키 집합(불변 I15·I22).
 */
class LayoutSnapshotJsonTest {

    private static final String BASE = "/com/dongkuk/dmes/mdm/contract/layout/";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    static String resource(String name) throws IOException {
        try (InputStream in = LayoutSnapshotJsonTest.class.getResourceAsStream(BASE + name)) {
            assertTrue(in != null, "클래스패스에 없다: " + name);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    static MdmLayoutSnapshot sample() throws IOException {
        return LayoutSnapshotJson.read(resource("m201-snapshot-sample.json"));
    }

    private static List<String> keys(JsonNode node) {
        List<String> out = new ArrayList<>();
        Iterator<String> it = node.fieldNames();
        it.forEachRemaining(out::add);
        return out;
    }

    @Test
    void 키를_정렬하고_공백_없이_쓴다() throws IOException {
        String json = LayoutSnapshotJson.write(sample());
        assertTrue(json.startsWith("{\"eaiCode\":"), json.substring(0, 40));
        assertFalse(json.contains("\": "), "콜론 뒤 공백 없음");
        assertFalse(json.contains("\n"), "줄바꿈 없음");
        JsonNode tree = MAPPER.readTree(json);
        for (JsonNode n : List.of(tree, tree.get("headers").get(0), tree.get("headers").get(0).get("items").get(0),
                tree.get("items").get(2), tree.get("items").get(2).get("numFormat"))) {
            List<String> k = keys(n);
            assertEquals(new ArrayList<>(new TreeSet<>(k)), k, "키 정렬: " + k);
        }
    }

    @Test
    void 쓰고_읽으면_같은_스냅샷이다() throws IOException {
        MdmLayoutSnapshot s = sample();
        assertEquals(s, LayoutSnapshotJson.read(LayoutSnapshotJson.write(s)));
        assertEquals("mm", s.items().get(2).unitCode());
        assertEquals(1, s.items().get(2).scale());
    }

    @Test
    void legacyJsonWithIntegerVersionAndNoHeaderVersionStillReads() {
        String legacy = "{\"eaiCode\":\"G1\",\"encoding\":\"EUC-KR\",\"headers\":[{\"headerLayoutId\":100,\"headerLayoutName\":\"H\","
                + "\"items\":[],\"offset\":0,\"seq\":1,\"totalLength\":10}],\"items\":[],\"layoutId\":201,\"layoutName\":\"M\","
                + "\"layoutVersion\":2,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":30}";
        MdmLayoutSnapshot s = LayoutSnapshotJson.read(legacy);
        assertThat(s.layoutVersion()).isEqualByComparingTo("2");
        assertThat(s.headers().get(0).headerVersion()).isNull();
    }

    @Test
    void JSON_키_집합은_스키마와_같다() throws IOException {
        JsonNode schema = MAPPER.readTree(resource("layout-snapshot.schema.json"));
        JsonNode tree = MAPPER.readTree(LayoutSnapshotJson.write(sample()));
        assertKeys(schema.get("properties"), tree);
        assertKeys(schema.get("$defs").get("MdmLayoutHeaderRef").get("properties"), tree.get("headers").get(0));
        JsonNode itemProps = schema.get("$defs").get("MdmLayoutItemSnapshot").get("properties");
        assertKeys(itemProps, tree.get("headers").get(0).get("items").get(0));
        assertKeys(itemProps, tree.get("items").get(2));
        assertKeys(schema.get("$defs").get("MdmLayoutNumFormat").get("properties"), tree.get("items").get(2).get("numFormat"));
    }

    static void assertKeys(JsonNode schemaProps, JsonNode instance) {
        Set<String> expected = new TreeSet<>(keys(schemaProps));
        Set<String> actual = new TreeSet<>(keys(instance));
        assertEquals(expected, actual);
    }
}
