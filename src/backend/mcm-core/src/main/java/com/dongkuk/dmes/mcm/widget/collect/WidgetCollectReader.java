package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectData;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectDataRepository;
import com.dongkuk.dmes.mcm.widget.collect.repository.WidgetCollectRunRepository;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/**
 * 정시 수집 값 읽기 — 스펙 2026-10-05 정시 수집 §5. {@code widgetData/run} 이 정의의 유형이 {@code collect} 일 때 보낸다.
 * 응답은 {@code { columns:[COLLECTED_AT,ITEM_KEY,VALUE], rows:[…], truncated, lastRun:{at,status,message?}|null }}.
 * 행은 {@code show.days} 일 안의 값만 수집 시각 오름차순 → 항목 오름차순, 최대 500행(넘으면 가장 오래된 행부터 버리고 truncated).
 * 캐시는 쓰지 않는다 — 수집 값이 정시에 바뀌므로 새로 고침이 곧바로 반영되어야 한다. 서버 오류 상세는 사용자에게 보내지 않는다.
 */
@Component
public class WidgetCollectReader {

    private static final Logger log = LoggerFactory.getLogger(WidgetCollectReader.class);

    static final int MAX_ROWS = 500;
    static final String MSG_DISABLED = "사용 중지된 위젯입니다";
    static final String MSG_LOAD_FAILED = "위젯 데이터를 불러오지 못했습니다";
    static final List<String> COLUMNS = List.of("COLLECTED_AT", "ITEM_KEY", "VALUE");

    private static final DateTimeFormatter SLOT = WidgetCollector.SLOT;
    private static final ZoneId ZONE = WidgetCollector.ZONE;

    private final WidgetDefRepository defRepository;
    private final WidgetCollectDataRepository dataRepository;
    private final WidgetCollectRunRepository runRepository;
    private final Clock clock;

    @Autowired
    public WidgetCollectReader(WidgetDefRepository defRepository, WidgetCollectDataRepository dataRepository,
                               WidgetCollectRunRepository runRepository) {
        this(defRepository, dataRepository, runRepository, Clock.system(ZONE));
    }

    WidgetCollectReader(WidgetDefRepository defRepository, WidgetCollectDataRepository dataRepository,
                        WidgetCollectRunRepository runRepository, Clock clock) {
        this.defRepository = defRepository;
        this.dataRepository = dataRepository;
        this.runRepository = runRepository;
        this.clock = clock;
    }

    /**
     * defId 가 정시 수집 정의이면 읽어서 돌려주고, 아니면(없는 정의 포함) 빈 값 — 호출자가 기존 쿼리 위젯 경로로 보낸다.
     * 사용 중이 아니면 기존 오류와 같은 문구로 거절한다.
     */
    public Optional<Map<String, Object>> readIfCollect(String defId) {
        WidgetDef def = defRepository.findById(defId).orElse(null);
        if (def == null || !def.isDefinition() || !CollectConfig.TYPE_ID.equals(def.getTypeId())) return Optional.empty();
        if (!def.isInUse()) throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_DISABLED);
        int days;
        try {
            days = CollectConfigs.parse(def.getConfigJson()).showDays();
        } catch (BusinessException e) {
            log.warn("정시 수집 설정 오류 defId={} 사유={}", defId, e.getMessage());
            throw new BusinessException(ErrorCode.BUSINESS_ERROR, MSG_LOAD_FAILED);
        }
        LocalDateTime now = LocalDateTime.ofInstant(clock.instant(), ZONE);
        String fromSlot = SLOT.format(now.minusDays(days));

        // 오름차순 읽기의 정확한 거꾸로(최근 SLOT·큰 항목 부터) 501개 — 앞 500개만 쓰면 가장 오래된 행이 버려진다.
        List<WidgetCollectData> newest = new ArrayList<>(dataRepository
                .findByWidgetIdAndSlotGreaterThanEqualOrderBySlotDescItemKeyDesc(defId, fromSlot, PageRequest.of(0, MAX_ROWS + 1)));
        boolean truncated = newest.size() > MAX_ROWS;
        List<WidgetCollectData> kept = truncated ? new ArrayList<>(newest.subList(0, MAX_ROWS)) : newest;
        kept.sort(Comparator.comparing(WidgetCollectData::getSlot).thenComparing(WidgetCollectData::getItemKey));

        List<Map<String, Object>> rows = new ArrayList<>(kept.size());
        for (WidgetCollectData d : kept) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("COLLECTED_AT", at(d.getSlot()));
            row.put("ITEM_KEY", d.getItemKey());
            row.put("VALUE", d.getValueNum() != null ? plain(d.getValueNum()) : d.getValueTxt());
            rows.add(Collections.unmodifiableMap(row));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", COLUMNS);
        result.put("rows", rows);
        result.put("truncated", truncated);
        result.put("lastRun", runRepository.findFirstByWidgetIdOrderBySlotDesc(defId).map(WidgetCollectReader::lastRun).orElse(null));
        return Optional.of(result);
    }

    private static Map<String, Object> lastRun(WidgetCollectRun run) {
        Map<String, Object> last = new LinkedHashMap<>();
        last.put("at", at(run.getSlot()));
        last.put("status", run.getStatus());
        if (run.getMsg() != null && !run.getMsg().isBlank()) last.put("message", run.getMsg());
        return last;
    }

    /** yyyyMMddHHmm → {@code 2026-10-05T09:10:00}. */
    static String at(String slot) {
        return DateTimeFormatter.ISO_LOCAL_DATE_TIME.format(LocalDateTime.parse(slot, SLOT));
    }

    /** 끝의 0 을 지우되 지수 표기는 쓰지 않는다. */
    private static BigDecimal plain(BigDecimal n) {
        BigDecimal s = n.stripTrailingZeros();
        return s.scale() < 0 ? s.setScale(0) : s;
    }
}
