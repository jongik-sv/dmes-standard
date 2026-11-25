package com.dongkuk.dmes.mqc.qdm.qualitySpec.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.InMemoryQualitySpecStore;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.QualitySpecFixture;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpec;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.QualitySpecIfLog;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.domain.SpecStatus;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecBatchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecCodesRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecDeleteRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecHistoryRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecRunRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecSaveRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecSearchRequest;
import com.dongkuk.dmes.mqc.qdm.qualitySpec.dto.QualitySpecViewRequest;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@SuppressWarnings("unchecked")
class QualitySpecServiceTest {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private InMemoryQualitySpecStore store;
    private QualitySpecService service;

    @BeforeEach
    void setUp() {
        store = QualitySpecFixture.store();
        Clock clock = Clock.fixed(LocalDateTime.of(2026, 9, 1, 10, 0).atZone(KST).toInstant(), KST);
        service = new QualitySpecService(store, clock, () -> "시험자");
    }

    // ── 도움 ──

    private List<Map<String, Object>> save(String text, String specNo, boolean confirm) {
        QualitySpecSaveRequest req = new QualitySpecSaveRequest();
        req.setText(text);
        req.setSpecNo(specNo);
        req.setConfirm(confirm ? "Y" : null);
        return (List<Map<String, Object>>) service.save(req).get("saved");
    }

    private Map<String, Object> batch(String action, String specNos) {
        QualitySpecBatchRequest req = new QualitySpecBatchRequest();
        req.setSpecNos(specNos);
        return "send".equals(action) ? service.send(req) : service.confirm(req);
    }

    private QualitySpec spec(String specNo) {
        return store.spec(specNo).orElseThrow();
    }

    private List<Map<String, Object>> changes(String specNo) {
        QualitySpecHistoryRequest req = new QualitySpecHistoryRequest();
        req.setSpecNo(specNo);
        return (List<Map<String, Object>>) service.history(req).get("changes");
    }

    // ── 저장·채번 ──

    @Test
    @DisplayName("여러 줄을 저장하면 줄마다 고객사-품명+순번으로 채번하고 등록 이력을 남긴다")
    void saveNumbersPerPrefix() {
        List<Map<String, Object>> saved = save("""
                고객사 = 320104, 품명 = L, 원재료 두께 1.2 | 원재료 재질 = H36
                고객사 = 320104, 품명 = L, 원재료 두께 = 0.5~0.8 | 원재료 재질 = H32
                고객사 = 110197, 품명 = 3, 색상코드 = RAL9016 | 광택 = 40
                """, null, false);

        assertThat(saved).extracting(m -> m.get("specNo")).containsExactly("320104-L01", "320104-L02", "110197-301");
        assertThat(spec("320104-L01").getStatus()).isEqualTo(SpecStatus.DRAFT);
        assertThat(spec("320104-L01").getRegUsrNm()).isEqualTo("시험자");
        assertThat(store.terms("320104-L02")).hasSize(4);
        Map<String, Object> reg = changes("320104-L01").get(0);
        assertThat(reg.get("action")).isEqualTo("REG");
        assertThat((List<Map<String, String>>) reg.get("changes")).extracting(c -> c.get("after"))
                .containsExactly("= 320104", "= L", "= 1.2", "= H36");
        assertThat(QualitySpecService.nextSpecNo("320104", "L", Set.of("320104-L01", "320104-L09", "320104-LX"))).isEqualTo("320104-L10");
    }

    @Test
    @DisplayName("해석 오류가 있는 줄이 하나라도 있으면 아무것도 저장하지 않는다(서버 재검증)")
    void saveRejectsErrors() {
        assertThatThrownBy(() -> save("고객사 = 320104, 품명 = L | 원재료 재질 = H36\n품명 = L | 광택 = 30", null, false))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("2행: 조건에 고객사가 필요합니다");
        assertThat(store.specs).isEmpty();

        assertThatThrownBy(() -> save("고객사 = 320104, 품명 = X | 광택 = 30", null, false))
                .hasMessageContaining("품명 코드가 없습니다: X");
    }

    @Test
    @DisplayName("저장 후 확정은 사전에 없는 항목이 있거나 결과가 없으면 거절한다")
    void saveConfirmNeedsMapping() {
        assertThatThrownBy(() -> save("고객사 = 320104, 품명 = L | 도막색 = 회색", null, true))
                .hasMessageContaining("코드 매핑 필요");
        save("고객사 = 320104, 품명 = L | 도막색 = 회색", null, false);
        assertThat(spec("320104-L01").getStatus()).isEqualTo(SpecStatus.DRAFT);

        Map<String, Object> out = batch("confirm", "320104-L01");
        assertThat((List<Map<String, Object>>) out.get("confirmed")).isEmpty();
        assertThat((List<Map<String, Object>>) out.get("skipped")).singleElement()
                .satisfies(s -> assertThat((String) s.get("reason")).contains("코드 매핑 필요"));
    }

    // ── 상태 흐름 ──

    @Test
    @DisplayName("작성중 → 확정 → 전송완료. 확정이 아닌 사양은 확정에서 건너뛴다")
    void confirmThenSend() {
        save("고객사 = 110197, 품명 = L, BOM = 'A60041' | 통과공정 = 1P-33-83-A3", null, false);

        Map<String, Object> c = batch("confirm", "110197-L01");
        assertThat((List<Map<String, Object>>) c.get("confirmed")).hasSize(1);
        assertThat(spec("110197-L01").getStatus()).isEqualTo(SpecStatus.CONF);
        assertThat((List<Map<String, Object>>) batch("confirm", "110197-L01").get("skipped")).hasSize(1);

        Map<String, Object> s = batch("send", "110197-L01");
        List<Map<String, Object>> results = (List<Map<String, Object>>) s.get("results");
        assertThat(results).singleElement().satisfies(r -> {
            assertThat(r.get("result")).isEqualTo("OK");
            assertThat(r.get("ifNo")).isEqualTo("IF-20260901-01");
        });
        assertThat(s.get("okCount")).isEqualTo(1);
        assertThat((String) s.get("payload")).contains("\"IF_ID\" : \"MESQ_OMS_SPEC_001\"", "\"ATTR\" : \"CCL_BOM\"").doesNotContain("\"CUS_CD\" : \"110197\",\n      \"OP\"");
        assertThat(spec("110197-L01").getStatus()).isEqualTo(SpecStatus.SENT);
        QualitySpecIfLog log = store.ifLogs.get("IF-20260901-01");
        assertThat(log.getTarget()).isEqualTo("110197-L01 Rev.1");
        assertThat(log.getPayload()).contains("\"SPEC_CNT\" : 1");
        assertThat(changes("110197-L01")).extracting(m -> m.get("action")).containsExactly("SEND", "CONF", "REG");
    }

    @Test
    @DisplayName("OMS 전송은 결정적이다 — 실패 표시가 있는 사양만 그 메시지로 실패하고 재전송해도 같다. 작성중은 건너뛴다")
    void sendIsDeterministic() {
        save("고객사 = 205202, 품명 = L, BOM = 'C10233' | 통과공정 = 1P-34-82-A1", null, true);
        save("고객사 = 205202, 품명 = 3, 색상코드 = RAL3009 | 광택 = 25", null, true);
        save("고객사 = 205202, 품명 = G | 광택 = 10~20", null, false);
        spec("205202-L01").setSimFailMsg("품명 코드 매핑 오류 (RC=12)");

        Map<String, Object> out = batch("send", "205202-L01,205202-301,205202-G01");

        assertThat((List<Map<String, Object>>) out.get("results")).extracting(r -> r.get("specNo") + ":" + r.get("result"))
                .containsExactly("205202-301:OK", "205202-L01:FAIL");
        assertThat((List<Map<String, Object>>) out.get("skipped")).extracting(r -> r.get("specNo")).containsExactly("205202-G01");
        assertThat(spec("205202-L01").getStatus()).isEqualTo(SpecStatus.FAIL);
        assertThat(spec("205202-L01").getFailMsg()).isEqualTo("품명 코드 매핑 오류 (RC=12)");

        Map<String, Object> again = batch("send", "205202-L01");
        assertThat((List<Map<String, Object>>) again.get("results")).singleElement()
                .satisfies(r -> {
                    assertThat(r.get("result")).isEqualTo("FAIL");
                    assertThat(r.get("ifNo")).isEqualTo("IF-20260901-03");
                });

        QualitySpecHistoryRequest req = new QualitySpecHistoryRequest();
        req.setKind("IF");
        req.setResult("FAIL");
        List<Map<String, Object>> logs = (List<Map<String, Object>>) service.history(req).get("ifLogs");
        assertThat(logs).hasSize(2).allSatisfy(l -> assertThat(l.get("resendable")).isEqualTo(true));
        assertThatThrownBy(() -> batch("send", "205202-G01")).hasMessageContaining("보낼 수 있는 사양이 없습니다");
    }

    @Test
    @DisplayName("확정된 사양을 고치면 Rev+1 로 개정되고 작성중으로 돌아가며, 항목별 전/후 차이를 이력에 남긴다")
    void editingConfirmedSpecBumpsRevision() {
        save("고객사 = 320104, 품명 = L, 원재료 두께 = 0.5~0.8 | 원재료 재질 = H32, 통과공정 = 1P-31-81-A1", null, true);

        List<Map<String, Object>> saved = save("고객사 = 320104, 품명 = L, 원재료 두께 = 0.5~0.9 | 원재료 재질 = H32, 포장방법 = P03",
                "320104-L01", false);

        assertThat(saved).singleElement().satisfies(s -> {
            assertThat(s.get("rev")).isEqualTo(2);
            assertThat(s.get("action")).isEqualTo("REV");
            assertThat(s.get("status")).isEqualTo(SpecStatus.DRAFT);
        });
        Map<String, Object> rev = changes("320104-L01").get(0);
        assertThat(rev.get("actionNm")).isEqualTo("개정 Rev.2");
        assertThat((List<Map<String, String>>) rev.get("changes")).extracting(c -> c.get("item") + ":" + c.get("before") + ">" + c.get("after"))
                .containsExactly("원재료 두께:0.5~0.8>0.5~0.9", "포장방법:—>= P03", "통과공정:= 1P-31-81-A1>—", "상태:확정>작성중");
        assertThat(rev.get("summary")).isEqualTo("원재료 두께: 0.5~0.8 → 0.5~0.9 외 3건");

        // 작성중 사양은 개정 없이 수정한다.
        List<Map<String, Object>> again = save("고객사 = 320104, 품명 = L, 원재료 두께 = 0.5~0.9 | 원재료 재질 = H35", "320104-L01", false);
        assertThat(again.get(0).get("rev")).isEqualTo(2);
        assertThat(again.get(0).get("action")).isEqualTo("MOD");

        assertThatThrownBy(() -> save("고객사 = 110197, 품명 = L | 원재료 재질 = H35", "320104-L01", false))
                .hasMessageContaining("고객사·품명은 바꿀 수 없습니다");
    }

    @Test
    @DisplayName("전송완료 사양을 지우면 OMS 삭제 통지를 남기고 이력에는 삭제된 사양으로 보인다")
    void deleteSentSpec() {
        save("고객사 = 110197, 품명 = G | 상도 도막두께 ≥ 22, 시험항목 = MEK", null, true);
        batch("send", "110197-G01");

        QualitySpecDeleteRequest req = new QualitySpecDeleteRequest();
        req.setSpecNos("110197-G01");
        assertThat((List<String>) service.delete(req).get("deleted")).containsExactly("110197-G01");

        assertThat(store.specs).isEmpty();
        assertThat(store.terms).isEmpty();
        assertThat(store.ifLogs.values()).extracting(QualitySpecIfLog::getMsg).contains("사양 삭제 통지 (QSPEC_DEL)");
        Map<String, Object> del = changes("110197-G01").get(0);
        assertThat(del.get("action")).isEqualTo("DEL");
        assertThat(del.get("specStatus")).isNull();
    }

    // ── 조회 ──

    @Test
    @DisplayName("목록은 상태·고객사·품명·항목·키워드로 거르고, 건수는 거르기 전 전체 기준이다")
    void searchFilters() {
        save("""
                고객사 = 320104, 품명 = L, 원재료 두께 1.2 | 원재료 재질 = H36
                고객사 = 110197, 품명 = 3, 색상코드 = RAL9016 | 광택 = 40
                고객사 = 110197, 품명 = L, BOM = 'A60041' | 통과공정 = 1P-33-83-A3
                """, null, false);
        batch("confirm", "110197-301");

        QualitySpecSearchRequest req = new QualitySpecSearchRequest();
        req.setStatus(SpecStatus.CONF);
        Map<String, Object> out = service.search(req);
        assertThat((List<Map<String, Object>>) out.get("specs")).extracting(m -> m.get("specNo")).containsExactly("110197-301");
        assertThat(out.get("total")).isEqualTo(3);
        assertThat((Map<String, Integer>) out.get("counts")).containsEntry("DRAFT", 2).containsEntry("CONF", 1);

        QualitySpecSearchRequest byAttr = new QualitySpecSearchRequest();
        byAttr.setAttrCd("CCL_BOM");
        assertThat((List<Map<String, Object>>) service.search(byAttr).get("specs")).extracting(m -> m.get("specNo")).containsExactly("110197-L01");

        QualitySpecSearchRequest byKeyword = new QualitySpecSearchRequest();
        byKeyword.setKeyword("수요가 b");
        assertThat((List<Map<String, Object>>) service.search(byKeyword).get("specs")).extracting(m -> m.get("specNo")).containsExactly("320104-L01");

        QualitySpecViewRequest view = new QualitySpecViewRequest();
        view.setSpecNo("110197-301");
        Map<String, Object> detail = (Map<String, Object>) service.view(view).get("spec");
        assertThat(detail.get("cusNm")).isEqualTo("수요가 A");
        assertThat(detail.get("prdNm")).isEqualTo("CCGI");
        assertThat(detail.get("mapped")).isEqualTo(true);
    }

    @Test
    @DisplayName("기간 거르기는 끝 날짜 하루를 포함하고, 시작일이 종료일보다 늦으면 거절한다")
    void historyPeriod() {
        save("고객사 = 320104, 품명 = L | 원재료 재질 = H36", null, false);
        QualitySpecHistoryRequest req = new QualitySpecHistoryRequest();
        req.setFromDt("2026-09-01");
        req.setToDt("2026-09-01");
        assertThat((List<Map<String, Object>>) service.history(req).get("changes")).hasSize(1);
        req.setFromDt("2026-09-02");
        req.setToDt("2026-09-03");
        assertThat((List<Map<String, Object>>) service.history(req).get("changes")).isEmpty();
        req.setFromDt("2026-09-05");
        assertThatThrownBy(() -> service.history(req)).hasMessageContaining("시작일이 종료일보다 늦을 수 없습니다");
    }

    // ── 항목 사전 ──

    @Test
    @DisplayName("항목 사전: 이름·코드 중복 거절, 사용 중인 항목은 코드 변경·삭제 거절, 사용 건수를 센다")
    void dictionaryRules() {
        save("고객사 = 320104, 품명 = L | 광택 = 30", null, false);

        QualitySpecSaveRequest dup = new QualitySpecSaveRequest();
        dup.setTarget("ATTR");
        dup.setAttrCd("GLOSS2");
        dup.setAttrNm("광 택");
        dup.setKind("RESULT");
        dup.setDataType("NUMBER");
        assertThatThrownBy(() -> service.save(dup)).hasMessageContaining("한글 항목명이 이미 있습니다");

        QualitySpecSaveRequest add = new QualitySpecSaveRequest();
        add.setTarget("ATTR");
        add.setAttrCd("coat_color");
        add.setAttrNm("도막색");
        add.setKind("RESULT");
        add.setDataType("VARCHAR2");
        add.setDataLen("10");
        Map<String, Object> attr = (Map<String, Object>) service.save(add).get("attr");
        assertThat(attr.get("attrCd")).isEqualTo("COAT_COLOR");
        assertThat(attr.get("seq")).isEqualTo(15);

        QualitySpecSaveRequest rename = new QualitySpecSaveRequest();
        rename.setTarget("ATTR");
        rename.setOrigAttrCd("GLOSS");
        rename.setAttrCd("GLOSS_GU");
        rename.setAttrNm("광택");
        rename.setKind("RESULT");
        rename.setDataType("NUMBER");
        assertThatThrownBy(() -> service.save(rename)).hasMessageContaining("시스템 코드를 바꿀 수 없습니다");

        QualitySpecDeleteRequest del = new QualitySpecDeleteRequest();
        del.setTarget("ATTR");
        del.setAttrCd("GLOSS");
        assertThatThrownBy(() -> service.delete(del)).hasMessageContaining("사용 여부를 중지로 바꾸세요");
        del.setAttrCd("COAT_COLOR");
        assertThat((List<String>) service.delete(del).get("deleted")).containsExactly("COAT_COLOR");

        QualitySpecCodesRequest codes = new QualitySpecCodesRequest();
        codes.setKind("RESULT");
        Map<String, Object> out = service.codes(codes);
        assertThat((List<Map<String, Object>>) out.get("attrs")).filteredOn(a -> "GLOSS".equals(a.get("attrCd")))
                .singleElement().satisfies(a -> assertThat(a.get("useCount")).isEqualTo(1));
        assertThat((List<Map<String, Object>>) out.get("products")).extracting(p -> p.get("label"))
                .containsExactly("3 : CCGI", "4 : CCLI", "G : GI", "L : G/L", "W : GLX");
        assertThat((List<Map<String, Object>>) out.get("orders")).hasSize(1);
    }

    // ── 주문 적용 시뮬레이션 ──

    @Test
    @DisplayName("주문 적용: 맞고 확정·전송완료인 사양만 사양번호 순으로 덮어쓰고(뒤 사양 우선) 중복을 충돌로 알린다")
    void runAppliesSpecsInOrder() {
        save("""
                고객사 = 320104, 품명 = L, 원재료 두께 1.2 | 원재료 재질 = H36
                고객사 = 320104, 품명 = L, 원재료 두께 = 0.5~0.8 | 원재료 재질 = H32, 통과공정 = 1P-31-81-A1
                고객사 = 320104, 품명 = L, 원재료 폭 = 900~1250 | 통과공정 = 1P-31-83-A2, 포장방법 = P02
                고객사 = 320104, 품명 = L, 용도 = 벽체재 | 상도 도막두께 ≥ 20
                """, null, false);
        batch("confirm", "320104-L01,320104-L02,320104-L03");
        batch("send", "320104-L03");

        QualitySpecRunRequest req = new QualitySpecRunRequest();
        req.setOrdNo("D260831027-010");
        Map<String, Object> out = service.run(req);

        assertThat((List<Map<String, Object>>) out.get("matches")).extracting(m -> m.get("specNo") + ":" + m.get("verdict"))
                .containsExactly("320104-L01:NO_MATCH", "320104-L02:APPLIED", "320104-L03:APPLIED", "320104-L04:EXCLUDED");
        Map<String, Object> l01 = ((List<Map<String, Object>>) out.get("matches")).get(0);
        assertThat((List<Map<String, Object>>) l01.get("conds")).filteredOn(c -> "RAW_THK".equals(c.get("attrCd")))
                .singleElement().satisfies(c -> {
                    assertThat(c.get("orderVal")).isEqualTo("0.8");
                    assertThat(c.get("pass")).isEqualTo(false);
                });

        List<Map<String, Object>> design = (List<Map<String, Object>>) out.get("design");
        assertThat(design).extracting(d -> d.get("attrCd") + "=" + d.get("finalVal"))
                .containsExactly("RAW_MTRL=H32", "CCL_BOM=S00001", "PROC_CD=1P-31-83-A2", "TOP_THK=18", "GLOSS=40",
                        "POST_TRT=없음", "PACK_CD=P02", "TEST_CD=표준검사");
        assertThat(design).filteredOn(d -> "PROC_CD".equals(d.get("attrCd"))).singleElement().satisfies(d -> {
            assertThat(d.get("baseVal")).isEqualTo("1P-31-81-A1");
            assertThat(d.get("overridden")).isEqualTo(true);
            assertThat((List<String>) d.get("sources")).containsExactly("320104-L02", "320104-L03");
        });
        assertThat((List<Map<String, Object>>) out.get("conflicts")).singleElement().satisfies(c -> {
            assertThat(c.get("attrNm")).isEqualTo("통과공정");
            assertThat(c.get("chain")).isEqualTo("1P-31-81-A1 → 1P-31-83-A2");
        });
        assertThat((String) out.get("payload")).contains("\"IF_ID\" : \"OMS_MESQ_ORD_001\"", "\"RAW_WID\" : \"1224\"");
        assertThat(((Map<String, Object>) out.get("order")).get("cusNm")).isEqualTo("수요가 B");
    }

    @Test
    @DisplayName("주문 적용: 직접 입력한 주문도 계산하고, 사양이 없으면 표준 기준값만 쓴다")
    void runAdHocOrder() {
        QualitySpecRunRequest req = new QualitySpecRunRequest();
        req.setCusCd("205202");
        req.setPrdNmCd("W");
        req.setAttrsJson("{\"RAW_THK\":0.55,\"RAW_WID\":\"938\"}");
        Map<String, Object> out = service.run(req);

        assertThat((List<?>) out.get("matches")).isEmpty();
        assertThat((List<Map<String, Object>>) out.get("design")).allSatisfy(d -> assertThat(d.get("overridden")).isEqualTo(false));
        assertThat(((Map<String, Map<String, String>>) out.get("order")).get("attrs")).containsEntry("RAW_THK", "0.55");

        req.setAttrsJson("not json");
        assertThatThrownBy(() -> service.run(req)).hasMessageContaining("JSON");
    }
}
