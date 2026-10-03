package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaChangeKind;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevisionRecorder.MetaRevisionRange;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.security.MdmCurrentUser;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.entity.MdmMetaRev;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSaveRequest;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedSearchRequest;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest;
import com.dongkuk.dmes.mdm.repository.MdmMetaRevRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
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
 * (DataHistoryService 선례). D-154 — {@code part=TOC|BODY} 는 {@link MetaFeedVersioned} 가 준다. 키 목록은 {@code grids.keys.rows[{key}]} 로 받는다 — params 배열 금지(oasis-contract-check 6-E-2).
 */
@Service("metaFeedService")
public class MetaFeedService {

    static final int DEFAULT_LIMIT = 1000;
    static final int MAX_LIMIT = 5000;
    static final int MAX_KEYS = 500;

    static final String SYSADMIN = "SYSADMIN";

    private final MdmMetaRevRepository revisions;
    private final MetaFeedDictionary dictionary;
    private final MetaFeedDefinitions definitions;
    private final MetaFeedVersioned versioned;
    private final MetaRevisionRecorder recorder;
    private final MdmCurrentUser currentUser;
    private final TransactionTemplate readTx;

    public MetaFeedService(MdmMetaRevRepository revisions, MetaFeedDictionary dictionary, MetaFeedDefinitions definitions,
                           MetaFeedVersioned versioned, MetaRevisionRecorder recorder, MdmCurrentUser currentUser, PlatformTransactionManager transactionManager) {
        this.revisions = revisions;
        this.dictionary = dictionary;
        this.definitions = definitions;
        this.versioned = versioned;
        this.recorder = recorder;
        this.currentUser = currentUser;
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

    /**
     * action view(= 스펙 columns·domains·rules·ruleSets·codes·layouts) — {@code {items:[{key, value}], failed:[{key, message}]}}.
     * COLUMN 은 선택 {@code params.systemCode} 를 받아 시스템 별칭으로도 찾는다(spec 2026-10-03-mdm-column-system-alias-design §3). 다른 type 은 무시한다.
     */
    public Map<String, Object> view(MetaFeedViewRequest request, List<Map<String, Object>> keys) {
        MetaTargetType type = requireType(request == null ? null : request.getType());
        MetaFeedPart part = MetaFeedPart.of(request.getPart(), type);
        if (part == MetaFeedPart.TOC) {
            List<String> wanted = keyList(type, keys);
            LocalDateTime at = parseAt(request.getAt());
            return readTx.execute(status -> versioned.toc(type, wanted, at)).toResponse();
        }
        if (part == MetaFeedPart.BODY) {
            List<BodyKey> wanted = bodyKeyList(keys);
            return readTx.execute(status -> versioned.bodies(type, wanted)).toResponse();
        }
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            return MetaFeedResult.empty().toResponse();
        }
        String systemCode = request.getSystemCode();
        return readTx.execute(status -> fetch(type, wanted, systemCode)).toResponse();
    }

    /** {@code systemCode} 는 COLUMN 에서만 쓴다 — 표준 물리명으로 못 찾은 키를 그 시스템의 별칭으로 찾는다(spec 2026-10-03 L1). */
    MetaFeedResult fetch(MetaTargetType type, List<String> keys, String systemCode) {
        return switch (type) {
            case COLUMN -> dictionary.columns(keys, systemCode);
            case DOMAIN -> dictionary.domains(keys);
            case RULE -> definitions.rules(keys);
            case RULE_SET -> definitions.ruleSets(keys);
            case CODE -> definitions.codes(keys);
            case LAYOUT -> definitions.layouts(keys);
        };
    }

    /**
     * action save(= 스펙 force) — 화면 삭제(EVICT)·재등록(RELOAD). 펼치지 않는다. SYSADMIN 만(MDM027) — BFF 권한(mdm/metafeed/save)과 별도로
     * 여기서 다시 본다. 모든 모듈·인스턴스가 다음 폴링에서 반영한다(D6).
     */
    public Map<String, Object> save(MetaFeedSaveRequest request, List<Map<String, Object>> keys) {
        if (!currentUser.roleIds().contains(SYSADMIN)) {
            throw MdmErrors.coded(MdmErrorCode.SYSADMIN_ROLE_REQUIRED); // meta.code MDM027 — 화면이 코드로 가린다(Ruling R10)
        }
        MetaTargetType type = requireType(request == null ? null : request.getType());
        String kindText = request == null ? null : request.getKind();
        MetaChangeKind kind = MetaChangeKind.parse(kindText).filter(k -> k != MetaChangeKind.SAVE)
                .orElseThrow(() -> invalid("변경 종류(kind)는 EVICT·RELOAD 중 하나여야 합니다: " + kindText));
        List<String> wanted = keyList(type, keys);
        if (wanted.isEmpty()) {
            throw invalid("강제 기록할 키가 없습니다");
        }
        MetaRevisionRange range = recorder.force(type, wanted, kind);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("fromSeq", range.fromSeq());
        out.put("toSeq", range.toSeq());
        out.put("count", range.count());
        return out;
    }

    /** BODY 키 한 줄 — {@code ver} 가 null 이면 형식이 틀린 버전({@code rawVer} 가 원문)이다. 그 키만 failed(INVALID_VER)로 돌린다. */
    public record BodyKey(String key, BigDecimal ver, String rawVer) {
    }

    /** grids.keys.rows 의 {key, ver} — 공백 제거, (key, 수로 비교한 ver) 쌍으로 중복 제거, 최대 {@link #MAX_KEYS}. keyList 와 달리 같은 키의 여러 버전을 지킨다. */
    static List<BodyKey> bodyKeyList(List<Map<String, Object>> rows) {
        Map<String, BodyKey> out = new LinkedHashMap<>();
        if (rows != null) {
            for (Map<String, Object> row : rows) {
                Object k = row == null ? null : row.get("key");
                if (k == null || String.valueOf(k).isBlank()) {
                    continue;
                }
                String key = String.valueOf(k).trim();
                Object v = row.get("ver");
                String raw = v == null ? "" : String.valueOf(v).trim();
                BigDecimal ver;
                try {
                    ver = VersionNumbers.parse(raw);
                } catch (IllegalArgumentException e) {
                    ver = null;
                }
                String dedupe = key + '\u0000' + (ver == null ? "?" + raw : ver.toPlainString());
                out.putIfAbsent(dedupe, new BodyKey(key, ver, raw));
            }
        }
        if (out.size() > MAX_KEYS) {
            throw invalid("키는 한 번에 " + MAX_KEYS + "개까지 받습니다: " + out.size());
        }
        return List.copyOf(out.values());
    }

    /** {@code at} — 비면 null(current 를 싣지 않는다). KST {@code yyyy-MM-ddTHH:mm:ss}, 초 미만은 자른다. 형식이 틀리면 입력 오류(묶음 거부). */
    static LocalDateTime parseAt(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            return LocalDateTime.parse(text.trim()).truncatedTo(ChronoUnit.SECONDS);
        } catch (DateTimeParseException e) {
            throw invalid("at 은 yyyy-MM-ddTHH:mm:ss 형식이어야 합니다: " + text);
        }
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
