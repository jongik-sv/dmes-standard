package com.dongkuk.dmes.mcm.widget.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.admin.dto.CommWidgetMngRequest;
import com.dongkuk.dmes.mcm.widget.admin.dto.WidgetDefSaveRequest;
import com.dongkuk.dmes.mcm.widget.admin.repository.WidgetUsageRepository;
import com.dongkuk.dmes.mcm.widget.admin.service.CommWidgetMngService;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryResult;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

/** {@link CommWidgetMngService} — 정의 저장 검사(§5.3)·ID 생성·삭제 거절·이벤트·미리보기 위임. */
@ExtendWith(MockitoExtension.class)
class CommWidgetMngServiceTest {

    @Mock WidgetDefRepository defRepository;
    @Mock WidgetUsageRepository usageRepository;
    @Mock WidgetQueryRunner queryRunner;
    @Mock ApplicationEventPublisher eventPublisher;

    @InjectMocks CommWidgetMngService service;

    private static WidgetDefSaveRequest defReq(String typeId, String configJson) {
        WidgetDefSaveRequest r = new WidgetDefSaveRequest();
        r.setSrcTp("D");
        r.setTypeId(typeId);
        r.setTitle("새 위젯");
        r.setDefW(8);
        r.setDefH(6);
        r.setUseYn("Y");
        r.setConfigJson(configJson);
        return r;
    }

    private static WidgetDefSaveRequest codeReq(String widgetId) {
        WidgetDefSaveRequest r = new WidgetDefSaveRequest();
        r.setSrcTp("C");
        r.setWidgetId(widgetId);
        return r;
    }

    private static WidgetDef row(String widgetId, String srcTp) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(widgetId);
        d.setSrcTp(srcTp);
        d.setTitle("기존");
        d.setUseYn("Y");
        return d;
    }

    private static CommWidgetMngRequest idReq(String widgetId) {
        CommWidgetMngRequest r = new CommWidgetMngRequest();
        r.setWidgetId(widgetId);
        return r;
    }

    private WidgetDef savedRow() {
        ArgumentCaptor<WidgetDef> captor = ArgumentCaptor.forClass(WidgetDef.class);
        verify(defRepository).save(captor.capture());
        return captor.getValue();
    }

    private void assertRejected(WidgetDefSaveRequest request, String messagePart) {
        assertThatThrownBy(() -> service.save(request))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining(messagePart);
        verify(defRepository, never()).save(any());
        verifyNoInteractions(eventPublisher);
    }

    // ── save: ID·구분 ────────────────────────────────────────────────

    @Test
    @DisplayName("신규 정의 위젯은 def.{소문자1+소문자·숫자7} ID 를 만들고, 이미 있는 ID 면 다시 만든다")
    void newDefinitionIdRetriesOnDuplicate() {
        when(defRepository.existsById(anyString())).thenReturn(true, false);

        Map<String, Object> result = service.save(defReq("markdown", "{\"markdown\":\"# 안녕\"}"));

        verify(defRepository, times(2)).existsById(anyString());
        WidgetDef saved = savedRow();
        assertThat(saved.getWidgetId()).matches("^def\\.[a-z][a-z0-9]{7}$");
        assertThat(saved.getSrcTp()).isEqualTo("D");
        assertThat(saved.getTypeId()).isEqualTo("markdown");
        assertThat(saved.getConfigJson()).isEqualTo("{\"markdown\":\"# 안녕\"}");
        assertThat(saved.getDataSrc()).isNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> def = (Map<String, Object>) result.get("def");
        assertThat(def).containsEntry("widgetId", saved.getWidgetId()).containsEntry("configJson", "{\"markdown\":\"# 안녕\"}");
        verify(eventPublisher).publishEvent(new WidgetDefSavedEvent(saved.getWidgetId()));
    }

    @Test
    @DisplayName("ID 를 10번 만들어도 모두 겹치면 DUPLICATE_DATA")
    void idGenerationGivesUp() {
        when(defRepository.existsById(anyString())).thenReturn(true);

        assertThatThrownBy(() -> service.save(defReq("markdown", "{}")))
                .isInstanceOfSatisfying(BusinessException.class,
                        e -> assertThat(e.getErrorCode()).isEqualTo(ErrorCode.DUPLICATE_DATA));
        verify(defRepository, never()).save(any());
    }

    @Test
    @DisplayName("기존 정의 위젯 수정은 같은 ID 로 저장하고 ID 를 새로 만들지 않는다")
    void updateDefinitionKeepsId() {
        WidgetDef existing = row("def.k3x9q2ab", "D");
        when(defRepository.findById("def.k3x9q2ab")).thenReturn(Optional.of(existing));
        WidgetDefSaveRequest r = defReq("markdown", "{\"markdown\":\"바뀜\"}");
        r.setWidgetId("def.k3x9q2ab");
        r.setUseYn("N");

        service.save(r);

        verify(defRepository, never()).existsById(anyString());
        WidgetDef saved = savedRow();
        assertThat(saved).isSameAs(existing);
        assertThat(saved.getConfigJson()).isEqualTo("{\"markdown\":\"바뀜\"}");
        assertThat(saved.getUseYn()).isEqualTo("N");
        verify(eventPublisher).publishEvent(new WidgetDefSavedEvent("def.k3x9q2ab"));
    }

    @Test
    @DisplayName("코드 위젯 덮어쓰기는 typeId·dataSrc·configJson 을 줘도 NULL 로 저장하고, 빈 칸은 NULL·사용 여부 NULL 은 Y")
    void codeOverrideNullsDefinitionFields() {
        when(defRepository.findById("home.notice")).thenReturn(Optional.empty());
        WidgetDefSaveRequest r = codeReq("home.notice");
        r.setTypeId("markdown");
        r.setDataSrc("mcm");
        r.setConfigJson("{\"markdown\":\"x\"}");
        r.setTitle("사내 공지");
        r.setSubtitle("");
        r.setDefW(10);

        service.save(r);

        WidgetDef saved = savedRow();
        assertThat(saved.getWidgetId()).isEqualTo("home.notice");
        assertThat(saved.getSrcTp()).isEqualTo("C");
        assertThat(saved.getTypeId()).isNull();
        assertThat(saved.getDataSrc()).isNull();
        assertThat(saved.getConfigJson()).isNull();
        assertThat(saved.getTitle()).isEqualTo("사내 공지");
        assertThat(saved.getSubtitle()).isNull();
        assertThat(saved.getDefW()).isEqualTo(10);
        assertThat(saved.getUseYn()).isEqualTo("Y");
        verify(eventPublisher).publishEvent(new WidgetDefSavedEvent("home.notice"));
    }

    @Test
    @DisplayName("코드 위젯 덮어쓰기의 빈 이름은 NULL(코드 값 사용)로 저장한다")
    void codeOverrideBlankTitleIsNull() {
        when(defRepository.findById("home.notice")).thenReturn(Optional.of(row("home.notice", "C")));
        WidgetDefSaveRequest r = codeReq("home.notice");
        r.setTitle("  ");
        r.setUseYn("N");

        service.save(r);

        WidgetDef saved = savedRow();
        assertThat(saved.getTitle()).isNull();
        assertThat(saved.getUseYn()).isEqualTo("N");
    }

    @Test
    @DisplayName("코드 위젯 ID 형식이 아니거나 def. 로 시작하면 거절")
    void codeIdFormat() {
        assertRejected(codeReq("def.k3x9q2ab"), "코드 위젯 ID");
        assertRejected(codeReq("Home Notice"), "코드 위젯 ID");
        assertRejected(codeReq(null), "코드 위젯 ID");
    }

    @Test
    @DisplayName("코드 위젯 행을 정의 위젯으로 바꾸는 저장은 거절")
    void codeToDefinitionRejected() {
        when(defRepository.findById("home.notice")).thenReturn(Optional.of(row("home.notice", "C")));
        WidgetDefSaveRequest r = defReq("markdown", "{}");
        r.setWidgetId("home.notice");

        assertRejected(r, "정의 위젯으로 바꿀 수 없습니다");
    }

    @Test
    @DisplayName("없는 정의 위젯 ID 로 수정하면 거절")
    void updateMissingDefinitionRejected() {
        when(defRepository.findById("def.zzzzzzzz")).thenReturn(Optional.empty());
        WidgetDefSaveRequest r = defReq("markdown", "{}");
        r.setWidgetId("def.zzzzzzzz");

        assertRejected(r, "위젯 정의를 찾을 수 없습니다");
    }

    @Test
    @DisplayName("구분은 C·D 만, 정의 위젯 이름은 필수·50자 이하, 유형 ID 형식")
    void commonFieldRules() {
        WidgetDefSaveRequest badSrc = defReq("markdown", "{}");
        badSrc.setSrcTp("X");
        assertRejected(badSrc, "구분");
        WidgetDefSaveRequest noTitle = defReq("markdown", "{}");
        noTitle.setTitle(" ");
        assertRejected(noTitle, "이름");
        WidgetDefSaveRequest longTitle = defReq("markdown", "{}");
        longTitle.setTitle("가".repeat(51));
        assertRejected(longTitle, "이름");
        assertRejected(defReq("Query_Table", "{}"), "유형");
        assertRejected(defReq(null, "{}"), "유형");
        WidgetDefSaveRequest badYn = defReq("markdown", "{}");
        badYn.setMultipleYn("X");
        assertRejected(badYn, "Y 또는 N");
        WidgetDefSaveRequest longDesc = defReq("markdown", "{}");
        longDesc.setDescription("가".repeat(401));
        assertRejected(longDesc, "설명");
    }

    @Test
    @DisplayName("분류(categoryCd)는 저장되고(공백 → NULL), 20자 이하만 허용")
    void categoryCdRules() {
        // 거절 검사를 먼저 — assertRejected 는 save 가 한 번도 없었음을 본다.
        WidgetDefSaveRequest longCd = defReq("markdown", "{}");
        longCd.setCategoryCd("C".repeat(21));
        assertRejected(longCd, "분류");

        when(defRepository.existsById(anyString())).thenReturn(false);
        WidgetDefSaveRequest r = defReq("markdown", "{}");
        r.setCategoryCd(" PROD ");
        @SuppressWarnings("unchecked")
        Map<String, Object> saved = (Map<String, Object>) service.save(r).get("def");
        assertThat(saved).containsEntry("categoryCd", "PROD");

        WidgetDefSaveRequest blank = defReq("markdown", "{}");
        blank.setCategoryCd(" ");
        @SuppressWarnings("unchecked")
        Map<String, Object> savedBlank = (Map<String, Object>) service.save(blank).get("def");
        assertThat(savedBlank).containsEntry("categoryCd", null);
    }

    @Test
    @DisplayName("비공개(privateYn)는 Y·N 만, 비우면 NULL 로 저장된다")
    void privateYnRules() {
        WidgetDefSaveRequest bad = defReq("markdown", "{}");
        bad.setPrivateYn("X");
        assertRejected(bad, "비공개");

        when(defRepository.existsById(anyString())).thenReturn(false);
        WidgetDefSaveRequest r = defReq("markdown", "{}");
        r.setPrivateYn("Y");
        @SuppressWarnings("unchecked")
        Map<String, Object> saved = (Map<String, Object>) service.save(r).get("def");
        assertThat(saved).containsEntry("privateYn", "Y");

        WidgetDefSaveRequest blank = defReq("markdown", "{}");
        blank.setPrivateYn(" ");
        @SuppressWarnings("unchecked")
        Map<String, Object> savedBlank = (Map<String, Object>) service.save(blank).get("def");
        assertThat(savedBlank).containsEntry("privateYn", null);
    }

    @Test
    @DisplayName("배치(placeTp)는 W·B·A 만, 비우면 NULL(유형 floatable 을 따름)로 저장된다")
    void placeTpRules() {
        WidgetDefSaveRequest bad = defReq("markdown", "{}");
        bad.setPlaceTp("X");
        assertRejected(bad, "배치");

        when(defRepository.existsById(anyString())).thenReturn(false);
        for (String tp : new String[] {"W", "B", "A"}) {
            WidgetDefSaveRequest r = defReq("markdown", "{}");
            r.setPlaceTp(" " + tp + " ");
            @SuppressWarnings("unchecked")
            Map<String, Object> saved = (Map<String, Object>) service.save(r).get("def");
            assertThat(saved).containsEntry("placeTp", tp);
        }

        WidgetDefSaveRequest blank = defReq("markdown", "{}");
        blank.setPlaceTp(" ");
        @SuppressWarnings("unchecked")
        Map<String, Object> savedBlank = (Map<String, Object>) service.save(blank).get("def");
        assertThat(savedBlank).containsEntry("placeTp", null);
    }

    // ── save: 크기·새로 고침 ─────────────────────────────────────────

    @Test
    @DisplayName("크기는 1 이상, 같은 축 MIN ≤ DEF ≤ MAX, DEF_W ≤ 24")
    void sizeRules() {
        WidgetDefSaveRequest minOverDef = defReq("markdown", "{}");
        minOverDef.setMinW(10);
        minOverDef.setDefW(6);
        assertRejected(minOverDef, "폭");
        WidgetDefSaveRequest defOverMax = defReq("markdown", "{}");
        defOverMax.setDefH(10);
        defOverMax.setMaxH(8);
        assertRejected(defOverMax, "높이");
        WidgetDefSaveRequest wide = defReq("markdown", "{}");
        wide.setDefW(25);
        assertRejected(wide, "24");
        WidgetDefSaveRequest zero = defReq("markdown", "{}");
        zero.setMinH(0);
        assertRejected(zero, "1 이상");
    }

    @Test
    @DisplayName("새로 고침 주기는 NULL 또는 600~86400초 — 10·30·599초는 거절")
    void refreshSecRule() {
        WidgetDefSaveRequest r = defReq("markdown", "{}");
        r.setRefreshSec(10);
        assertRejected(r, "새로 고침");
        WidgetDefSaveRequest thirty = defReq("markdown", "{}");
        thirty.setRefreshSec(30);
        assertRejected(thirty, "새로 고침");
        WidgetDefSaveRequest justBelow = defReq("markdown", "{}");
        justBelow.setRefreshSec(599);
        assertRejected(justBelow, "새로 고침");
        WidgetDefSaveRequest tooLong = defReq("markdown", "{}");
        tooLong.setRefreshSec(86401);
        assertRejected(tooLong, "새로 고침");
    }

    // ── save: 정의 설정·유형별 ────────────────────────────────────────

    @Test
    @DisplayName("정의 설정은 JSON 객체이고 200KB 이하")
    void configJsonRules() {
        assertRejected(defReq("markdown", "{broken"), "JSON 객체");
        assertRejected(defReq("markdown", "[1,2]"), "JSON 객체");
        assertRejected(defReq("markdown", "{\"markdown\":\"x\"} junk"), "JSON 객체");
        assertRejected(defReq("markdown", "{\"markdown\":\"x\"}{}"), "JSON 객체");
        assertRejected(defReq("markdown", "{\"markdown\":\"" + "a".repeat(200 * 1024) + "\"}"), "200KB");
    }

    @Test
    @DisplayName("쿼리 유형의 dataSrc 가 mcm 이 아니면(mls) 「아직 지원하지 않는 모듈입니다」, SQL 검사도 하지 않는다")
    void queryDataSrcOnlyMcm() {
        WidgetDefSaveRequest r = defReq("query-table", "{\"sql\":\"select 1\"}");
        r.setDataSrc("mls");

        assertRejected(r, "아직 지원하지 않는 모듈입니다");
        verify(queryRunner, never()).validateSql(anyString());
    }

    @Test
    @DisplayName("쿼리 유형 저장은 config.sql 을 queryRunner.validateSql 로 검사하고 dataSrc 를 저장한다")
    void querySaveValidatesSql() {
        when(defRepository.existsById(anyString())).thenReturn(false);
        WidgetDefSaveRequest r = defReq("query-chart", "{\"sql\":\"select a, b from t where u = :userId\",\"chartType\":\"bar\"}");
        r.setDataSrc("mcm");

        service.save(r);

        verify(queryRunner).validateSql("select a, b from t where u = :userId");
        assertThat(savedRow().getDataSrc()).isEqualTo("mcm");
    }

    @Test
    @DisplayName("입력 조건이 있으면 선언 이름을 넘겨 검사하고, 선언한 조건이 SQL 에 쓰이면 저장한다")
    void querySaveWithParams() {
        when(defRepository.existsById(anyString())).thenReturn(false);
        String sql = "select a from t where plant = :plant and dt >= :from_dt";
        when(queryRunner.validateSql(sql, Set.of("plant", "from_dt"), Set.of())).thenReturn(List.of("plant", "from_dt"));
        WidgetDefSaveRequest r = defReq("query-table", "{\"sql\":\"" + sql + "\",\"params\":["
                + "{\"name\":\"plant\",\"type\":\"select\",\"options\":[{\"value\":\"P1\"}],\"default\":\"P1\"},"
                + "{\"name\":\"from_dt\",\"type\":\"date\",\"label\":\"시작일\",\"required\":true,\"default\":\"2026-10-01\"}]}");
        r.setDataSrc("mcm");

        service.save(r);

        verify(queryRunner).validateSql(sql, Set.of("plant", "from_dt"), Set.of());
        verify(queryRunner, never()).validateSql(anyString());
    }

    @Test
    @DisplayName("선언했지만 SQL 에 없는 조건은 거절한다")
    void queryUnusedParamRejected() {
        String sql = "select a from t where plant = :plant";
        when(queryRunner.validateSql(sql, Set.of("plant", "extra"), Set.of())).thenReturn(List.of("plant"));
        WidgetDefSaveRequest r = defReq("query-table", "{\"sql\":\"" + sql + "\",\"params\":["
                + "{\"name\":\"plant\",\"type\":\"text\"},{\"name\":\"extra\",\"type\":\"text\"}]}");
        r.setDataSrc("mcm");

        assertRejected(r, "조건 :extra 는 SQL 에서 쓰이지 않습니다");
    }

    @Test
    @DisplayName("params 모양 위반은 SQL 검사 전에 거절한다 — 이름 형식·시스템 이름·중복·형·개수·default·select options")
    void queryParamShapeRejected() {
        String head = "{\"sql\":\"select 1\",\"params\":";
        assertRejected(queryReq(head + "{\"name\":\"a\"}}"), "배열");
        assertRejected(queryReq(head + "[{\"name\":\"1bad\",\"type\":\"text\"}]}"), "이름은 영문자로 시작");
        assertRejected(queryReq(head + "[{\"name\":\"a.b\",\"type\":\"text\"}]}"), "이름은 영문자로 시작");
        assertRejected(queryReq(head + "[{\"name\":\"" + "a".repeat(31) + "\",\"type\":\"text\"}]}"), "30자 이하");
        assertRejected(queryReq(head + "[{\"name\":\"userId\",\"type\":\"text\"}]}"), "시스템 변수 이름");
        assertRejected(queryReq(head + "[{\"name\":\"now\",\"type\":\"text\"}]}"), "시스템 변수 이름");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"text\"},{\"name\":\"a\",\"type\":\"number\"}]}"), "겹칩니다");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"bool\"}]}"), "text·number·date·select");
        assertRejected(queryReq(head + "[{\"name\":\"a\"}]}"), "text·number·date·select");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"text\",\"label\":\"" + "가".repeat(51) + "\"}]}"), "50자 이하");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"text\",\"default\":\"" + "x".repeat(201) + "\"}]}"), "200자 이하");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"text\",\"default\":5}]}"), "문자열");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"number\",\"default\":\"abc\"}]}"), "숫자");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"date\",\"default\":\"2026-02-30\"}]}"), "실제 날짜");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"text\",\"required\":\"yes\"}]}"), "true 또는 false");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"select\"}]}"), "선택지");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"select\",\"options\":[]}]}"), "선택지");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"select\",\"options\":[{\"value\":\"x\"},{\"value\":\"x\"}]}]}"), "겹칩니다");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"select\",\"options\":[{\"value\":\"x\"}],\"default\":\"y\"}]}"), "선택지 중 하나");
        assertRejected(queryReq(head + "[{\"name\":\"a\",\"type\":\"select\",\"options\":[{\"value\":\" x\"}]}]}"), "앞뒤에 공백");
        StringBuilder eleven = new StringBuilder(head).append('[');
        for (int i = 0; i < 11; i++) eleven.append(i == 0 ? "" : ",").append("{\"name\":\"p").append(i).append("\",\"type\":\"text\"}");
        assertRejected(queryReq(eleven.append("]}").toString()), "최대 10개");
        verifyNoInteractions(queryRunner);
    }

    private static WidgetDefSaveRequest queryReq(String configJson) {
        WidgetDefSaveRequest r = defReq("query-table", configJson);
        r.setDataSrc("mcm");
        return r;
    }

    @Test
    @DisplayName("SQL 검사가 던지면 저장하지 않고 이벤트도 내지 않는다")
    void querySqlRejectedNotSaved() {
        doThrow(new BusinessException(ErrorCode.INVALID_VALUE, "쓸 수 없는 낱말이 있습니다: UPDATE"))
                .when(queryRunner).validateSql(anyString());
        WidgetDefSaveRequest r = defReq("query-table", "{\"sql\":\"update t set a = 1\"}");
        r.setDataSrc("mcm");

        assertRejected(r, "쓸 수 없는 낱말이 있습니다: UPDATE");
    }

    @Test
    @DisplayName("쿼리 유형에 SQL 이 없으면 거절")
    void querySqlRequired() {
        WidgetDefSaveRequest r = defReq("query-number", "{\"valueField\":\"V\"}");
        r.setDataSrc("mcm");
        assertRejected(r, "SQL");
    }

    @Test
    @DisplayName("웹 주소 유형은 http(s) 절대 주소만 — javascript: 는 거절")
    void webUrlRule() {
        assertRejected(defReq("web", "{\"url\":\"javascript:alert(1)\"}"), "웹 주소");
        assertRejected(defReq("web", "{\"url\":\"/csa/commUserMng\"}"), "웹 주소");
        assertRejected(defReq("web", "{}"), "웹 주소");
    }

    @Test
    @DisplayName("웹 주소 유형의 https 주소는 저장한다")
    void webUrlAccepted() {
        when(defRepository.existsById(anyString())).thenReturn(false);
        service.save(defReq("web", "{\"url\":\"https://www.example.com/path?q=1\"}"));
        assertThat(savedRow().getTypeId()).isEqualTo("web");
    }

    @Test
    @DisplayName("링크 모음: url 은 http(s), page 는 pageId 필수, 그 밖 종류는 거절")
    void linksRule() {
        assertRejected(defReq("links", "{\"items\":[{\"label\":\"a\",\"kind\":\"url\",\"url\":\"javascript:x\"}]}"), "링크 주소");
        assertRejected(defReq("links", "{\"items\":[{\"label\":\"a\",\"kind\":\"page\"}]}"), "pageId");
        assertRejected(defReq("links", "{\"items\":[{\"label\":\"a\",\"kind\":\"file\"}]}"), "종류");
        assertRejected(defReq("links", "{\"items\":{}}"), "items");
    }

    @Test
    @DisplayName("미디어: src 는 media:{32자 16진수} 또는 http(s) — media:../../etc 는 거절")
    void mediaRule() {
        assertRejected(defReq("media", "{\"items\":[{\"kind\":\"image\",\"src\":\"media:../../etc\"}]}"), "미디어");
        assertRejected(defReq("media", "{\"items\":[{\"kind\":\"image\",\"src\":\"file:///etc/passwd\"}]}"), "미디어");
    }

    @Test
    @DisplayName("미디어: 업로드 파일 ID·https 주소는 저장한다")
    void mediaAccepted() {
        when(defRepository.existsById(anyString())).thenReturn(false);
        service.save(defReq("media", "{\"items\":[{\"kind\":\"image\",\"src\":\"media:0123456789abcdef0123456789abcdef\"},"
                + "{\"kind\":\"youtube\",\"src\":\"https://www.youtube.com/watch?v=abc\"}],\"fit\":\"contain\"}"));
        assertThat(savedRow().getTypeId()).isEqualTo("media");
    }

    @Test
    @DisplayName("html 의 allowScript 는 불리언만(없으면 false 로 본다)")
    void htmlAllowScriptRule() {
        assertRejected(defReq("html", "{\"html\":\"<b>x</b>\",\"allowScript\":\"yes\"}"), "allowScript");
    }

    @Test
    @DisplayName("메모(§17.1): scope 는 shared·personal, format 은 text·md·html, content 는 문자열 20,000자 이하")
    void memoConfigRules() {
        assertRejected(defReq("memo", "{\"scope\":\"team\",\"format\":\"text\",\"content\":\"\"}"), "scope");
        assertRejected(defReq("memo", "{\"format\":\"text\",\"content\":\"\"}"), "scope");
        assertRejected(defReq("memo", "{\"scope\":\"shared\",\"format\":\"markdown\",\"content\":\"\"}"), "format");
        assertRejected(defReq("memo", "{\"scope\":\"shared\"}"), "format");
        assertRejected(defReq("memo", "{\"scope\":\"shared\",\"format\":\"md\",\"content\":3}"), "content");
        assertRejected(defReq("memo", "{\"scope\":\"shared\",\"format\":\"md\",\"content\":\"" + "가".repeat(20_001) + "\"}"),
                "20,000자");
    }

    @Test
    @DisplayName("메모: 공용 20,000자·개인 빈 내용은 저장한다")
    void memoConfigAccepted() {
        when(defRepository.existsById(anyString())).thenReturn(false);
        service.save(defReq("memo", "{\"scope\":\"shared\",\"format\":\"html\",\"content\":\"" + "가".repeat(20_000) + "\"}"));
        service.save(defReq("memo", "{\"scope\":\"personal\",\"format\":\"text\",\"content\":\"\"}"));
        verify(defRepository, times(2)).save(any());
    }

    // ── delete ──────────────────────────────────────────────────────

    @Test
    @DisplayName("사용자가 놓은 정의 위젯은 지우지 않는다 — 「사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요」")
    void deleteInUseDefinitionRejected() {
        when(defRepository.findById("def.k3x9q2ab")).thenReturn(Optional.of(row("def.k3x9q2ab", "D")));
        when(usageRepository.countUsers("def.k3x9q2ab")).thenReturn(3L);

        assertThatThrownBy(() -> service.delete(idReq("def.k3x9q2ab")))
                .isInstanceOf(BusinessException.class)
                .hasMessage("사용 중인 위젯은 지울 수 없습니다. 사용 중지하세요");
        verify(defRepository, never()).delete(any());
        verifyNoInteractions(eventPublisher);
    }

    @Test
    @DisplayName("사용자가 없는 정의 위젯은 지우고 이벤트를 낸다")
    void deleteUnusedDefinition() {
        WidgetDef existing = row("def.k3x9q2ab", "D");
        when(defRepository.findById("def.k3x9q2ab")).thenReturn(Optional.of(existing));
        when(usageRepository.countUsers("def.k3x9q2ab")).thenReturn(0L);

        Map<String, Object> result = service.delete(idReq("def.k3x9q2ab"));

        verify(defRepository).delete(existing);
        verify(eventPublisher).publishEvent(new WidgetDefSavedEvent("def.k3x9q2ab"));
        assertThat(result).containsEntry("deleted", "def.k3x9q2ab");
    }

    @Test
    @DisplayName("코드 위젯 삭제 = 덮어쓰기 행 삭제(사용자 수와 무관)")
    void deleteCodeOverrideRow() {
        WidgetDef existing = row("home.notice", "C");
        when(defRepository.findById("home.notice")).thenReturn(Optional.of(existing));

        service.delete(idReq("home.notice"));

        verify(defRepository).delete(existing);
        verify(usageRepository, never()).countUsers(anyString());
        verify(eventPublisher).publishEvent(new WidgetDefSavedEvent("home.notice"));
    }

    @Test
    @DisplayName("없는 ID 삭제는 「위젯 정의를 찾을 수 없습니다」")
    void deleteMissing() {
        when(defRepository.findById("def.none0000")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(idReq("def.none0000")))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("위젯 정의를 찾을 수 없습니다");
        verifyNoInteractions(eventPublisher);
    }

    // ── search·previewQuery ─────────────────────────────────────────

    @Test
    @DisplayName("search 는 정의 행 전체(configJson 그대로)+userCount 와, 행 없는 코드 위젯까지 담은 usage 를 돌려준다")
    void searchWithUsage() {
        WidgetDef query = row("def.q1", "D");
        query.setTypeId("query-table");
        query.setConfigJson("{\"sql\":\"select 1\"}");
        when(defRepository.findAllByOrderByWidgetIdAsc()).thenReturn(List.of(query, row("home.notice", "C")));
        List<Object[]> usageRows = new ArrayList<>();
        usageRows.add(new Object[] {"home.notice", 4L});
        usageRows.add(new Object[] {"home.todo", 2L});
        when(usageRepository.countUsersByWidget()).thenReturn(usageRows);

        Map<String, Object> result = service.search(new CommWidgetMngRequest());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> defs = (List<Map<String, Object>>) result.get("defs");
        assertThat(defs).hasSize(2);
        assertThat(defs.get(0)).containsEntry("widgetId", "def.q1").containsEntry("userCount", 0L)
                .containsEntry("configJson", "{\"sql\":\"select 1\"}");
        assertThat(defs.get(1)).containsEntry("widgetId", "home.notice").containsEntry("userCount", 4L);
        assertThat(result.get("usage")).isEqualTo(Map.of("home.notice", 4L, "home.todo", 2L));
    }

    @Test
    @DisplayName("search includeConfig=false 는 요약 조회로 configJson 키 없이 userCount·usage 를 돌려준다")
    void searchWithoutConfig() {
        Object[] q = {"def.q1", "D", "query-table", "쿼리", null, null, 8, 6, null, null, null, null, null, null, null, null, "mcm", "QUAL", "Y", "A"};
        Object[] c = {"home.notice", "C", null, null, null, null, null, null, null, null, null, null, null, null, null, "N", null, null, null, null};
        when(defRepository.findAllSummaryOrderByWidgetIdAsc()).thenReturn(List.of(q, c));
        List<Object[]> usageRows = new ArrayList<>();
        usageRows.add(new Object[] {"home.notice", 4L});
        when(usageRepository.countUsersByWidget()).thenReturn(usageRows);
        CommWidgetMngRequest req = new CommWidgetMngRequest();
        req.setIncludeConfig(false);

        Map<String, Object> result = service.search(req);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> defs = (List<Map<String, Object>>) result.get("defs");
        assertThat(defs).hasSize(2);
        assertThat(defs.get(0)).doesNotContainKey("configJson").containsEntry("widgetId", "def.q1")
                .containsEntry("typeId", "query-table").containsEntry("defW", 8).containsEntry("useYn", "Y").containsEntry("placeTp", "A")
                .containsEntry("privateYn", "Y").containsEntry("userCount", 0L);
        assertThat(defs.get(1)).doesNotContainKey("configJson").containsEntry("useYn", "N").containsEntry("privateYn", null).containsEntry("userCount", 4L);
        assertThat(result.get("usage")).isEqualTo(Map.of("home.notice", 4L));
        verify(defRepository, never()).findAllByOrderByWidgetIdAsc();
    }

    @Test
    @DisplayName("search widgetId 를 주면 그 정의 1건을 configJson 포함으로 돌려주고, 없으면 빈 목록이다")
    void searchDetail() {
        WidgetDef query = row("def.q1", "D");
        query.setConfigJson("{\"sql\":\"select 1\"}");
        when(defRepository.findById("def.q1")).thenReturn(Optional.of(query));
        when(defRepository.findById("def.none")).thenReturn(Optional.empty());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> found = (List<Map<String, Object>>) service.search(idReq("def.q1")).get("defs");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> missing = (List<Map<String, Object>>) service.search(idReq("def.none")).get("defs");

        assertThat(found).hasSize(1);
        assertThat(found.get(0)).containsEntry("widgetId", "def.q1").containsEntry("configJson", "{\"sql\":\"select 1\"}");
        assertThat(missing).isEmpty();
        verifyNoInteractions(usageRepository);
    }

    @Test
    @DisplayName("previewQuery 는 queryRunner.preview(dataSrc, sql, 50, 조건 정의) 결과를 columns·rows·truncated 로 돌려준다")
    void previewDelegates() {
        WidgetQueryResult qr = new WidgetQueryResult(List.of("A"), List.of(Map.of("A", 1)), true);
        when(queryRunner.preview("mcm", "select 1 a", 50, null)).thenReturn(qr);
        CommWidgetMngRequest r = new CommWidgetMngRequest();
        r.setDataSrc("mcm");
        r.setSql("select 1 a");

        Map<String, Object> result = service.previewQuery(r);

        assertThat(result).containsEntry("columns", List.of("A")).containsEntry("rows", List.of(Map.of("A", 1)))
                .containsEntry("truncated", true);
    }

    @Test
    @DisplayName("previewQuery 는 요청의 paramsJson(조건 정의)을 그대로 실행기에 전달한다 — 빈 글자는 없음으로")
    void previewPassesParamDefs() {
        String defs = "[{\"name\":\"plant\",\"type\":\"text\",\"default\":\"P1\"}]";
        WidgetQueryResult qr = new WidgetQueryResult(List.of("A"), List.of(), false);
        when(queryRunner.preview("mcm", "select 1 a where :plant = 'x'", 50, defs)).thenReturn(qr);
        CommWidgetMngRequest r = new CommWidgetMngRequest();
        r.setDataSrc("mcm");
        r.setSql("select 1 a where :plant = 'x'");
        r.setParamsJson(defs);

        assertThat(service.previewQuery(r)).containsEntry("truncated", false);
        verify(queryRunner).preview("mcm", "select 1 a where :plant = 'x'", 50, defs);

        when(queryRunner.preview("mcm", "select 1 a", 50, null)).thenReturn(qr);
        r.setSql("select 1 a");
        r.setParamsJson("   ");
        service.previewQuery(r);
        verify(queryRunner).preview("mcm", "select 1 a", 50, null);
    }

    @Test
    @DisplayName("previewQuery 도 mcm 밖 모듈은 거절한다")
    void previewOtherModuleRejected() {
        CommWidgetMngRequest r = new CommWidgetMngRequest();
        r.setDataSrc("mls");
        r.setSql("select 1");

        assertThatThrownBy(() -> service.previewQuery(r))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("아직 지원하지 않는 모듈입니다");
        verifyNoInteractions(queryRunner);
    }
}
