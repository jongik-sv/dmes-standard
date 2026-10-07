package com.dongkuk.dmes.mdm.dmb.layoutConfirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshotResolver;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutVersionService;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutVersionRequest;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** D-144 목적 3 — 헤더 확정 전후 T 로 같은 전문 버전의 직렬화 결과가 달라지고, 이전 T 로 과거 전문을 그대로 재현한다(스펙 §11). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutPastReproductionSqliteTest extends LayoutServiceTestSupport {

    static final LocalDateTime BEFORE = LocalDateTime.of(2026, 6, 30, 23, 59, 59);
    static final LocalDateTime SWITCH = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    static final MdmLayoutSerializeContext CTX = new MdmLayoutSerializeContext(LocalDateTime.of(2026, 6, 30, 12, 0, 0), 7L);

    @Autowired MdmLayoutSnapshotResolver resolver;
    @Autowired LayoutCodecs codecs;
    @Autowired LayoutVersionService versions;
    @Autowired LayoutConfirmService confirmService;
    @Autowired LayoutComposer composer;
    @Autowired PlatformTransactionManager transactionManager;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private static com.fasterxml.jackson.databind.JsonNode readJson(String json) {
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private byte[] serialize(long messageId, LocalDateTime t, Map<String, Object> record) {
        MdmLayoutSnapshot s = resolver.at(messageId, t);
        return codecs.serializer().serialize(s, record, CTX);
    }

    @Test
    void headerConfirmChangesWireOnlyFromApplyFromAndPastIsReproducible() {
        M201 m = m201();
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("COIL_ID", "C123");
        record.put("PROD_DT", "20260630");
        record.put("COIL_THK", "1.5");
        byte[] past = serialize(m.message(), BEFORE, record);
        assertThat(past).hasSize(187);

        // L110 의 여분 5 → 8 (헤더 길이 30 → 33) 을 2026-07-01 에 적용하도록 확정한다
        LayoutVersionRequest nv = new LayoutVersionRequest();
        nv.setLayoutId(m.l110());
        nv.setVerKind("MAJOR");
        String ver = versions.newVersion(nv, "HEADER").getVer();
        List<Map<String, Object>> items = l110Items();
        items.set(5, filler(8));
        headerService.save(headerReq("L2 구간 헤더", r -> {
            r.setLayoutId(m.l110());
            r.setVer(ver);
            r.setRowVersion(0L);
        }), numbered(items));
        LayoutConfirmRequest c = new LayoutConfirmRequest();
        c.setLayoutId(m.l110());
        c.setVer(ver);
        c.setRowVersion(rowVersion(m.l110(), ver));
        c.setApplyFrom("2026-07-01 00:00:00");
        c.setWarningsAcknowledged(true);
        // 운영에선 OASIS action 한 건의 트랜잭션 — 서비스를 직접 부르는 시험은 같은 경계를 만든다
        new TransactionTemplate(transactionManager).execute(st -> confirmService.confirm(c));

        // 전문 버전은 그대로(1.000) — 헤더 확정은 전문 버전을 만들지 않는다
        assertThat(versionRows(m.message())).hasSize(1);
        // 직전 T: 과거와 같은 바이트
        assertThat(serialize(m.message(), BEFORE, record)).isEqualTo(past);
        // 전환 T: 총 길이 190, 본문이 3 바이트 뒤로 밀린다
        byte[] after = serialize(m.message(), SWITCH, record);
        assertThat(after).hasSize(190);
        assertThat(new String(after, 133, 4)).isEqualTo("C123");
        assertThat(new String(past, 130, 4)).isEqualTo("C123");
        // 한계: resolver.at 은 시계를 읽지 않는다(T 는 호출자가 준다) — 시계를 옮겨 재현을 단언해도 같은 경로라 증명력이 없어 두지 않는다
        // 같은 T 의 스냅샷으로 파싱하면 값이 돌아온다
        Map<String, Object> parsed = codecs.parser().parse(resolver.at(m.message(), SWITCH), after);
        assertThat(parsed.get("COIL_ID")).isEqualTo("C123");

        // EAI 표준 헤더는 시각 T 로 해석한다 — 헤더 확정 전후 모두 L100 이 자동으로 끼고, 헤더 이력 시작 전에는 없다
        assertThat(composer.eaiHeaderAt(m.eai(), BEFORE)).contains(m.l100());
        assertThat(composer.eaiHeaderAt(m.eai(), SWITCH)).contains(m.l100());
        assertThat(composer.eaiHeaderAt(m.eai(), LocalDateTime.of(2025, 12, 31, 23, 59, 59))).isEmpty();
        MdmLayoutSnapshot before = resolver.at(m.message(), BEFORE);
        MdmLayoutSnapshot atSwitch = resolver.at(m.message(), SWITCH);
        assertThat(before.headers()).extracting(MdmLayoutHeaderRef::headerLayoutId).containsExactly(m.l100(), m.l110());
        assertThat(atSwitch.headers()).extracting(MdmLayoutHeaderRef::headerLayoutId).containsExactly(m.l100(), m.l110());
        assertThat(before.totalLength()).isEqualTo(187);
        assertThat(atSwitch.totalLength()).isEqualTo(190);

        // Ruling P3-19 — 정본은 행 기반 합성이고, 확정 때 남긴 본문 스냅샷은 감사용이다. 두 결과가 같아야 한다
        MdmLayoutHeaderRef composed = atSwitch.headers().stream().filter(h -> h.headerLayoutId() == m.l110()).findFirst().orElseThrow();
        String stored = jdbc.queryForObject("SELECT SNAPSHOT_JSON FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", String.class,
                m.l110(), new java.math.BigDecimal(ver));
        com.fasterxml.jackson.databind.JsonNode body = readJson(stored);
        assertThat(body.get("ownLength").asInt()).isEqualTo(composed.totalLength());
        com.fasterxml.jackson.databind.JsonNode storedItems = body.get("items");
        assertThat(storedItems).hasSize(composed.items().size());
        for (int i = 0; i < composed.items().size(); i++) {
            var want = composed.items().get(i);
            assertThat(storedItems.get(i).get("seq").asInt()).as("seq #%d", i).isEqualTo(want.seq());
            assertThat(storedItems.get(i).get("columnPhys").asText(null)).as("columnPhys #%d", i).isEqualTo(want.columnPhys());
            assertThat(storedItems.get(i).get("length").asInt()).as("length #%d", i).isEqualTo(want.length());
            assertThat(storedItems.get(i).get("offset").asInt()).as("offset #%d", i).isEqualTo(want.offset());
        }
        // 직전 T 의 L110 1.000 은 release 도우미로 확정해 본문 스냅샷이 없으므로 이 대조는 전환 T 쪽만 한다
        // 이전 시각의 합성 헤더는 확정 전 길이(30)를 그대로 가진다 — RELEASED 행은 바뀌지 않았다
        assertThat(before.headers().get(1).totalLength()).isEqualTo(30);
        assertThat(composed.totalLength()).isEqualTo(33);
    }

    @Test
    void preMigrationTimeUsesLegacySnapshot() {
        M201 m = m201();
        // 이행 전 이력 하나를 V21 이행 결과 모양(LEGACY)으로 둔다 — 이행 전 시절(본문·헤더 내용 없이 totalLength 177 만 남은 스냅샷 — 저장값을 그대로 돌려주는지만 본다)
        String legacy = "{\"eaiCode\":null,\"encoding\":null,\"headers\":[],\"items\":[],\"layoutId\":" + m.message()
                + ",\"layoutName\":\"M\",\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":177}";
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, "
                + "LEGACY_SNAPSHOT_YN) VALUES (?, 0.500, 'MAJOR', 'RELEASED', TIMESTAMP '2025-01-01 00:00:00', ?, 0, ?, 'Y')",
                m.message(), ts(MESSAGE_FROM), legacy);
        assertThat(resolver.at(m.message(), LocalDateTime.of(2025, 6, 1, 0, 0)).totalLength()).isEqualTo(177);
        assertThat(resolver.at(m.message(), LocalDateTime.of(2026, 3, 1, 0, 0)).totalLength()).isEqualTo(187);
        // 경계: 이행 이력의 끝(= 현 이력 시작 MESSAGE_FROM) 1초 전은 이행 스냅샷, 정각부터 현 이력
        LocalDateTime from = LocalDateTime.parse(MESSAGE_FROM.replace(' ', 'T'));
        assertThat(resolver.at(m.message(), from.minusSeconds(1)).totalLength()).isEqualTo(177);
        assertThat(resolver.at(m.message(), from).totalLength()).isEqualTo(187);
    }
}
