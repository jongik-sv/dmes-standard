package com.dongkuk.dmes.mcm.searchdefaults.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.screenusage.support.StubSecurityIdentity;
import com.dongkuk.dmes.mcm.searchdefaults.dto.SecSrchDfltPageRequest;
import com.dongkuk.dmes.mcm.searchdefaults.dto.SecSrchDfltSearchRequest;
import com.dongkuk.dmes.mcm.searchdefaults.entity.SecUserSrchDflt;
import com.dongkuk.dmes.mcm.searchdefaults.repository.SecUserSrchDfltRepository;
import com.dongkuk.dmes.mcm.searchdefaults.support.SrchDfltJpaTestConfig;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/** 서비스·쓰기 빈·저장소를 실제 DB(Oracle 시험 PDB)로 묶어 본 시험 — 정상·검사 위반·사용자 격리·교체 원자성. */
@SpringJUnitConfig(SrchDfltJpaTestConfig.class)
class SecSrchDfltServiceJpaTest {

    private static final String PAGE = "mcm:csa/commUserMng";
    private static final String FIXED = "{\"kind\":\"fixed\",\"value\":\"A\"}";

    @Autowired SecSrchDfltService service;
    @Autowired SecSrchDfltWriter writer;
    @Autowired SecUserSrchDfltRepository repository;
    @Autowired StubSecurityIdentity identity;

    @BeforeEach
    void clean() {
        repository.deleteAllInBatch();
        identity.userId = "userA";
    }

    private static SecSrchDfltPageRequest page(String pageId) {
        SecSrchDfltPageRequest r = new SecSrchDfltPageRequest();
        r.setPageId(pageId);
        return r;
    }

    private static Map<String, Object> row(String fieldKey, String ruleJson) {
        Map<String, Object> m = new HashMap<>();
        m.put("fieldKey", fieldKey);
        m.put("ruleJson", ruleJson);
        m.put("fieldMeta", "USER_NM");
        m.put("fieldLabel", "사용자명");
        return m;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> searchRows() {
        return (List<Map<String, Object>>) service.search(new SecSrchDfltSearchRequest()).get("rows");
    }

    @Test
    @DisplayName("savePage 는 그 화면의 행을 통째로 바꾸고 search 는 본인 전체 행을 돌려준다")
    void saveReplacesPageAndSearchReturnsAll() {
        Map<String, Object> saved = service.savePage(page(PAGE), List.of(row("a", FIXED), row("b", "{\"kind\":\"last\"}")));
        assertThat(saved).containsEntry("pageId", PAGE).containsEntry("savedCount", 2);
        service.savePage(page("mcm:other"), List.of(row("a", FIXED)));

        service.savePage(page(PAGE), List.of(row("c", "{\"kind\":\"relative\",\"base\":\"monthEnd\",\"months\":-1}")));

        List<Map<String, Object>> rows = searchRows();
        assertThat(rows).extracting(r -> r.get("pageId") + "/" + r.get("fieldKey"))
                .containsExactly("mcm:csa/commUserMng/c", "mcm:other/a");
        assertThat(rows.get(0)).containsEntry("ruleJson", "{\"kind\":\"relative\",\"base\":\"monthEnd\",\"months\":-1}")
                .containsEntry("fieldMeta", "USER_NM").containsEntry("fieldLabel", "사용자명");
    }

    @Test
    @DisplayName("규칙 JSON 은 알려진 칸만 남긴 정규형으로 저장된다")
    void ruleIsCanonicalized() {
        service.savePage(page(PAGE), List.of(row("a", " { \"kind\" : \"fixed\", \"value\":\"\", \"evil\":\"x\" } ")));

        assertThat(repository.findAll()).extracting(SecUserSrchDflt::getRuleJson)
                .containsExactly("{\"kind\":\"fixed\",\"value\":\"\"}");
    }

    @Test
    @DisplayName("요청에 다른 사용자 ID 를 넣어도 인증 사용자 행으로만 저장되고 다른 사용자 행은 건드리지 않는다")
    void otherUserIdInPayloadIsIgnored() {
        identity.userId = "victim";
        service.savePage(page(PAGE), List.of(row("a", "{\"kind\":\"fixed\",\"value\":\"V\"}")));

        identity.userId = "userA";
        Map<String, Object> hostile = row("a", FIXED);
        hostile.put("userId", "victim");
        hostile.put("USER_ID", "victim");
        service.savePage(page(PAGE), List.of(hostile));
        assertThat(searchRows()).hasSize(1);
        assertThat(searchRows().get(0)).doesNotContainKey("userId");

        assertThat(repository.findByUserIdAndPageId("victim", PAGE)).extracting(SecUserSrchDflt::getRuleJson)
                .containsExactly("{\"kind\":\"fixed\",\"value\":\"V\"}");
        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).hasSize(1);

        service.resetPage(page(PAGE));
        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).isEmpty();
        assertThat(repository.findByUserIdAndPageId("victim", PAGE)).hasSize(1);
    }

    @Test
    @DisplayName("resetPage 는 그 화면 행만 지우고 지운 수를 돌려준다")
    void resetPage() {
        service.savePage(page(PAGE), List.of(row("a", FIXED), row("b", FIXED)));
        service.savePage(page("mcm:other"), List.of(row("a", FIXED)));

        assertThat(service.resetPage(page(PAGE))).containsEntry("deletedCount", 2);
        assertThat(service.resetPage(page(PAGE))).containsEntry("deletedCount", 0);
        assertThat(repository.findAll()).extracting(SecUserSrchDflt::getPageId).containsExactly("mcm:other");
    }

    @Test
    @DisplayName("빈 행 목록으로 savePage 하면 그 화면 행이 모두 지워진다")
    void emptySaveClearsPage() {
        service.savePage(page(PAGE), List.of(row("a", FIXED)));
        service.savePage(page(PAGE), List.of());
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("인증 사용자가 없으면 세 action 모두 거절한다")
    void requiresAuthenticatedUser() {
        identity.userId = " ";
        assertThatThrownBy(() -> service.search(new SecSrchDfltSearchRequest())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.resetPage(page(PAGE))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("검사를 어긴 행이 하나라도 있으면 이전 행이 그대로 남는다")
    void invalidRowKeepsPreviousRows() {
        service.savePage(page(PAGE), List.of(row("keep", FIXED)));

        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(row("a", FIXED), row("b", "not json"))))
                .isInstanceOf(BusinessException.class);

        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).extracting(SecUserSrchDflt::getFieldKey)
                .containsExactly("keep");
    }

    @Test
    @DisplayName("쓰기 중간에 DB 오류가 나면 지웠던 이전 행이 롤백으로 되살아난다(교체 원자성)")
    void replaceRollsBackWhenInsertFails() {
        writer.replacePage("userA", PAGE, List.of(new SecSrchDfltWriter.RowValues("keep", FIXED, null, null)));

        // fieldLabel 이 컬럼 길이(100)를 넘으면 지우기·flush 뒤 넣기에서 DB 가 거절한다(서비스 검사를 건너뛰고 쓰기 빈을 직접 호출).
        List<SecSrchDfltWriter.RowValues> bad = List.of(
                new SecSrchDfltWriter.RowValues("ok", FIXED, null, null),
                new SecSrchDfltWriter.RowValues("bad", FIXED, null, "x".repeat(500)));
        assertThatThrownBy(() -> writer.replacePage("userA", PAGE, bad)).isInstanceOf(RuntimeException.class);

        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).extracting(SecUserSrchDflt::getFieldKey)
                .containsExactly("keep");
    }

    @Test
    @DisplayName("감사 컬럼(생성·수정 시각, VER)이 채워진다")
    void auditColumnsFilled() {
        service.savePage(page(PAGE), List.of(row("a", FIXED)));
        SecUserSrchDflt e = repository.findAll().get(0);
        assertThat(e.getCreatedAt()).isNotNull();
        assertThat(e.getUpdatedAt()).isNotNull();
        assertThat(e.getVersion()).isEqualTo(0L);
    }

    // ── 입력 검사 ──────────────────────────────────────────────

    private void assertRejected(String ruleJson) {
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(row("a", ruleJson))))
                .as(ruleJson).isInstanceOf(BusinessException.class);
        assertThat(repository.findAll()).as(ruleJson).isEmpty();
    }

    @Test
    @DisplayName("JSON 이 아니거나 객체가 아니거나 kind 가 잘못된 규칙은 거절한다")
    void rejectsMalformedRules() {
        assertRejected(null);
        assertRejected("");
        assertRejected("not json");
        assertRejected("[1,2]");
        assertRejected("\"fixed\"");
        assertRejected("{\"kind\":\"fixed\",\"value\":\"A\"} trailing");
        assertRejected("{}");
        assertRejected("{\"kind\":1}");
        assertRejected("{\"kind\":\"script\",\"value\":\"A\"}");
        assertRejected("{\"kind\":\"fixed\"}");
        assertRejected("{\"kind\":\"fixed\",\"value\":5}");
        assertRejected("{\"kind\":\"fixed\",\"value\":\"" + "x".repeat(501) + "\"}");
        assertRejected("{\"kind\":\"relative\"}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"tomorrow\"}");
    }

    @Test
    @DisplayName("months·days 가 정수가 아니거나 범위(±120개월·±3660일)를 넘으면 거절하고 경계값은 받는다")
    void rejectsOutOfRangeRelative() {
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"months\":121}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"months\":-121}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":3661}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":-3661}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":1.5}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":\"3\"}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":99999999999}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":-2147483648}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"months\":-2147483648}");
        assertRejected("{\"kind\":\"relative\",\"base\":\"today\",\"days\":2147483647}");

        service.savePage(page(PAGE), List.of(row("a", "{\"kind\":\"relative\",\"base\":\"today\",\"months\":-120,\"days\":3660}")));
        assertThat(repository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("화면 ID 는 필수이고 200자·제어문자를 넘으면 거절한다")
    void rejectsBadPageId() {
        assertThatThrownBy(() -> service.savePage(page(null), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.savePage(page("  "), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.savePage(page("p".repeat(201)), List.of())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.resetPage(page("a\nb"))).isInstanceOf(BusinessException.class);
        service.savePage(page("p".repeat(200)), List.of(row("a", FIXED)));
        assertThat(repository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("칸 키·표준 용어·라벨 길이와 칸 키 중복을 거절한다")
    void rejectsBadRowFields() {
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(row("", FIXED)))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(row("k".repeat(101), FIXED)))).isInstanceOf(BusinessException.class);
        Map<String, Object> longMeta = row("a", FIXED);
        longMeta.put("fieldMeta", "m".repeat(51));
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(longMeta))).isInstanceOf(BusinessException.class);
        Map<String, Object> longLabel = row("a", FIXED);
        longLabel.put("fieldLabel", "l".repeat(101));
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(longLabel))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> service.savePage(page(PAGE), List.of(row("a", FIXED), row("a", FIXED))))
                .isInstanceOf(BusinessException.class);
        assertThat(repository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("화면당 행은 50개까지다(50개는 받고 51개는 거절)")
    void limitsRowsPerPage() {
        List<Map<String, Object>> fifty = new ArrayList<>();
        for (int i = 0; i < 50; i++) fifty.add(row("k" + i, FIXED));
        service.savePage(page(PAGE), fifty);
        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).hasSize(50);

        List<Map<String, Object>> fiftyOne = new ArrayList<>(fifty);
        fiftyOne.add(row("k50", FIXED));
        assertThatThrownBy(() -> service.savePage(page(PAGE), fiftyOne)).isInstanceOf(BusinessException.class);
        assertThat(repository.findByUserIdAndPageId("userA", PAGE)).hasSize(50);
    }

    @Test
    @DisplayName("표준 용어·라벨이 비면 NULL 로 저장한다")
    void blankMetaAndLabelBecomeNull() {
        Map<String, Object> r = row("a", FIXED);
        r.put("fieldMeta", "");
        r.put("fieldLabel", null);
        service.savePage(page(PAGE), List.of(r));
        SecUserSrchDflt e = repository.findAll().get(0);
        assertThat(e.getFieldMeta()).isNull();
        assertThat(e.getFieldLabel()).isNull();
    }
}
