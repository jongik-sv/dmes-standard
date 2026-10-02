package com.dongkuk.dmes.mcm.widget.memo.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.memo.WidgetMemoJpaTestConfig;
import com.dongkuk.dmes.mcm.widget.memo.dto.WidgetMemoRequest;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * {@link WidgetMemoService} — H2 메모(실제 Writer·저장소) + mock(정의 저장소·사용자). 스펙 §17.3:
 * 없는 메모 null, 저장·조회 왕복, 사용자 격리, instId 형식, personal memo 정의만, format, 20,000자 경계, 100개 상한(새 instId 만).
 */
@SpringJUnitConfig(WidgetMemoJpaTestConfig.class)
class WidgetMemoServiceTest {

    private static final String DEF_ID = "def.memo1234";
    private static final String PERSONAL = "{\"scope\":\"personal\",\"format\":\"md\",\"content\":\"\"}";
    private static final String DEF_REJECTED = "사용할 수 없는 메모 위젯입니다.";

    @Autowired WidgetMemoWriter writer;
    @Autowired WidgetMemoRepository repository;

    private WidgetDefRepository defRepository;
    private SecurityIdentity securityIdentity;
    private WidgetMemoService service;

    @BeforeEach
    void setUp() {
        repository.deleteAllInBatch();
        defRepository = mock(WidgetDefRepository.class);
        securityIdentity = mock(SecurityIdentity.class);
        loginAs("userA");
        memoDef(DEF_ID, "memo", PERSONAL, "Y", WidgetDef.SRC_DEF);
        service = new WidgetMemoService(repository, writer, defRepository, securityIdentity);
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private void loginAs(String userId) {
        when(securityIdentity.currentUserId()).thenReturn(userId);
    }

    private void memoDef(String id, String typeId, String configJson, String useYn, String srcTp) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(srcTp);
        d.setTypeId(typeId);
        d.setTitle("메모");
        d.setUseYn(useYn);
        d.setConfigJson(configJson);
        when(defRepository.findById(id)).thenReturn(Optional.of(d));
    }

    private static WidgetMemoRequest inst(String instId) {
        WidgetMemoRequest r = new WidgetMemoRequest();
        r.setInstId(instId);
        return r;
    }

    private static WidgetMemoRequest req(String instId, String defId, String format, String content) {
        WidgetMemoRequest r = inst(instId);
        r.setDefId(defId);
        r.setFormat(format);
        r.setContent(content);
        return r;
    }

    private static WidgetMemoRequest req(String instId, String content) {
        return req(instId, DEF_ID, "text", content);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> memo(Map<String, Object> result) {
        assertThat(result).containsKey("memo");
        return (Map<String, Object>) result.get("memo");
    }

    private void assertInvalid(WidgetMemoRequest request, String message) {
        assertThatThrownBy(() -> service.save(request))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE))
                .hasMessage(message);
    }

    // ── load·save ───────────────────────────────────────────────────────

    @Test
    @DisplayName("없는 메모의 load 는 memo 키를 null 로 돌려준다")
    void loadMissingIsNull() {
        Map<String, Object> result = service.load(inst("w-abc-123"));
        assertThat(result).containsEntry("memo", null);
    }

    @Test
    @DisplayName("save 뒤 load 는 같은 메모 — instId·defId·format·content·updatedAt(ISO-8601 문자열)")
    void saveThenLoadRoundTrip() {
        Map<String, Object> saved = memo(service.save(req("w-abc-123", DEF_ID, "md", "# 제목\n- 할 일")));
        assertThat(saved).containsEntry("instId", "w-abc-123").containsEntry("defId", DEF_ID)
                .containsEntry("format", "md").containsEntry("content", "# 제목\n- 할 일");
        assertThat(saved.get("updatedAt")).isInstanceOf(String.class);
        Instant.parse((String) saved.get("updatedAt"));

        Map<String, Object> loaded = memo(service.load(inst("w-abc-123")));
        assertThat(loaded).containsEntry("instId", "w-abc-123").containsEntry("defId", DEF_ID)
                .containsEntry("format", "md").containsEntry("content", "# 제목\n- 할 일");
        assertThat(loaded.get("updatedAt")).isNotNull();
        assertThat(loaded.keySet()).containsExactly("instId", "defId", "format", "content", "updatedAt");
    }

    @Test
    @DisplayName("본문은 앞뒤 공백을 지우지 않고 그대로, null 은 빈 메모로 저장하고 load 는 \"\" 를 돌려준다")
    void contentKeptAsIsAndNullIsEmpty() {
        assertThat(memo(service.save(req("i1", "  들여쓴 줄\n\n"))).get("content")).isEqualTo("  들여쓴 줄\n\n");
        service.save(req("i2", null));
        assertThat(memo(service.load(inst("i2")))).containsEntry("content", "");
    }

    @Test
    @DisplayName("덮어쓰기는 같은 행을 고친다 — 형식·본문이 바뀌고 생성 시각은 그대로")
    void overwriteKeepsCreatedAt() {
        service.save(req("i1", DEF_ID, "text", "처음"));
        Instant createdAt = repository.findById(new WidgetMemoId("userA", "i1")).orElseThrow().getCreatedAt();
        assertThat(createdAt).isNotNull();

        Map<String, Object> saved = memo(service.save(req("i1", DEF_ID, "html", "<b>둘째</b>")));

        assertThat(saved).containsEntry("format", "html").containsEntry("content", "<b>둘째</b>");
        WidgetMemo row = repository.findById(new WidgetMemoId("userA", "i1")).orElseThrow();
        assertThat(row.getCreatedAt()).isEqualTo(createdAt);
        assertThat(row.getFmt()).isEqualTo("html");
        assertThat(repository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("사용자 격리 — 같은 instId 라도 다른 사용자의 메모는 읽지도 덮어쓰지도 않는다")
    void isolatedPerUser() {
        service.save(req("i1", "A 의 메모"));

        loginAs("userB");
        assertThat(service.load(inst("i1"))).containsEntry("memo", null);
        service.save(req("i1", "B 의 메모"));
        assertThat(memo(service.load(inst("i1")))).containsEntry("content", "B 의 메모");

        loginAs("userA");
        assertThat(memo(service.load(inst("i1")))).containsEntry("content", "A 의 메모");
        assertThat(repository.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("인증 정보가 없으면 AUTH_FAILED")
    void requiresLogin() {
        loginAs(null);
        assertThatThrownBy(() -> service.load(inst("i1")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.AUTH_FAILED));
    }

    // ── 검사 ────────────────────────────────────────────────────────────

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"a.b", "a b", "w:1", "가나", "x/../y", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"})
    @DisplayName("instId 는 1~40자 [A-Za-z0-9_-] 만 — load·save 모두 E002")
    void instIdFormat(String instId) {
        assertInvalid(req(instId, "x"), "위젯 인스턴스 ID 가 올바르지 않습니다.");
        assertThatThrownBy(() -> service.load(inst(instId)))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        assertThat(repository.count()).isZero();
    }

    @Test
    @DisplayName("instId 40자·밑줄·하이픈은 받는다")
    void instIdBoundaryAccepted() {
        String forty = "w-" + "A_9".repeat(12) + "zz";
        assertThat(forty).hasSize(40);
        service.save(req(forty, "x"));
        assertThat(memo(service.load(inst(forty)))).containsEntry("instId", forty);
    }

    @Test
    @DisplayName("defId 는 사용 중인 memo 유형 정의이고 scope=personal 일 때만 — 그 밖은 모두 E002")
    void defIdMustBePersonalMemoInUse() {
        memoDef("def.shared01", "memo", "{\"scope\":\"shared\",\"format\":\"text\",\"content\":\"공지\"}", "Y", WidgetDef.SRC_DEF);
        memoDef("def.noscope1", "memo", "{\"format\":\"text\"}", "Y", WidgetDef.SRC_DEF);
        memoDef("def.broken01", "memo", "{scope:", "Y", WidgetDef.SRC_DEF);
        memoDef("def.nocfg001", "memo", null, "Y", WidgetDef.SRC_DEF);
        memoDef("def.html0001", "html", PERSONAL, "Y", WidgetDef.SRC_DEF);
        memoDef("def.stopped1", "memo", PERSONAL, "N", WidgetDef.SRC_DEF);
        memoDef("home.memo", "memo", PERSONAL, "Y", WidgetDef.SRC_CODE);

        for (String defId : new String[] {"def.shared01", "def.noscope1", "def.broken01", "def.nocfg001", "def.html0001",
                "def.stopped1", "home.memo", "def.none0000", "", "  ", null, "d".repeat(101)}) {
            assertInvalid(req("i1", defId, "text", "x"), DEF_REJECTED);
        }
        assertThat(repository.count()).isZero();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"markdown", "TEXT", "htm", " md"})
    @DisplayName("format 은 text·md·html 만")
    void formatAllowedValues(String format) {
        assertInvalid(req("i1", DEF_ID, format, "x"), "메모 형식은 text·md·html 중 하나여야 합니다.");
        assertThat(repository.count()).isZero();
    }

    @Test
    @DisplayName("본문 20,000자는 저장·조회되고(4000자 넘는 LONG32VARCHAR) 20,001자는 E002")
    void contentLengthBoundary() {
        String max = "가".repeat(WidgetMemoService.CONTENT_MAX);
        service.save(req("i1", max));
        assertThat((String) memo(service.load(inst("i1"))).get("content")).hasSize(20_000).isEqualTo(max);

        assertInvalid(req("i2", max + "a"), "메모는 20,000자까지 저장할 수 있습니다.");
        assertThat(repository.findById(new WidgetMemoId("userA", "i2"))).isEmpty();
    }

    @Test
    @DisplayName("사용자당 100개 — 새 instId 만 센다. 100개 뒤 새 칸은 E002, 기존 칸 덮어쓰기와 다른 사용자는 통과")
    void hundredMemosPerUser() {
        for (int i = 1; i <= WidgetMemoWriter.MAX_PER_USER; i++) service.save(req("i" + i, "m" + i));
        assertThat(repository.countByUserId("userA")).isEqualTo(100);

        assertInvalid(req("i101", "넘침"), "메모는 100개까지 저장할 수 있습니다");
        assertThat(repository.countByUserId("userA")).isEqualTo(100);

        assertThat(memo(service.save(req("i50", "고쳐 씀")))).containsEntry("content", "고쳐 씀");
        assertThat(repository.countByUserId("userA")).isEqualTo(100);

        loginAs("userB");
        service.save(req("i101", "B 는 첫 메모"));
        assertThat(repository.countByUserId("userB")).isEqualTo(1);
    }
}
