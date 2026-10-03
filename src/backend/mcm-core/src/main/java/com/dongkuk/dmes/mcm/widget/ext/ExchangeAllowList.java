package com.dongkuk.dmes.mcm.widget.ext;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 환율 조회 허용 목록 — 저장된 <b>사용 중인 환율 위젯 정의</b>(SRC_TP=D, TYPE_ID=exchange, USE_YN≠N)의 설정만 조회할 수 있다.
 * 요청(통화 묶음·기간)은 <b>어떤 정의 하나</b>가 허용하는 범위 안이어야 한다: 통화는 그 정의 통화의 부분집합, 기간은 그 정의 기간 이하.
 * 정의 ID 는 받지 않는다 — 정의는 모든 사용자에게 보이므로(widgetDef/list) 정의 ID 를 받아도 막는 범위가 같고, 요청 모양을 바꾸지 않는다.
 * <p>정의 설정 해석은 화면({@code widget-types/_ext/config.ts} 의 readExchangeConfig·exchangeRequest)과 똑같이 한다 — 통화가 없으면
 * 초기 설정(USD·EUR·JPY·CNY), 기간이 없거나 숫자가 아니면 30, 통화는 앞뒤 공백 제거·대문자·영문 3자리·KRW 제외·중복 제거·앞 10개,
 * 기간은 반올림해 1~90. 그래서 화면이 정의대로 보내는 요청은 늘 통과하고, 정의에 없는 통화·더 긴 기간은 거절된다.
 * <p>목록은 60초 캐시하고 정의 저장·삭제 이벤트가 오면 비운다. 관리 화면 미리보기에서 아직 저장하지 않은 통화는 저장 뒤에 보인다.
 */
@Component
public class ExchangeAllowList {

    static final String TYPE_EXCHANGE = "exchange";
    static final List<String> INITIAL_CURRENCIES = List.of("USD", "EUR", "JPY", "CNY");
    static final int INITIAL_DAYS = 30;
    static final int MAX_DAYS = 90;
    static final int MAX_SYMBOLS = 10;
    static final Duration CACHE_TTL = Duration.ofSeconds(60);
    static final String MSG_NOT_ALLOWED =
            "환율 위젯 정의에 없는 통화·기간입니다. 위젯관리에서 환율 위젯 정의를 저장한 뒤 다시 조회하세요.";

    private static final Logger log = LoggerFactory.getLogger(ExchangeAllowList.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern CUR = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern JS_NUMBER = Pattern.compile("^[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?$");

    /** 정의 하나가 허용하는 통화(화면이 보내는 순서·10개까지)와 최대 기간. */
    record Grant(String defId, List<String> symbols, int days) {}

    private record Snapshot(List<Grant> grants, Instant expiresAt) {}

    private final WidgetDefRepository repository;
    private final Clock clock;
    private volatile Snapshot snapshot;

    @Autowired
    public ExchangeAllowList(WidgetDefRepository repository) {
        this(repository, Clock.systemUTC());
    }

    ExchangeAllowList(WidgetDefRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** 요청(정리된 통화·기간)이 어떤 사용 중 환율 정의 하나의 범위 안이 아니면 {@link BusinessException}(E002). */
    public void require(Collection<String> symbols, int days) {
        for (Grant g : grants()) {
            if (days <= g.days() && g.symbols().containsAll(symbols)) return;
        }
        throw new BusinessException(ErrorCode.INVALID_VALUE, MSG_NOT_ALLOWED);
    }

    /** 정의를 저장·삭제하면 다음 요청이 목록을 다시 읽는다. */
    @EventListener
    public void onDefSaved(WidgetDefSavedEvent event) {
        snapshot = null;
    }

    List<Grant> grants() {
        Instant now = clock.instant();
        Snapshot s = snapshot;
        if (s != null && now.isBefore(s.expiresAt())) return s.grants();
        List<Grant> grants = new ArrayList<>();
        for (WidgetDef def : repository.findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, TYPE_EXCHANGE)) {
            if (!def.isInUse()) continue;
            Grant g = grantOf(def.getWidgetId(), def.getConfigJson());
            if (g != null && !g.symbols().isEmpty()) grants.add(g);
        }
        List<Grant> frozen = List.copyOf(grants);
        snapshot = new Snapshot(frozen, now.plus(CACHE_TTL));
        return frozen;
    }

    /** 정의 설정 → 화면이 보낼 요청과 같은 값(readExchangeConfig → exchangeRequest). 설정이 JSON 이 아니면 초기 설정. */
    static Grant grantOf(String defId, String configJson) {
        JsonNode cfg = null;
        if (configJson != null && !configJson.isBlank()) {
            try {
                cfg = JSON.readTree(configJson);
            } catch (Exception e) {
                log.warn("[widgetExt] 환율 정의 설정 JSON 을 읽지 못해 초기 설정으로 본다 defId={}", defId);
            }
        }
        if (cfg == null || !cfg.isObject()) return new Grant(defId, INITIAL_CURRENCIES, INITIAL_DAYS);

        List<String> listed = new ArrayList<>();
        JsonNode currencies = cfg.get("currencies");
        if (currencies != null && currencies.isArray()) {
            for (JsonNode c : currencies) {
                if (!c.isTextual()) continue;
                String cur = c.asText().trim().toUpperCase(Locale.ROOT);
                if (!cur.isEmpty() && !listed.contains(cur)) listed.add(cur);
            }
        } else {
            listed.addAll(INITIAL_CURRENCIES);
        }
        List<String> symbols = new ArrayList<>();
        for (String cur : listed) {
            if (CUR.matcher(cur).matches() && !ExchangeService.BASE_KRW.equals(cur) && !symbols.contains(cur)) symbols.add(cur);
            if (symbols.size() >= MAX_SYMBOLS) break;
        }
        return new Grant(defId, List.copyOf(symbols), days(cfg.get("days")));
    }

    /** 화면과 같은 기간 해석 — 숫자 또는 숫자 글자, 반올림해 1~90. 없거나 숫자가 아니면 30. */
    private static int days(JsonNode node) {
        double value;
        if (node != null && node.isNumber()) {
            value = node.asDouble();
        } else if (node != null && node.isTextual() && JS_NUMBER.matcher(node.asText().trim()).matches()) {
            value = Double.parseDouble(node.asText().trim());
        } else {
            return INITIAL_DAYS;
        }
        if (Double.isNaN(value) || Double.isInfinite(value)) return INITIAL_DAYS;
        long rounded = Math.round(value);
        return (int) Math.min(MAX_DAYS, Math.max(1, rounded));
    }
}
