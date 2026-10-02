package com.dongkuk.dmes.mcm.widget.memo.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.memo.dto.WidgetMemoRequest;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemo;
import com.dongkuk.dmes.mcm.widget.memo.entity.WidgetMemoId;
import com.dongkuk.dmes.mcm.widget.memo.repository.WidgetMemoRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 메모장 위젯 개인 메모 — OASIS {@code widgetMemo}(스펙 2026-10-02-widget-admin-generic §17.3). action load·save.
 * <ul>
 *   <li>사용자는 늘 인증 컨텍스트(IDOR) — 메모는 (사용자, instId)로만 읽고 쓴다.</li>
 *   <li>save 검사는 모두 E002: instId 1~40자 {@code [A-Za-z0-9_-]}, defId 는 사용 중인 memo 유형 정의이고 scope=personal,
 *       format 은 text·md·html, content 20,000자 이하(UTF-16 단위 — JS {@code length} 와 같은 기준, 원문 그대로 저장),
 *       사용자당 100개(새 instId 일 때만 센다 — {@link WidgetMemoWriter}).</li>
 *   <li>load 는 defId 를 보지 않는다 — 정의가 사용 중지돼도 자기 메모는 읽는다.</li>
 * </ul>
 * 이 클래스에는 {@code @Transactional} 을 붙이지 않는다(BackEnd 표준 §6-B-1) — 쓰기 원자성은 {@link WidgetMemoWriter}.
 */
@Service("widgetMemoService")
public class WidgetMemoService {

    public static final String TYPE_MEMO = "memo";
    public static final String SCOPE_SHARED = "shared";
    public static final String SCOPE_PERSONAL = "personal";
    public static final Set<String> FORMATS = Set.of("text", "md", "html");
    public static final int CONTENT_MAX = 20_000;
    static final int DEF_ID_MAX = 100;
    private static final Pattern INST_ID = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final WidgetMemoRepository repository;
    private final WidgetMemoWriter writer;
    private final WidgetDefRepository defRepository;
    private final SecurityIdentity securityIdentity;

    @Autowired
    public WidgetMemoService(WidgetMemoRepository repository,
                             WidgetMemoWriter writer,
                             WidgetDefRepository defRepository,
                             SecurityIdentity securityIdentity) {
        this.repository = repository;
        this.writer = writer;
        this.defRepository = defRepository;
        this.securityIdentity = securityIdentity;
    }

    /** 그 칸의 내 메모 — {@code { memo: {instId, defId, format, content, updatedAt} | null }}. */
    public Map<String, Object> load(WidgetMemoRequest request) {
        String userId = requireUser();
        String instId = requireInstId(request);
        WidgetMemo memo = repository.findById(new WidgetMemoId(userId, instId)).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memo", memo == null ? null : view(memo));
        return result;
    }

    /** 내 메모 저장(없으면 넣고 있으면 덮어쓴다) — {@code { memo: {…load 와 같은 모양} }}. */
    public Map<String, Object> save(WidgetMemoRequest request) {
        String userId = requireUser();
        String instId = requireInstId(request);
        String format = requireFormat(request.getFormat());
        String content = requireContent(request.getContent());
        String defId = requirePersonalMemoDef(request.getDefId());
        WidgetMemo saved = writer.save(userId, instId, defId, format, content);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memo", view(saved));
        return result;
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private String requireUser() {
        String userId = securityIdentity.currentUserId();
        if (userId == null || userId.isBlank()) {
            throw new BusinessException(ErrorCode.AUTH_FAILED, "인증 정보가 없습니다.");
        }
        return userId;
    }

    private static String requireInstId(WidgetMemoRequest request) {
        String instId = request == null ? null : request.getInstId();
        if (instId == null || !INST_ID.matcher(instId).matches()) {
            throw invalid("위젯 인스턴스 ID 가 올바르지 않습니다.");
        }
        return instId;
    }

    private static String requireFormat(String format) {
        if (format == null || !FORMATS.contains(format)) throw invalid("메모 형식은 text·md·html 중 하나여야 합니다.");
        return format;
    }

    /** 원문 그대로(strip 하지 않는다). null 은 빈 메모. */
    private static String requireContent(String content) {
        String text = content == null ? "" : content;
        if (text.length() > CONTENT_MAX) throw invalid("메모는 20,000자까지 저장할 수 있습니다.");
        return text;
    }

    /** 사용 중인 memo 유형 정의(SRC_TP='D')이고 CONFIG_JSON.scope 가 personal 인 것만. */
    private String requirePersonalMemoDef(String defId) {
        if (defId == null || defId.isBlank() || defId.length() > DEF_ID_MAX) throw invalid("사용할 수 없는 메모 위젯입니다.");
        return defRepository.findById(defId)
                .filter(d -> d.isDefinition() && TYPE_MEMO.equals(d.getTypeId()) && d.isInUse() && isPersonal(d))
                .map(WidgetDef::getWidgetId)
                .orElseThrow(() -> invalid("사용할 수 없는 메모 위젯입니다."));
    }

    private static boolean isPersonal(WidgetDef def) {
        String configJson = def.getConfigJson();
        if (configJson == null || configJson.isBlank()) return false;
        try {
            JsonNode scope = JSON.readTree(configJson).get("scope");
            return scope != null && scope.isTextual() && SCOPE_PERSONAL.equals(scope.asText());
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    private static Map<String, Object> view(WidgetMemo memo) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("instId", memo.getInstId());
        m.put("defId", memo.getDefId());
        m.put("format", memo.getFmt());
        m.put("content", memo.getContent() == null ? "" : memo.getContent());
        m.put("updatedAt", memo.getUpdatedAt() == null ? null : memo.getUpdatedAt().toString());
        return m;
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
