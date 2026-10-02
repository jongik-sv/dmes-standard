package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSearchRequest;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest;
import com.dongkuk.dmes.mdm.repository.MdmMetaRevRepository;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * MDM 메타 제공(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §3.4) — {@code services/feed/metaFeed.bpmn}.
 * 업무 모듈 cactus 캐시가 부른다. 캐시를 두지 않고 늘 DB 최신 값을 돌려준다(D4).
 *
 * <p>{@code @Transactional} 을 쓰지 않는다(OASIS 파라미터 이름, F11). 조회는 읽기 전용 {@link TransactionTemplate} 으로 읽는다
 * (DataHistoryService 선례). 키 목록은 {@code grids.keys.rows[{key}]} 로 받는다 — params 배열 금지(oasis-contract-check 6-E-2).
 */
@Service("metaFeedService")
public class MetaFeedService {

    static final int DEFAULT_LIMIT = 1000;
    static final int MAX_LIMIT = 5000;
    static final int MAX_KEYS = 500;

    private final MdmMetaRevRepository revisions;
    private final MetaFeedDictionary dictionary;
    private final TransactionTemplate readTx;

    public MetaFeedService(MdmMetaRevRepository revisions, MetaFeedDictionary dictionary, PlatformTransactionManager transactionManager) {
        this.revisions = revisions;
        this.dictionary = dictionary;
        this.readTx = new TransactionTemplate(transactionManager);
        this.readTx.setReadOnly(true);
    }

    /** action search(= 스펙 changes) — {@code {latestSeq, items:[{seq, type, key, kind}], truncated}}. */
    public Map<String, Object> search(MetaFeedSearchRequest request) {
        long since = request == null || request.getSince() == null ? 0L : Math.max(0L, request.getSince());
        int limit = request == null || request.getLimit() == null ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, request.getLimit()));
        return readTx.execute(status -> {
            List<MdmMetaRev> rows = revisions.findByRevSeqGreaterThanOrderByRevSeqAsc(since, PageRequest.of(0, limit + 1));
            boolean truncated = rows.size() > limit;
            List<Map<String, Object>> items = new ArrayList<>();
            for (MdmMetaRev r : truncated ? rows.subList(0, limit) : rows) {
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("seq", r.getRevSeq());
                item.put("type", r.getTargetType());
                item.put("key", r.getTargetKey());
                item.put("kind", r.getChangeKind());
                items.add(item);
            }
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("latestSeq", revisions.latestSeq());
            out.put("items", items);
            out.put("truncated", truncated);
            return out;
        });
    }

    /** action view(= 스펙 columns·domains·rules·ruleSets·codes·layouts) — {@code {items:[{key, value}], failed:[{key, message}]}}. */
    public Map<String, Object> view(MetaFeedViewRequest request, List<Map<String, Object>> keys) {
        MetaTargetType type = requireType(request == null ? null : request.getType());
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            return MetaFeedResult.empty().toResponse();
        }
        return readTx.execute(status -> fetch(type, wanted)).toResponse();
    }

    MetaFeedResult fetch(MetaTargetType type, List<String> keys) {
        return switch (type) {
            case COLUMN -> dictionary.columns(keys);
            case DOMAIN -> dictionary.domains(keys);
            case RULE, RULE_SET, CODE, LAYOUT -> throw invalid("아직 제공하지 않는 대상 종류입니다: " + type);
        };
    }

    /** grids.keys.rows 의 key — 공백을 빼고 중복 없이, COLUMN 은 대문자(Ruling R2). 최대 {@link #MAX_KEYS}. */
    static List<String> keyList(MetaTargetType type, List<Map<String, Object>> rows) {
        Set<String> out = new LinkedHashSet<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Object v = row == null ? null : row.get("key");
                if (v == null || String.valueOf(v).isBlank()) {
                    continue;
                }
                String k = String.valueOf(v).trim();
                out.add(type == MetaTargetType.COLUMN ? k.toUpperCase(Locale.ROOT) : k);
            }
        }
        if (out.size() > MAX_KEYS) {
            throw invalid("키는 한 번에 " + MAX_KEYS + "개까지 받습니다: " + out.size());
        }
        return List.copyOf(out);
    }

    static MetaTargetType requireType(String text) {
        return MetaTargetType.parse(text).orElseThrow(() ->
                invalid("대상 종류(type)는 COLUMN·DOMAIN·RULE·RULE_SET·CODE·LAYOUT 중 하나여야 합니다: " + text));
    }

    static BusinessException invalid(String detail) {
        return MdmErrors.of(MdmErrorCode.INVALID_INPUT, detail, List.of());
    }
}
