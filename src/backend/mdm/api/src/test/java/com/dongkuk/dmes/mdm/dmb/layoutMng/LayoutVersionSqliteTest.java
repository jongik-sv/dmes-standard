package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutDraftBuilder;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExportRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-03 design.md §3.2 — 옛 버전 스냅샷으로 직렬화·파싱 왕복(수용 기준 2), 스냅샷 키 = 스키마, 초안 스냅샷 = 저장 뒤 스냅샷(I19),
 * 버전 이력 조회·스냅샷 출력. D-144 3단계: 저장은 버전을 만들지 않는다(I15·I18 폐지 — 변경 분류는 확정 시험 {@code LayoutConfirmSqliteTest}
 * 로 옮겼다). 저장 응답의 {@code rowVersion} 으로 다시 저장할 수 있다. 스냅샷은 시각 T 합성({@link LayoutComposer})으로 읽는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutVersionSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutCodecs codecs;
    @Autowired
    LayoutSnapshotAssembler assembler;
    @Autowired
    LayoutDraftBuilder draftBuilder;
    @Autowired
    LayoutComposer composer;

    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        dictionary();
    }

    /** M201 헤더 한 벌(L100 은 EAI 표준 헤더). 둘 다 HEADER_FROM 에 확정. */
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

    private LayoutMngSaveRequest again(long id, String ver, long rowVersion, Headers h) {
        return layoutReq((String) layoutRow(id).get("LAYOUT_NAME"), h.eai(), r -> {
            r.setLayoutId(id);
            r.setVer(ver);
            r.setRowVersion(rowVersion);
        });
    }

    /** v1(v1Items) 을 MESSAGE_FROM 에 확정하고 v2 DRAFT 에 v2Items 를 저장한다. */
    private long v1ReleasedV2Draft(Headers h) {
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items()));
        release(id, "1.000", MESSAGE_FROM);
        newDraft(id, "1.000", "2.000");
        save(again(id, "2.000", rowVersion(id, "2.000"), h), h, v2Items());
        return id;
    }

    private static long id(Map<String, Object> out) {
        return ((Number) out.get("layoutId")).longValue();
    }

    private static long num(Object o) {
        return ((Number) o).longValue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void 저장_응답의_rowVersion_으로_다시_저장하면_MDM001_이_나지_않는다() {
        Headers h = headers();
        Map<String, Object> first = save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, v1Items());
        long id = id(first);
        assertEquals("1.000", first.get("ver"));
        assertEquals(0L, num(first.get("rowVersion")));
        Map<String, Object> second = save(again(id, (String) first.get("ver"), num(first.get("rowVersion")), h), h, v2Items());
        assertEquals("1.000", second.get("ver"), "저장은 버전을 만들지 않는다(I15 폐지)");
        assertEquals(1L, num(second.get("rowVersion")));
        Map<String, Object> third = save(again(id, (String) second.get("ver"), num(second.get("rowVersion")), h), h, v2Items());
        assertEquals(2L, num(third.get("rowVersion")));
        // 헤더 저장은 전문 row_version 을 바꾸지 않는다(I18 폐지) — view 의 선택 버전 ROW_VERSION 으로 다시 저장한다
        newDraft(h.l110(), "1.000", "2.000");
        List<Map<String, Object>> l110 = l110Items();
        l110.add(item("DATA", "EXTRA_3", null));
        headerService.save(headerReq((String) layoutRow(h.l110()).get("LAYOUT_NAME"), r -> {
            r.setLayoutId(h.l110());
            r.setVer("2.000");
            r.setRowVersion(rowVersion(h.l110(), "2.000"));
        }), numbered(l110));
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(id);
        Map<String, Object> selected = (Map<String, Object>) layoutService.view(v).get("selected");
        assertEquals(2L, num(selected.get("ROW_VERSION")));
        Map<String, Object> fourth = save(again(id, (String) selected.get("VER"), num(selected.get("ROW_VERSION")), h), h, v2Items());
        assertEquals(id, id(fourth));
        assertEquals(1, versionRows(id).size());
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
        long id = v1ReleasedV2Draft(h);
        LocalDateTime now = DmeTestSupport.NOW;
        MdmLayoutSnapshot v1 = composer.compose(id, new BigDecimal("1.000"), now);
        MdmLayoutSnapshot v2 = composer.compose(id, new BigDecimal("2.000"), now);
        assertEquals(0, new BigDecimal("1.000").compareTo(v1.layoutVersion()));
        assertEquals(3, v1.items().size(), "v1 은 새 DRAFT 를 고친 뒤에도 v1 모양이다");
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
    void 합성_스냅샷_JSON_의_키는_스키마와_같다() throws Exception {
        Headers h = headers();
        long id = id(save(layoutReq(uniq("버전 "), h.eai(), r -> {}), h, m201Items()));
        JsonNode schema;
        try (InputStream in = getClass().getResourceAsStream("/com/dongkuk/dmes/mdm/contract/layout/layout-snapshot.schema.json")) {
            schema = mapper.readTree(in);
        }
        String json = LayoutSnapshotJson.write(composer.compose(id, new BigDecimal("1.000"), DmeTestSupport.NOW));
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
        LayoutDraftBuilder.Built built = draftBuilder.build(r, List.of(headerRow(h.l110())), consts, m201Items(), DmeTestSupport.NOW, true);
        assertTrue(built.issues().isEmpty(), built.issues().toString());
        MdmLayoutSnapshot draft = assembler.fromDraft(built.draft(), null, built.draft().headers());
        long id = saveLayout(r, List.of(headerRow(h.l110())), consts, m201Items());
        MdmLayoutSnapshot saved = composer.compose(id, new BigDecimal("1.000"), DmeTestSupport.NOW);
        MdmLayoutSnapshot aligned = new MdmLayoutSnapshot(id, draft.layoutName(), draft.eaiCode(), draft.sndSystem(), draft.rcvSystem(),
                draft.encoding(), draft.padRule(), draft.layoutVersion(), draft.totalLength(), draft.headers(), draft.items());
        assertEquals(saved, aligned);
        assertEquals("B1", saved.headers().get(0).items().get(1).overrideValue());
        assertEquals(1, saved.items().get(2).scale());
    }

    @Test
    @SuppressWarnings("unchecked")
    void view_는_버전_이력을_최신부터_돌려준다() {
        Headers h = headers();
        long id = v1ReleasedV2Draft(h);
        LayoutMngViewRequest v = new LayoutMngViewRequest();
        v.setLayoutId(id);
        Map<String, Object> view = layoutService.view(v);
        List<Map<String, Object>> versions = (List<Map<String, Object>>) view.get("versions");
        assertEquals(2, versions.size());
        assertEquals("2.000", versions.get(0).get("VER"));
        assertEquals("DRAFT", versions.get(0).get("STATE"));
        assertEquals(57, versions.get(0).get("OWN_LENGTH"));
        assertEquals("1.000", versions.get(1).get("VER"));
        assertEquals("CURRENT", versions.get(1).get("STATE"));
        assertEquals(MESSAGE_FROM, versions.get(1).get("APPLY_FROM"));
        assertEquals("N", versions.get(1).get("LEGACY"));
        // 내 DRAFT 를 고른다
        assertEquals("2.000", ((Map<String, Object>) view.get("selected")).get("VER"));
        assertEquals(true, view.get("editable"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void export_는_지정한_버전과_시각의_합성_스냅샷을_돌려준다() {
        Headers h = headers();
        long id = v1ReleasedV2Draft(h);
        LayoutMngExportRequest r = new LayoutMngExportRequest();
        r.setLayoutId(id);
        r.setVer("1.000");
        Map<String, Object> out = layoutService.export(r);
        Map<String, Object> snapshot = (Map<String, Object>) out.get("snapshot");
        assertEquals(0, new BigDecimal("1.000").compareTo(new BigDecimal(String.valueOf(snapshot.get("layoutVersion")))));
        assertEquals("1.000", out.get("ver"));
        assertEquals("2026-06-15 09:00:00", out.get("asOf"));
        assertEquals("layout-" + id + "-v1.000-20260615090000", out.get("fileBase"));
        assertEquals("코일 ID", ((Map<String, Object>) out.get("names")).get("COIL_ID"));
        // ver 가 없으면 시각 T 에 적용 중인 버전 — v2 를 6월 1일에 확정하면 지금은 v2, 5월 1일은 v1
        release(id, "2.000", "2026-06-01 00:00:00");
        r.setVer(null);
        Map<String, Object> latest = layoutService.export(r);
        assertEquals("2.000", latest.get("ver"));
        assertEquals(4, ((List<?>) ((Map<String, Object>) latest.get("snapshot")).get("items")).size());
        r.setAsOf("2026-05-01 00:00:00");
        Map<String, Object> may = layoutService.export(r);
        assertEquals("1.000", may.get("ver"));
        assertEquals("layout-" + id + "-v1.000-20260501000000", may.get("fileBase"));
    }

    @Test
    void export_는_시각_T_에_확정된_버전이_없으면_거부한다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, VER) VALUES ('MESSAGE', ?, 0)", uniq("이력 없음 "));
        Long id = jdbc.queryForObject("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT", Long.class);
        LayoutMngExportRequest r = new LayoutMngExportRequest();
        r.setLayoutId(id);
        BusinessException ex = rejected(() -> layoutService.export(r));
        assertTrue(ex.getMessage().contains("확정된 버전이 없습니다"), ex.getMessage());
    }
}
