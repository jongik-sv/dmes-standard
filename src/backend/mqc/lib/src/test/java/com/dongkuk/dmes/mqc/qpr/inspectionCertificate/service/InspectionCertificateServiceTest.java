package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCert;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcCertOverride;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcForm;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcHistory;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcImage;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcIssue;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.domain.MtcRule;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.dto.InspectionCertificateRequest;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcCertOverrideRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcCertRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcFormRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcHistoryRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcImageRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcIssueRepository;
import com.dongkuk.dmes.mqc.qpr.inspectionCertificate.repository.MtcRuleRepository;
import java.time.Clock;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class InspectionCertificateServiceTest {

    static final Clock CLOCK = Clock.fixed(ZonedDateTime.of(2026, 11, 25, 10, 0, 0, 0, ZoneId.of("Asia/Seoul")).toInstant(),
            ZoneId.of("Asia/Seoul"));
    static final String CODE = "[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}";

    MtcFormRepository forms;
    MtcRuleRepository rules;
    MtcCertRepository certs;
    MtcCertOverrideRepository ovrs;
    MtcImageRepository imgs;
    MtcIssueRepository issues;
    MtcHistoryRepository hist;

    @BeforeEach
    void setUp() {
        forms = MtcMemoryRepos.of(MtcFormRepository.class, o -> ((MtcForm) o).getFormKey());
        rules = MtcMemoryRepos.of(MtcRuleRepository.class, o -> ((MtcRule) o).getRuleId());
        certs = MtcMemoryRepos.of(MtcCertRepository.class, o -> ((MtcCert) o).getCertId());
        ovrs = MtcMemoryRepos.of(MtcCertOverrideRepository.class, o -> ((MtcCertOverride) o).getCertId());
        imgs = MtcMemoryRepos.of(MtcImageRepository.class, o -> ((MtcImage) o).getImgNm());
        issues = MtcMemoryRepos.of(MtcIssueRepository.class, o -> ((MtcIssue) o).getCertId());
        hist = MtcMemoryRepos.of(MtcHistoryRepository.class, o -> ((MtcHistory) o).getHistNo());
    }

    private InspectionCertificateService service(String seedPath) {
        return new InspectionCertificateService(forms, rules, certs, ovrs, imgs, issues, hist, new MtcSeedSource(seedPath), CLOCK);
    }

    private InspectionCertificateService seeded() {
        InspectionCertificateService s = service("mqc/mtc/seed-fixture.json");
        s.search(new InspectionCertificateRequest());
        return s;
    }

    private static InspectionCertificateRequest req() {
        return new InspectionCertificateRequest();
    }

    private static InspectionCertificateRequest save(String kind, String key, String json, String act) {
        InspectionCertificateRequest r = req();
        r.setKind(kind);
        r.setKey(key);
        r.setJson(json);
        r.setAct(act);
        return r;
    }

    private static InspectionCertificateRequest cert(String certId, String snap, String reason) {
        InspectionCertificateRequest r = req();
        r.setCertId(certId);
        r.setSnap(snap);
        r.setReason(reason);
        return r;
    }

    private static InspectionCertificateRequest confirm(String code, String snap) {
        InspectionCertificateRequest r = req();
        r.setVerifyCode(code);
        r.setSnap(snap);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    @Test
    @DisplayName("search: 비어 있으면 시드를 넣고, 발행본은 발행 번호 내림차순·진위 확인 번호와 해시를 싣는다. 두 번째 조회는 다시 넣지 않는다")
    void searchSeedsOnce() {
        InspectionCertificateService s = service("mqc/mtc/seed-fixture.json");
        Map<String, Object> out = s.search(req());

        assertThat(list(out, "forms")).extracting(m -> m.get("key")).containsExactly("en", "ko");
        assertThat(list(out, "rules")).extracting(m -> m.get("key")).containsExactly("R1", "R2");
        assertThat(list(out, "certs").get(0)).containsKeys("key", "json", "updatedAt", "updatedBy");
        assertThat(list(out, "ovrs")).hasSize(1);
        assertThat(list(out, "imgs")).hasSize(1);
        List<Map<String, Object>> issued = list(out, "issued");
        assertThat(issued).extracting(m -> m.get("issueNo")).containsExactly(3, 2);
        assertThat(issued.get(0)).containsEntry("certId", "C2").containsEntry("mtcNo", "UC1-2-261101-002")
                .containsEntry("issuedAt", "2026-11-01T08:17:00").containsEntry("reissueCnt", 0);
        assertThat((String) issued.get(0).get("verifyCode")).matches(CODE);
        assertThat((String) issued.get(0).get("docHash")).hasSize(64)
                .isEqualTo(InspectionCertificateService.docHash((String) issued.get(0).get("snap")));
        assertThat(list(out, "hist")).extracting(m -> m.get("docNo")).containsExactly("UC1-2-261101-002", "UC1-1-261101-001");
        assertThat(list(out, "hist").get(0)).containsEntry("act", "AUTO_ISSUE").containsEntry("by", "system");
        MtcForm ko = forms.findById("ko").orElseThrow();
        assertThat(ko.getAplyVer()).isEqualTo(1);
        assertThat(ko.getPendYn()).isTrue();

        s.search(req());
        assertThat(certs.count()).isEqualTo(2);
        assertThat(hist.count()).isEqualTo(2);
    }

    @Test
    @DisplayName("search: 시드 파일이 없으면 빈 결과다")
    void searchWithoutSeed() {
        Map<String, Object> out = service("mqc/mtc/no-such-seed.json").search(req());
        assertThat(list(out, "forms")).isEmpty();
        assertThat(list(out, "issued")).isEmpty();
        assertThat(list(out, "hist")).isEmpty();
    }

    @Test
    @DisplayName("save: 있으면 교체(목록 순서 유지)·없으면 끝에 추가·빈 json 은 삭제, 서버가 읽는 칼럼을 뽑고 이력 1행을 남긴다")
    void saveUpsertDelete() {
        InspectionCertificateService s = seeded();
        Map<String, Object> r = s.save(save("RULE", "R1", "{\"code\":\"V-44\",\"name\":\"바뀐 이름\",\"st\":\"OFF\",\"prio\":5}", "RULE_SAVE"));
        assertThat(r).containsEntry("key", "R1").containsEntry("updatedAt", "2026-11-25T10:00:00");
        MtcRule r1 = rules.findById("R1").orElseThrow();
        assertThat(r1.getSortSeq()).isEqualTo(1);
        assertThat(r1.getRuleNm()).isEqualTo("바뀐 이름");
        assertThat(r1.getStatCd()).isEqualTo("OFF");
        assertThat(r1.getPrio()).isEqualTo(5);

        s.save(save("RULE", "R3", "{\"code\":\"D-12\",\"st\":\"DRAFT\"}", null));
        assertThat(rules.findById("R3").orElseThrow().getSortSeq()).isEqualTo(3);

        InspectionCertificateRequest ovr = save("OVR", "C1", "{\"remark\":[]}", "OVR_SAVE");
        ovr.setReason("고객 요청");
        s.save(ovr);
        s.save(save("IMG", "Z_MTC_SIGN_20251229.png", "", "IMG_DELETE"));
        assertThat(imgs.existsById("Z_MTC_SIGN_20251229.png")).isFalse();

        List<Map<String, Object>> h = list(s.search(req()), "hist");
        assertThat(h).extracting(m -> m.get("act")).startsWith("IMG_DELETE", "OVR_SAVE", "RULE_SAVE", "RULE_SAVE");
        assertThat(h.get(1)).containsEntry("docNo", "UC1-1-261101-001").containsEntry("reason", "고객 요청").containsEntry("kind", "OVR");
    }

    @Test
    @DisplayName("save: 종류·JSON·act 형식을 검사하고, 발행된 증명서 원천은 지우지 않는다")
    void saveValidation() {
        InspectionCertificateService s = seeded();
        assertThatThrownBy(() -> s.save(save("XXX", "k", "{}", null))).isInstanceOf(BusinessException.class).hasMessageContaining("종류");
        assertThatThrownBy(() -> s.save(save("FORM", "en", "not json", null))).isInstanceOf(BusinessException.class).hasMessageContaining("JSON");
        assertThatThrownBy(() -> s.save(save("FORM", "en", "[1]", null))).isInstanceOf(BusinessException.class).hasMessageContaining("객체");
        assertThatThrownBy(() -> s.save(save("FORM", "en", "{}", "bad act"))).isInstanceOf(BusinessException.class).hasMessageContaining("act");
        assertThatThrownBy(() -> s.save(save("CERT", "C1", "", null))).isInstanceOf(BusinessException.class).hasMessageContaining("지울 수 없습니다");
    }

    @Test
    @DisplayName("reg: 원천을 복제해 N001·N002 와 오늘 날짜 증명서번호로 저장하고 RECEIVE 이력을 남긴다")
    void regNumbering() {
        InspectionCertificateService s = seeded();
        InspectionCertificateRequest r = req();
        r.setSourceCertId("C1");
        Map<String, Object> first = s.reg(r);
        assertThat(first).containsEntry("certId", "N001");
        assertThat((String) first.get("json")).contains("\"mtc\":\"UC1-1-261125-001\"").contains("\"cust\":\"IN-1001\"");
        assertThat(certs.findById("N001").orElseThrow().getMtcNo()).isEqualTo("UC1-1-261125-001");

        r.setSourceCertId("C2");
        Map<String, Object> second = s.reg(r);
        assertThat(second).containsEntry("certId", "N002");
        assertThat(certs.findById("N002").orElseThrow().getMtcNo()).isEqualTo("UC1-2-261125-002");
        assertThat(list(s.search(req()), "hist").get(0)).containsEntry("act", "RECEIVE").containsEntry("docNo", "UC1-2-261125-002");

        r.setSourceCertId("C9");
        assertThatThrownBy(() -> s.reg(r)).isInstanceOf(BusinessException.class).hasMessageContaining("찾을 수 없습니다");
    }

    @Test
    @DisplayName("issue: 발행 번호는 기존 최대 + 1, 이미 발행된 증명서는 거부한다")
    void issueRules() {
        InspectionCertificateService s = seeded();
        InspectionCertificateRequest r = req();
        r.setSourceCertId("C1");
        s.reg(r);

        Map<String, Object> out = s.issue(cert("N001", "{\"fname\":\"수출 영문\"}", null));
        assertThat(out).containsEntry("certId", "N001").containsEntry("issueNo", 4).containsEntry("issuedAt", "2026-11-25T10:00:00");
        assertThat((String) out.get("verifyCode")).matches(CODE);
        assertThat(out.get("docHash")).isEqualTo(InspectionCertificateService.docHash("{\"fname\":\"수출 영문\"}"));
        assertThat(issues.findById("N001").orElseThrow().getMtcNo()).isEqualTo("UC1-1-261125-001");

        assertThatThrownBy(() -> s.issue(cert("C1", "{}", null))).isInstanceOf(BusinessException.class)
                .hasMessage(InspectionCertificateService.MSG_ALREADY_ISSUED);
        assertThatThrownBy(() -> s.issue(cert("N001", "", null))).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("reissue: 단건 수정이 있으면 사유가 있어야 하고, 발행본·진위 확인 번호를 바꾸며 횟수를 올린다")
    void reissueRules() {
        InspectionCertificateService s = seeded();
        assertThatThrownBy(() -> s.reissue(cert("C2", "{\"fver\":2}", " "))).isInstanceOf(BusinessException.class)
                .hasMessage(InspectionCertificateService.MSG_REASON_REQUIRED);
        String before = issues.findById("C2").orElseThrow().getVrfyCd();

        Map<String, Object> out = s.reissue(cert("C2", "{\"fver\":2}", "고객 요청 — P/O 추가"));
        assertThat(out).containsEntry("certId", "C2").containsEntry("reissueCnt", 1).containsEntry("issuedAt", "2026-11-25T10:00:00");
        assertThat(out.get("verifyCode")).isNotEqualTo(before);
        MtcIssue i = issues.findById("C2").orElseThrow();
        assertThat(i.getSnapJson()).isEqualTo("{\"fver\":2}");
        assertThat(i.getRissuRsn()).isEqualTo("고객 요청 — P/O 추가");
        assertThat(i.getIssueNo()).isEqualTo(3);

        assertThat(s.reissue(cert("C1", "{\"fver\":3}", null))).containsEntry("reissueCnt", 1);
        assertThatThrownBy(() -> s.reissue(cert("C9", "{}", null))).isInstanceOf(BusinessException.class).hasMessageContaining("발행되지 않은");
    }

    @Test
    @DisplayName("confirm: 현재 번호는 GENUINE, snap 해시가 다르면 TAMPERED, 재발행 전 번호는 SUPERSEDED, 없으면 NOT_FOUND. VERIFY 이력을 남긴다")
    void confirmStatuses() {
        InspectionCertificateService s = seeded();
        MtcIssue c1 = issues.findById("C1").orElseThrow();
        String code = c1.getVrfyCd();
        String snap = c1.getSnapJson();

        assertThat(s.confirm(confirm(code.toLowerCase(), null))).containsEntry("status", "GENUINE").containsEntry("mtcNo", "UC1-1-261101-001")
                .containsEntry("issueNo", 2).containsEntry("docHash", c1.getDocHash());
        assertThat(s.confirm(confirm(code, snap))).containsEntry("status", "GENUINE");
        assertThat(s.confirm(confirm(code, snap.replace("3", "4")))).containsEntry("status", "TAMPERED");

        s.reissue(cert("C1", "{\"fver\":4}", null));
        Map<String, Object> old = s.confirm(confirm(code, null));
        assertThat(old).containsEntry("status", "SUPERSEDED").containsEntry("mtcNo", "UC1-1-261101-001").containsEntry("reissueCnt", 1);
        assertThat(s.confirm(confirm(issues.findById("C1").orElseThrow().getVrfyCd(), null))).containsEntry("status", "GENUINE");
        assertThat(s.confirm(confirm("AAAA-BBBB-CCCC", null))).containsEntry("status", "NOT_FOUND").containsEntry("mtcNo", null);

        assertThat(list(s.search(req()), "hist").get(0)).containsEntry("act", "VERIFY");
    }

    @Test
    @DisplayName("reset: 저장값과 이력을 모두 지우고 시드를 다시 넣은 뒤 RESET 이력을 남긴다")
    void resetRestoresSeed() {
        InspectionCertificateService s = seeded();
        InspectionCertificateRequest r = req();
        r.setSourceCertId("C1");
        s.reg(r);
        s.issue(cert("N001", "{}", null));
        s.save(save("RULE", "R1", "", "RULE_DELETE"));

        assertThat(s.reset(req())).containsEntry("ok", true);
        Map<String, Object> out = s.search(req());
        assertThat(list(out, "certs")).extracting(m -> m.get("key")).containsExactly("C1", "C2");
        assertThat(list(out, "rules")).extracting(m -> m.get("key")).containsExactly("R1", "R2");
        assertThat(list(out, "issued")).extracting(m -> m.get("issueNo")).containsExactly(3, 2);
        assertThat(list(out, "hist")).extracting(m -> m.get("act")).containsExactly("RESET", "AUTO_ISSUE", "AUTO_ISSUE");
    }

    @Test
    @DisplayName("실제 시드(mqc/mtc/seed.json)가 있으면 그대로 들어가고 발행본마다 서로 다른 진위 확인 번호를 갖는다")
    void realSeedLoads() {
        Assumptions.assumeTrue(new ClassPathResource(MtcSeedSource.DEFAULT_PATH).exists(), "seed.json 없음");
        Map<String, Object> out = service(MtcSeedSource.DEFAULT_PATH).search(req());
        List<Map<String, Object>> issued = list(out, "issued");
        assertThat(issued).isNotEmpty();
        assertThat(issued).extracting(m -> m.get("verifyCode")).doesNotHaveDuplicates().allMatch(c -> ((String) c).matches(CODE));
        assertThat(issued).allMatch(m -> m.get("mtcNo") != null);
        assertThat(list(out, "forms")).isNotEmpty();
    }

    @Test
    @DisplayName("진위 확인 번호는 해시·발행 번호·재발행 횟수가 같으면 같고, 하나라도 다르면 바뀐다")
    void verifyCodeDerivation() {
        String h = InspectionCertificateService.docHash("{}");
        assertThat(InspectionCertificateService.verifyCode(h, 1, 0)).matches(CODE).isEqualTo(InspectionCertificateService.verifyCode(h, 1, 0));
        assertThat(InspectionCertificateService.verifyCode(h, 1, 1)).isNotEqualTo(InspectionCertificateService.verifyCode(h, 1, 0));
        assertThat(InspectionCertificateService.verifyCode(h, 2, 0)).isNotEqualTo(InspectionCertificateService.verifyCode(h, 1, 0));
    }
}
