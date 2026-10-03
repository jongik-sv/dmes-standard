package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaTargetType;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.BiFunction;
import java.util.function.Function;
import org.springframework.stereotype.Component;

/**
 * 메타 피드 목차·본문(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §4.1·§4.2). 본문 값은 {@code part} 없는 응답의 목록 원소와 같은 조립을
 * 쓴다({@link MetaFeedDefinitions}). 목차와 {@code current} 본문은 같은 읽기 트랜잭션에서 만든다(호출자 {@code MetaFeedService.view}).
 */
@Component
public class MetaFeedVersioned {

    static final String NOT_RELEASED = "NOT_RELEASED";
    static final String INVALID_VER = "INVALID_VER";

    private final MetaFeedDefinitions definitions;

    public MetaFeedVersioned(MetaFeedDefinitions definitions) {
        this.definitions = definitions;
    }

    public MetaFeedVersionedResult toc(MetaTargetType type, List<String> keys, LocalDateTime at) {
        MetaFeedVersionedResult.Builder b = MetaFeedVersionedResult.builder(MetaFeedPart.TOC);
        switch (type) {
            case RULE -> rulesToc(keys, at, b);
            default -> throw MetaFeedService.invalid("part=TOC 를 아직 받지 않는 대상입니다: " + type);
        }
        return b.build();
    }

    public MetaFeedVersionedResult bodies(MetaTargetType type, List<MetaFeedService.BodyKey> keys) {
        MetaFeedVersionedResult.Builder b = MetaFeedVersionedResult.builder(MetaFeedPart.BODY);
        switch (type) {
            case RULE -> ruleBodies(keys, b);
            default -> throw MetaFeedService.invalid("part=BODY 를 아직 받지 않는 대상입니다: " + type);
        }
        return b.build();
    }

    private void rulesToc(List<String> ids, LocalDateTime at, MetaFeedVersionedResult.Builder b) {
        RuleVarTypeResolver.Scope scope = definitions.ruleScope();
        for (String id : ids) {
            Optional<MdmRule> rule = definitions.rule(id);
            if (rule.isEmpty()) {
                continue;
            }
            List<MdmRuleVer> released = definitions.releasedRuleVersions(id);
            try {
                Map<String, Object> current = MetaFeedVersionSelect
                        .releasedAt(released, MdmRuleVer::getVer, MdmRuleVer::getApplyFrom, MdmRuleVer::getApplyTo, at)
                        .map(v -> MetaFeedVersionedResult.current(v.getVer(),
                                MetaFeedJson.plain(definitions.assembleRule(id, rule.get(), v, scope))))
                        .orElse(null);
                b.toc(id, MetaFeedVersionedResult.toc(null, released.stream()
                        .map(v -> MetaFeedVersionedResult.tocVersion(v.getVer(), v.getStatus(), v.getApplyFrom(), v.getApplyTo()))
                        .toList()), current);
            } catch (BusinessException | IllegalArgumentException | IllegalStateException e) {
                b.tocFailed(id, e.getMessage());
            }
        }
    }

    /** 룰 엔티티와 그 RELEASED 버전 하나 — 같은 룰의 여러 버전이 룰 조회를 한 번만 하도록 {@code renderBodies} 의 적재 결과에 담는다. */
    private record RuleVer(MdmRule rule, MdmRuleVer ver) {
    }

    private void ruleBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b) {
        RuleVarTypeResolver.Scope scope = definitions.ruleScope();
        this.<RuleVer>renderBodies(keys, b,
                id -> definitions.rule(id)
                        .map(rule -> Loaded.of(definitions.releasedRuleVersions(id).stream().map(v -> new RuleVer(rule, v)).toList()))
                        .orElse(Loaded.of(List.of())),
                rv -> rv.ver().getVer(),
                (k, rv) -> MetaFeedJson.plain(definitions.assembleRule(k.key(), rv.rule(), rv.ver(), scope)));
    }

    /** 적재 결과 — 목록 또는 실패 메시지. 실패면 그 키의 모든 쌍이 같은 메시지로 failed 가 된다. */
    record Loaded<T>(List<T> list, String error) {

        static <T> Loaded<T> of(List<T> list) {
            return new Loaded<>(list, null);
        }

        static <T> Loaded<T> failed(Throwable e) {
            return new Loaded<>(List.of(), message(e));
        }
    }

    /** 예외 메시지 — {@code getMessage()} 가 null 이면 {@code toString()}. 실패 행의 message 가 null 이 되지 않게 한다. */
    static String message(Throwable e) {
        return e.getMessage() == null ? e.toString() : e.getMessage();
    }

    /**
     * BODY 공통 루프 — 네 대상(룰·세트·전문·코드)이 이것 하나를 쓴다. 쌍마다 ver 형식 오류면 INVALID_VER, 키별로 {@code loader} 를 한 번만 불러
     * 적재(같은 키의 여러 버전은 읽기를 공유), 적재가 실패면 그 메시지, RELEASED 목록에 그 ver 가 없으면 NOT_RELEASED, 있으면 {@code render}.
     * {@code render} 가 던지면 그 쌍만 failed 다(저장값이 깨진 정의). {@code loader} 는 null 을 돌려주지 않는다 — 메모에 {@code computeIfAbsent} 를 쓰므로
     * 실패는 {@link Loaded#failed} 로 담는다.
     */
    private <T> void renderBodies(List<MetaFeedService.BodyKey> keys, MetaFeedVersionedResult.Builder b,
                                  Function<String, Loaded<T>> loader, Function<T, BigDecimal> verOf,
                                  BiFunction<MetaFeedService.BodyKey, T, Object> render) {
        Map<String, Loaded<T>> memo = new HashMap<>();
        for (MetaFeedService.BodyKey k : keys) {
            if (k.ver() == null) {
                b.bodyFailed(k, INVALID_VER);
                continue;
            }
            Loaded<T> loaded = memo.computeIfAbsent(k.key(), loader);
            if (loaded.error() != null) {
                b.bodyFailed(k, loaded.error());
                continue;
            }
            Optional<T> hit = loaded.list().stream().filter(x -> verOf.apply(x).compareTo(k.ver()) == 0).findFirst();
            if (hit.isEmpty()) {
                b.bodyFailed(k, NOT_RELEASED);
                continue;
            }
            try {
                b.body(k, render.apply(k, hit.get()));
            } catch (RuntimeException e) {
                b.bodyFailed(k, message(e));
            }
        }
    }
}
