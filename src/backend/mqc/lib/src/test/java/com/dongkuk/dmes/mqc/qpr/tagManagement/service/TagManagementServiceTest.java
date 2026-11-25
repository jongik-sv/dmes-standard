package com.dongkuk.dmes.mqc.qpr.tagManagement.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagDoc;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagHistory;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagVersion;
import com.dongkuk.dmes.mqc.qpr.tagManagement.domain.TagVersionId;
import com.dongkuk.dmes.mqc.qpr.tagManagement.dto.TagManagementRequest;
import com.dongkuk.dmes.mqc.qpr.tagManagement.repository.TagDocRepository;
import com.dongkuk.dmes.mqc.qpr.tagManagement.repository.TagHistoryRepository;
import com.dongkuk.dmes.mqc.qpr.tagManagement.repository.TagVersionRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TagManagementServiceTest {

    static final ZoneId KST = ZoneId.of("Asia/Seoul");
    static final String BODY = "{\"data\":{},\"style\":{},\"geo\":{},\"imgs\":{},\"facts\":{}}";
    static final String EDITED = "{\"data\":{},\"style\":{\"T01\":{\"fs\":12}},\"geo\":{},\"imgs\":{},\"facts\":{}}";

    TagDocRepository docs;
    TagVersionRepository vers;
    TagHistoryRepository hist;
    Instant now;
    String user;
    TagManagementService s;

    @BeforeEach
    void setUp() {
        docs = TagMemoryRepos.of(TagDocRepository.class, o -> ((TagDoc) o).getDocId());
        vers = TagMemoryRepos.of(TagVersionRepository.class,
                o -> new TagVersionId(((TagVersion) o).getDocId(), ((TagVersion) o).getDocVer()));
        hist = TagMemoryRepos.of(TagHistoryRepository.class, o -> ((TagHistory) o).getHistNo());
        now = ZonedDateTime.of(2026, 11, 25, 10, 0, 0, 0, KST).toInstant();
        user = "kim";
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return KST; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now; }
        };
        s = new TagManagementService(docs, vers, hist, clock, () -> user);
    }

    private static TagManagementRequest save(String act, String state, String json) {
        TagManagementRequest r = new TagManagementRequest();
        r.setAct(act);
        r.setState(state);
        r.setJson(json);
        return r;
    }

    private static TagManagementRequest memo(String memo) {
        TagManagementRequest r = new TagManagementRequest();
        r.setMemo(memo);
        return r;
    }

    private void tick(int seconds) {
        now = now.plus(Duration.ofSeconds(seconds));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> doc(Map<String, Object> out) {
        return (Map<String, Object>) out.get("doc");
    }

    private void init() {
        s.save(save("INIT", "APPLIED", BODY));
    }

    @Test
    @DisplayName("search: 문서가 없으면 doc 은 null, 목록은 비어 있다")
    void searchEmpty() {
        Map<String, Object> out = s.search(new TagManagementRequest());
        assertThat(out).containsKeys("doc", "versions", "hist");
        assertThat(out.get("doc")).isNull();
        assertThat(list(out, "versions")).isEmpty();
        assertThat(list(out, "hist")).isEmpty();
    }

    @Test
    @DisplayName("save INIT: 본문·적용본·v1 버전 기록을 같은 본문으로 만들고, 문서가 있으면 거부한다")
    void init_createsV1() {
        Map<String, Object> r = s.save(save("INIT", null, BODY));
        assertThat(r).containsEntry("ver", 1).containsEntry("state", "APPLIED").containsEntry("updatedAt", "2026-11-25T10:00:00");

        Map<String, Object> out = s.search(new TagManagementRequest());
        assertThat(doc(out)).containsEntry("ver", 1).containsEntry("state", "APPLIED").containsEntry("json", BODY)
                .containsEntry("base", BODY).containsEntry("updatedBy", "kim");
        assertThat(list(out, "versions")).singleElement().satisfies(v ->
                assertThat(v).containsEntry("ver", 1).containsEntry("approvedBy", "kim").containsKeys("memo", "approvedAt"));
        assertThat(list(out, "hist")).singleElement().satisfies(h -> assertThat(h).containsEntry("act", "INIT").containsEntry("by", "kim"));

        assertThatThrownBy(() -> s.save(save("INIT", null, BODY))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("이미 문서가 있습니다");
    }

    @Test
    @DisplayName("save: 문서가 없으면 INIT 외 동작을 거부하고, 본문은 JSON 객체여야 한다")
    void save_validation() {
        assertThatThrownBy(() -> s.save(save("DRAFT", "DRAFT", EDITED))).isInstanceOf(BusinessException.class)
                .hasMessageContaining("문서가 없습니다");
        assertThatThrownBy(() -> s.save(save("INIT", null, "[1,2]"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> s.save(save("INIT", null, "{oops"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> s.save(save("PUBLISH", null, BODY))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("승인 대기 중에는 UNREQUEST 외 저장을 거부하고, 승인은 PENDING 일 때만 ver+1·적용본 교체·버전 기록을 만든다")
    void pendingFlow() {
        init();
        tick(10);
        s.save(save("DRAFT", "DRAFT", EDITED));
        assertThatThrownBy(() -> s.approve(memo("x"))).isInstanceOf(BusinessException.class).hasMessageContaining("승인 대기 중인 문서가 아닙니다");

        tick(10);
        Map<String, Object> r = s.save(save("REQUEST", "PENDING", EDITED));
        assertThat(r).containsEntry("state", "PENDING").containsEntry("ver", 1);
        for (String act : List.of("DRAFT", "REQUEST", "DISCARD")) {
            assertThatThrownBy(() -> s.save(save(act, "DRAFT", BODY))).isInstanceOf(BusinessException.class)
                    .hasMessage(TagManagementService.MSG_PENDING);
        }

        tick(10);
        Map<String, Object> a = s.approve(memo("글자 크기 조정"));
        assertThat(a).containsEntry("ver", 2).containsEntry("approvedAt", "2026-11-25T10:00:30");
        Map<String, Object> out = s.search(new TagManagementRequest());
        assertThat(doc(out)).containsEntry("ver", 2).containsEntry("state", "APPLIED").containsEntry("json", EDITED)
                .containsEntry("base", EDITED);
        assertThat(list(out, "versions")).extracting(v -> v.get("ver")).containsExactly(2, 1);
        assertThat(list(out, "versions").get(0)).containsEntry("memo", "글자 크기 조정");
        assertThat(list(out, "hist")).extracting(h -> h.get("act")).containsExactly("APPROVE", "REQUEST", "DRAFT", "INIT");
    }

    @Test
    @DisplayName("UNREQUEST 는 승인 대기를 풀고, DISCARD 는 본문을 적용본으로 되돌린다(json 무시)")
    void unrequestAndDiscard() {
        init();
        s.save(save("REQUEST", "PENDING", EDITED));
        Map<String, Object> r = s.save(save("UNREQUEST", "DRAFT", null));
        assertThat(r).containsEntry("state", "DRAFT");
        assertThat(docs.findById("MAIN").orElseThrow().getBodyJson()).isEqualTo(EDITED);
        assertThatThrownBy(() -> s.save(save("UNREQUEST", "DRAFT", null))).isInstanceOf(BusinessException.class);

        Map<String, Object> d = s.save(save("DISCARD", "DRAFT", "{\"ignored\":true}"));
        assertThat(d).containsEntry("state", "APPLIED").containsEntry("ver", 1);
        assertThat(docs.findById("MAIN").orElseThrow().getBodyJson()).isEqualTo(BODY);
    }

    @Test
    @DisplayName("이력: 같은 사용자의 DRAFT·REQUEST 되풀이는 1분 안이면 한 행으로 모이고, 1분이 지나거나 사용자가 다르면 새 행이다")
    void historyCollapse() {
        init();
        tick(5);
        s.save(save("DRAFT", "DRAFT", EDITED));
        tick(30);
        s.save(save("DRAFT", "DRAFT", EDITED));
        assertThat(hist.count()).isEqualTo(2);
        assertThat(list(s.search(new TagManagementRequest()), "hist").get(0)).containsEntry("at", "2026-11-25T10:00:35")
                .containsEntry("act", "DRAFT");

        tick(61);
        s.save(save("DRAFT", "DRAFT", EDITED));
        assertThat(hist.count()).isEqualTo(3);

        user = "lee";
        tick(1);
        s.save(save("DRAFT", "DRAFT", EDITED));
        assertThat(hist.count()).isEqualTo(4);

        tick(1);
        s.save(save("DISCARD", null, null));
        tick(1);
        s.save(save("DISCARD", null, null));
        assertThat(hist.count()).isEqualTo(6);
    }

    @Test
    @DisplayName("save INIT: 수백 KB 본문도 그대로 저장하고, 빈 json 의 DRAFT 는 지금 본문을 유지한다")
    void largeBody() {
        StringBuilder sb = new StringBuilder("{\"data\":{\"rows\":[");
        for (int i = 0; i < 20_000; i++) sb.append(i == 0 ? "" : ",").append("{\"k\":\"F").append(i).append("\",\"v\":\"값\"}");
        String big = sb.append("]}}").toString();
        assertThat(big.length()).isGreaterThan(400_000);

        s.save(save("INIT", null, big));
        s.save(save("DRAFT", "DRAFT", "  "));
        Map<String, Object> d = doc(s.search(new TagManagementRequest()));
        assertThat(d).containsEntry("json", big).containsEntry("base", big).containsEntry("state", "DRAFT");
    }

    @Test
    @DisplayName("reset: 문서·버전·이력을 지우고 RESET 이력 1행만 남긴다. 그 뒤 INIT 을 다시 받는다")
    void reset() {
        init();
        s.save(save("REQUEST", "PENDING", EDITED));
        s.approve(memo(null));

        assertThat(s.reset(new TagManagementRequest())).containsEntry("ok", true);
        Map<String, Object> out = s.search(new TagManagementRequest());
        assertThat(out.get("doc")).isNull();
        assertThat(list(out, "versions")).isEmpty();
        assertThat(list(out, "hist")).extracting(h -> h.get("act")).containsExactly("RESET");

        init();
        assertThat(docs.findById("MAIN").orElseThrow().getDocVer()).isEqualTo(1);
    }
}
