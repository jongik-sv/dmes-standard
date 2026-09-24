package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionStore;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExportRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-03 design.md §3.2 — 저장 즉시 스냅샷 버전(불변 I15·I16·I18·I19), 여분 쪼개 쓰기는 순차 전환(수용 기준 6), 옛 버전 스냅샷으로
 * 직렬화·파싱 왕복(수용 기준 2), 이력 조회·스냅샷 출력.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class LayoutVersionSqliteTest extends LayoutTestSupport {

    @TempDir
    static Path tempDir;

    @Autowired
    LayoutVersionStore store;
    @Autowired
    LayoutCodecs codecs;
    @Autowired
    LayoutSnapshotAssembler assembler;
    @Autowired
    LayoutDraftBuilder draftBuilder;

    private final ObjectMapper mapper = new ObjectMapper();

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("layout-version.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @BeforeEach
    void setUp() {
        dictionary();
    }

    /** M201 헤더 한 벌(L100 은 EAI 표준 헤더). */
    private record Headers(String eai, long l100, long l110) {
    }

    private Headers headers() {
        String eai = uniq("V");
        return new Headers(eai, saveL100(eai), saveL110());
    }

    private static List<Map<String, Object>> v1Items() {
        return numbered(new ArrayList<>(List.of(item("DATA", "COIL_ID", null), item("DATA", "PROD_DT", null), filler(29))));
    }

    private static List<Map<String, Object>> v2Items() {
        Map<String, Object> thk = item("DATA", "COIL_THK", null);
        thk.put("NUM_FORMAT", W4);
        return numbered(new ArrayList<>(List.of(item("DATA", "COIL_ID", null), item("DATA", "PROD_DT", null), thk, filler(25))));
    }

    private Map<String, Object> save(LayoutMngSaveRequest r, Headers h, List<Map<String, Object>> items) {
        return layoutService.save(r, List.of(headerRow(h.l110())), List.of(), items);
    }

    private LayoutMngSaveRequest again(long id, long ver) {
        Map<String, Object> row = layoutRow(id);
        return layoutReq((String) row.get("LAYOUT_NAME"), (String) row.get("EAI_CODE"), r -> {
            r.setLayoutId(id);
            r.setVer(ver);
        });
    }

    private LayoutMngSaveRequest again(long id) {
        return again(id, ver(layoutRow(id)));
    }

    private static long id(Map<String, Object> out) {
        return ((Number) out.get("layoutId")).longValue();
    }

    private static long num(Object o) {
        return ((Number) o).longValue();
    }

    private long businessVersion(long id) {
        return num(layoutRow(id).get("VERSION"));
    }

    @Test
    void 처음_저장하면_버전_1_최초_등록_스냅샷이_생긴다() {
        Headers h = headers();
        Map<String, Object> out = save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items());
        long id = id(out);
        assertEquals(1L, num(out.get("layoutVersion")));
        assertEquals(true, out.get("versionCreated"));
        assertNull(out.get("switchMode"));
        assertEquals("최초 등록", out.get("changeSummary"));
        assertEquals(1L, businessVersion(id));
        List<Map<String, Object>> rows = versionRows(id);
        assertEquals(1, rows.size());
        assertEquals(1L, num(rows.get(0).get("LAYOUT_VERSION")));
        assertEquals(187, ((Number) rows.get(0).get("TOTAL_LENGTH")).intValue());
        assertNull(rows.get(0).get("SWITCH_MODE"));
        assertEquals("최초 등록", rows.get(0).get("CHANGE_SUMMARY"));
        assertEquals("INITIAL", rows.get(0).get("CHANGE_KINDS"));
        MdmLayoutSnapshot s = LayoutSnapshotJson.read((String) rows.get(0).get("SNAPSHOT_JSON"));
        assertEquals(1L, s.layoutVersion());
        assertEquals(187, s.totalLength());
        assertEquals(id, s.layoutId());
        assertEquals("EUC-KR", s.encoding());
        assertEquals(List.of(130, 150, 158, 162), s.items().stream().map(MdmLayoutItemSnapshot::offset).toList());
        assertEquals(List.of(0, 100), s.headers().stream().map(x -> x.offset()).toList());
    }

    @Test
    void 같은_내용으로_다시_저장하면_버전을_만들지_않는다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items()));
        Map<String, Object> again = save(again(id), h, m201Items());
        assertEquals(false, again.get("versionCreated"));
        assertEquals(1L, num(again.get("layoutVersion")));
        assertEquals(1, versionRows(id).size());
        assertEquals(1L, businessVersion(id));
    }

    @Test
    void 여분을_쪼개_항목을_추가하면_버전_2_순차_전환이다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items()));
        assertEquals(187, ((Number) layoutRow(id).get("TOTAL_LENGTH")).intValue());
        Map<String, Object> out = save(again(id), h, v2Items());
        assertEquals(2L, num(out.get("layoutVersion")));
        assertEquals("SEQUENTIAL", out.get("switchMode"));
        assertEquals(2L, businessVersion(id));
        Map<String, Object> v2 = versionRows(id).get(1);
        assertEquals("SEQUENTIAL", v2.get("SWITCH_MODE"));
        assertEquals(187, ((Number) v2.get("TOTAL_LENGTH")).intValue());
        assertEquals("여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)", v2.get("CHANGE_SUMMARY"));
        assertEquals("FILLER_SPLIT", v2.get("CHANGE_KINDS"));
    }

    @Test
    void 항목_길이를_바꾸면_동시_전환이다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v2Items()));
        List<Map<String, Object>> items = v2Items();
        items.get(2).put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=5");
        items.get(3).put("FILLER_LENGTH", 24);
        Map<String, Object> out = save(again(id), h, items);
        assertEquals("SIMULTANEOUS", out.get("switchMode"));
        Map<String, Object> v = versionRows(id).get(1);
        assertEquals("SIMULTANEOUS", v.get("SWITCH_MODE"));
        assertEquals("ITEM_LENGTH", v.get("CHANGE_KINDS"));
    }

    private HeaderMngSaveRequest headerAgain(long headerId, String eai) {
        Map<String, Object> row = layoutRow(headerId);
        return headerReq((String) row.get("LAYOUT_NAME"), r -> {
            r.setLayoutId(headerId);
            r.setVer(ver(row));
            r.setEaiCode(eai);
        });
    }

    @Test
    @SuppressWarnings("unchecked")
    void 헤더를_바꾸면_그_헤더를_쓰는_전문에_새_버전이_생긴다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items()));
        List<Map<String, Object>> items = l110Items();
        items.add(item("DATA", "EXTRA_3", null));
        Map<String, Object> out = headerService.save(headerAgain(h.l110(), null), numbered(items));
        assertEquals(2L, businessVersion(id));
        Map<String, Object> v2 = versionRows(id).get(1);
        assertEquals("SIMULTANEOUS", v2.get("SWITCH_MODE"));
        assertEquals(190, ((Number) v2.get("TOTAL_LENGTH")).intValue());
        List<Map<String, Object>> versioned = (List<Map<String, Object>>) out.get("versioned");
        assertEquals(1, versioned.size());
        assertEquals(id, num(versioned.get(0).get("LAYOUT_ID")));
        assertEquals(2L, num(versioned.get(0).get("LAYOUT_VERSION")));
        assertEquals("SIMULTANEOUS", versioned.get(0).get("SWITCH_MODE"));
        assertEquals(true, versioned.get(0).get("CREATED"));
    }

    @Test
    void 헤더_상수_기본값만_바꾸면_사용_전문은_순차_전환이다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items()));
        List<Map<String, Object>> items = l100Items();
        items.get(2).put("DEFAULT_VALUE", "L3");
        headerService.save(headerAgain(h.l100(), h.eai()), items);
        assertEquals(2L, businessVersion(id));
        Map<String, Object> v2 = versionRows(id).get(1);
        assertEquals("SEQUENTIAL", v2.get("SWITCH_MODE"));
        assertEquals("CONST_VALUE", v2.get("CHANGE_KINDS"));
        assertEquals("상수 송신공정구분 L2 → L3", v2.get("CHANGE_SUMMARY"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void 저장_응답의_ver_로_다시_저장하면_MDM001_이_나지_않는다() {
        Headers h = headers();
        Map<String, Object> first = save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items());
        long id = id(first);
        assertEquals(ver(layoutRow(id)), num(first.get("ver")), "응답 ver = 버전 기록 뒤 감사 VER(I16)");
        Map<String, Object> second = save(again(id, num(first.get("ver"))), h, v2Items());
        assertEquals(2L, num(second.get("layoutVersion")));
        assertEquals(ver(layoutRow(id)), num(second.get("ver")));
        save(again(id, num(second.get("ver"))), h, v2Items());
        // 헤더 저장 뒤에는 view 의 ver 로 다시 저장한다
        List<Map<String, Object>> l110 = l110Items();
        l110.add(item("DATA", "EXTRA_3", null));
        headerService.save(headerAgain(h.l110(), null), numbered(l110));
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(id);
        long viewVer = num(((Map<String, Object>) layoutService.view(v).get("layout")).get("VER"));
        Map<String, Object> third = save(again(id, viewVer), h, v2Items());
        assertEquals(id, id(third));
    }

    private static Map<String, Object> record(String coilId, String prodDt, Object thk) {
        Map<String, Object> r = new HashMap<>();
        r.put("COIL_ID", coilId);
        r.put("PROD_DT", prodDt);
        r.put("COIL_THK", thk);
        return r;
    }

    @Test
    void 옛_버전_스냅샷으로_직렬화하고_파싱하면_레이아웃을_바꾼_뒤에도_일치한다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items()));
        save(again(id), h, v2Items());
        MdmLayoutSnapshot v1 = LayoutSnapshotJson.read(store.find(id, 1L).orElseThrow().getSnapshotJson());
        MdmLayoutSnapshot v2 = LayoutSnapshotJson.read(store.find(id, 2L).orElseThrow().getSnapshotJson());
        assertEquals(1L, v1.layoutVersion());
        assertEquals(3, v1.items().size(), "v1 스냅샷은 레이아웃을 바꾼 뒤에도 v1 모양이다");
        MdmLayoutSerializeContext ctx = new MdmLayoutSerializeContext(LocalDateTime.of(2026, 9, 22, 14, 30, 15), 1L);
        byte[] m1 = codecs.serializer().serialize(v1, record("C26A0012345", "20260922", null), ctx);
        Map<String, Object> p1 = codecs.parser().parse(v1, m1);
        assertEquals("C26A0012345", p1.get("COIL_ID"));
        assertEquals("20260922", p1.get("PROD_DT"));
        // v1 전문을 v2 로 읽으면 COIL_THK 는 여분 공백 → null(순차 전환의 뜻)
        Map<String, Object> p12 = codecs.parser().parse(v2, m1);
        assertEquals("C26A0012345", p12.get("COIL_ID"));
        assertEquals("20260922", p12.get("PROD_DT"));
        assertNull(p12.get("COIL_THK"));
        // v2 전문을 v1 로 읽어도 COIL_ID·PROD_DT 가 같다
        byte[] m2 = codecs.serializer().serialize(v2, record("C26A0012345", "20260922", new BigDecimal("3.5")), ctx);
        Map<String, Object> p21 = codecs.parser().parse(v1, m2);
        assertEquals("C26A0012345", p21.get("COIL_ID"));
        assertEquals("20260922", p21.get("PROD_DT"));
        assertEquals(0, new BigDecimal("3.5").compareTo((BigDecimal) codecs.parser().parse(v2, m2).get("COIL_THK")));
    }

    private static List<String> keys(JsonNode n) {
        List<String> out = new ArrayList<>();
        Iterator<String> it = n.fieldNames();
        it.forEachRemaining(out::add);
        return out;
    }

    private void assertKeys(JsonNode props, JsonNode node) {
        assertEquals(new TreeSet<>(keys(props)), new TreeSet<>(keys(node)));
    }

    @Test
    void 저장된_스냅샷_JSON_의_키는_스키마와_같다() throws Exception {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items()));
        JsonNode schema;
        try (InputStream in = getClass().getResourceAsStream("/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json")) {
            schema = mapper.readTree(in);
        }
        String json = (String) versionRows(id).get(0).get("SNAPSHOT_JSON");
        assertTrue(json.startsWith("{\"eaiCode\":"), "정규화(키 정렬): " + json.substring(0, 30));
        JsonNode tree = mapper.readTree(json);
        assertKeys(schema.get("properties"), tree);
        assertKeys(schema.get("$defs").get("MdmLayoutHeaderRef").get("properties"), tree.get("headers").get(0));
        JsonNode item = schema.get("$defs").get("MdmLayoutItemSnapshot").get("properties");
        assertKeys(item, tree.get("headers").get(0).get("items").get(0));
        assertKeys(item, tree.get("items").get(2));
        assertKeys(schema.get("$defs").get("MdmLayoutNumFormat").get("properties"), tree.get("items").get(2).get("numFormat"));
    }

    @Test
    void 초안_스냅샷은_저장_뒤_스냅샷과_같다() {
        Headers h = headers();
        List<Map<String, Object>> consts = List.of(constRow(h.l100(), 2, "B1"));
        LayoutMngSaveRequest r = layoutReq(uniq("초안 "), h.eai(), x -> {});
        LayoutDraftBuilder.Built built = draftBuilder.build(r, List.of(headerRow(h.l110())), consts, m201Items(), false);
        assertTrue(built.issues().isEmpty(), built.issues().toString());
        MdmLayoutSnapshot draft = assembler.fromDraft(built.draft());
        long id = saveLayout(r, List.of(headerRow(h.l110())), consts, m201Items());
        MdmLayoutSnapshot saved = assembler.read(id);
        MdmLayoutSnapshot aligned = new MdmLayoutSnapshot(id, draft.layoutName(), draft.eaiCode(), draft.sndSystem(), draft.rcvSystem(),
                draft.encoding(), draft.padRule(), saved.layoutVersion(), draft.totalLength(), draft.headers(), draft.items());
        assertEquals(saved, aligned);
        assertEquals("B1", saved.headers().get(0).items().get(1).overrideValue());
        assertEquals(1, saved.items().get(2).scale());
    }

    @Test
    @SuppressWarnings("unchecked")
    void view_는_버전_이력을_최신부터_돌려준다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items()));
        save(again(id), h, v2Items());
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(id);
        List<Map<String, Object>> versions = (List<Map<String, Object>>) layoutService.view(v).get("versions");
        assertEquals(2, versions.size());
        assertEquals(2L, num(versions.get(0).get("LAYOUT_VERSION")));
        assertEquals("SEQUENTIAL", versions.get(0).get("SWITCH_MODE"));
        assertEquals(187, ((Number) versions.get(0).get("TOTAL_LENGTH")).intValue());
        assertEquals("최초 등록", versions.get(1).get("CHANGE_SUMMARY"));
        assertTrue(String.valueOf(versions.get(1).get("SAVED_AT")).matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}"),
                String.valueOf(versions.get(1).get("SAVED_AT")));
    }

    @Test
    @SuppressWarnings("unchecked")
    void export_는_지정한_버전의_스냅샷을_돌려준다() {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items()));
        save(again(id), h, v2Items());
        LayoutMngExportRequest r = new LayoutMngExportRequest();
        r.setLayoutId(id);
        r.setLayoutVersion(1L);
        Map<String, Object> out = layoutService.export(r);
        Map<String, Object> snapshot = (Map<String, Object>) out.get("snapshot");
        assertEquals(1L, num(snapshot.get("layoutVersion")));
        assertEquals(1L, num(out.get("layoutVersion")));
        assertEquals("layout-" + id + "-v1", out.get("fileBase"));
        assertEquals("코일 ID", ((Map<String, Object>) out.get("names")).get("COIL_ID"));
        r.setLayoutVersion(null);
        Map<String, Object> latest = layoutService.export(r);
        assertEquals(2L, num(latest.get("layoutVersion")));
        assertEquals("layout-" + id + "-v2", latest.get("fileBase"));
        assertEquals(4, ((List<?>) ((Map<String, Object>) latest.get("snapshot")).get("items")).size());
    }

    @Test
    void export_는_버전이_없으면_거부한다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, VERSION, VER) VALUES ('MESSAGE', ?, 0, 0, 0)",
                uniq("이력 없음 "));
        Long id = jdbc.queryForObject("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT", Long.class);
        LayoutMngExportRequest r = new LayoutMngExportRequest();
        r.setLayoutId(id);
        BusinessException ex = rejected(() -> layoutService.export(r));
        assertTrue(ex.getMessage().contains("저장된 버전이 없습니다"), ex.getMessage());
    }
}
