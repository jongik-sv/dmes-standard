package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCancelCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * LAYOUT 확정 취소 훅 — 먼저 취소한 버전 항목 행의 확정 고정값을 비우고(D-151, {@link LayoutColumnPins#clear} — 전문·헤더 모두, DRAFT 는
 * 늘 NULL), 이어 원장 가드를 본다. 비움이 이 훅에 있는 까닭: 공통 엔진의 취소 트랜잭션 안이라 상태 되돌림과 함께 커밋·롤백된다(DRAFT 삭제
 * 훅 {@link LayoutDraftDeletion} 이 자식 행을 지우는 것과 같은 자리).
 *
 * <p>원장 가드(D-144 3단계, Ruling P3-22·P3-23): 헤더 확정을 취소한 뒤 상태에서 그 헤더를 쌓은 RELEASED(현재·미래) 전문
 * 버전 가운데 하나라도 적용 구간에서 합성되지 않으면 취소를 거부한다({@link MdmErrorCode#CONFIRM_CANCEL_BREAKS_LAYOUTS}). 그대로 두면 메타
 * 피드가 그 전문 키 전체를 failed 로 내 지금 적용 중인 버전까지 업무 모듈이 받지 못한다(Ruling R4 — 피드 규칙은 그대로 둔다).
 *
 * <p>공통 엔진이 상태를 DRAFT 로 되돌리고 직전 RELEASED 헤더의 구간까지 다시 연 직후에 불리므로 원장이 곧 "취소 뒤 상태" 다. 판정 기준은
 * 메타 피드와 같은 {@link LayoutReleaseTimeline#released} — 이것이 통과하면 허용한다. 실패하면 이 헤더를 쌓은 현재·미래 버전마다 같은 구간
 * 경계({@link LayoutReleaseTimeline#boundaries})의 시작 시각으로 합성해 걸리는 버전을 찾는다. 걸리는 버전이 없으면(과거 버전 등 이 취소와 무관한
 * 깨짐) 허용한다. 직전 RELEASED 헤더가 있어 구간이 다시 이어지면 합성되므로 허용된다. 전문 확정 취소는 쌓은 전문이 없어 아무것도 안 본다.
 */
@Component
public class LayoutConfirmCancelGuard implements VersionConfirmCancelCheckSpi {

    /** 이슈 행 코드 — 걸리는 전문 버전 한 건. */
    public static final String LAYOUT_UNCOMPOSABLE = "LAYOUT_UNCOMPOSABLE";

    private final LayoutQueries queries;
    private final LayoutVersionStore store;
    private final LayoutComposer composer;
    private final LayoutReleaseTimeline timeline;
    private final LayoutColumnPins columnPins;
    private final MdmLayoutRepository layoutRepository;
    private final EntityManager em;
    private final Clock clock;

    public LayoutConfirmCancelGuard(LayoutQueries queries, LayoutVersionStore store, LayoutComposer composer, LayoutReleaseTimeline timeline,
                                    LayoutColumnPins columnPins, MdmLayoutRepository layoutRepository, EntityManager em, Clock clock) {
        this.queries = queries;
        this.columnPins = columnPins;
        this.store = store;
        this.composer = composer;
        this.timeline = timeline;
        this.layoutRepository = layoutRepository;
        this.em = em;
        this.clock = clock;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    @Override
    public void afterConfirmCancel(VersionRef cancelled) {
        // D-151 — 전문·헤더 모두 먼저 비운다(아래 가드는 전문이면 바로 끝난다)
        columnPins.clear(Long.parseLong(cancelled.objectId()), cancelled.ver());
        long headerId = Long.parseLong(cancelled.objectId());
        Map<Long, Set<LayoutKey>> stackingByMessage = new LinkedHashMap<>();
        for (MdmLayoutHeader h : queries.stacksUsing(headerId)) {
            stackingByMessage.computeIfAbsent(h.getLayoutId(), k -> new LinkedHashSet<>()).add(new LayoutKey(h.getLayoutId(), h.getVer()));
        }
        if (stackingByMessage.isEmpty()) {
            return; // 전문이거나 이 헤더를 쌓은 전문이 없다
        }
        // 공통 엔진은 native UPDATE 로 상태·구간을 바꿨다 — 같은 영속 컨텍스트에 이 헤더 버전 엔티티가 있으면 DB 값으로 다시 읽는다
        em.flush();
        store.versions(headerId).forEach(em::refresh);

        LocalDateTime now = LocalDateTime.now(clock).truncatedTo(ChronoUnit.SECONDS);
        Map<Long, List<MdmLayoutVer>> versions = store.versionsOf(stackingByMessage.keySet());
        List<MdmCheckIssue> issues = new ArrayList<>();
        for (Map.Entry<Long, Set<LayoutKey>> e : stackingByMessage.entrySet()) {
            long messageId = e.getKey();
            List<MdmLayoutVer> candidates = versions.getOrDefault(messageId, List.of()).stream()
                    .filter(v -> v.isReleased() && !v.isLegacySnapshot() && v.getApplyFrom() != null && v.getApplyTo() != null
                            && v.getApplyTo().isAfter(now) && v.getApplyFrom().isBefore(v.getApplyTo())
                            && e.getValue().contains(LayoutKey.of(v)))
                    .toList();
            if (candidates.isEmpty()) {
                continue;
            }
            try {
                timeline.released(messageId);
                continue; // 메타 피드와 같은 기준으로 전 구간이 합성된다
            } catch (BusinessException ignored) {
                // 어느 버전·구간이 깨졌는지 아래에서 찾는다
            }
            for (MdmLayoutVer v : candidates) {
                LocalDateTime brokenAt = firstUncomposable(messageId, v);
                if (brokenAt != null) {
                    issues.add(issue(messageId, v, brokenAt));
                }
            }
        }
        if (!issues.isEmpty()) {
            String detail = String.join(", ", issues.stream().map(MdmCheckIssue::itemKey).toList())
                    + " — 먼저 그 전문 버전의 확정을 취소하세요";
            throw MdmErrors.of(MdmErrorCode.CONFIRM_CANCEL_BREAKS_LAYOUTS, detail, issues);
        }
    }

    /** 이 전문 버전의 구간 시작 시각(적용 시작 + 쌓은 헤더 경계)마다 합성해 처음 깨지는 시각 — 모두 되면 null. */
    private LocalDateTime firstUncomposable(long messageId, MdmLayoutVer v) {
        List<Long> headerIds = queries.headersOf(messageId, v.getVer()).stream().map(MdmLayoutHeader::getHeaderLayoutId).distinct().toList();
        List<LocalDateTime> starts = new ArrayList<>();
        starts.add(v.getApplyFrom());
        starts.addAll(LayoutReleaseTimeline.boundaries(v.getApplyFrom(), v.getApplyTo(), store.versionsOf(headerIds)));
        for (LocalDateTime t : starts) {
            try {
                composer.compose(messageId, v.getVer(), t);
            } catch (BusinessException e) {
                return t;
            }
        }
        return null;
    }

    private MdmCheckIssue issue(long messageId, MdmLayoutVer v, LocalDateTime brokenAt) {
        String name = layoutRepository.findById(messageId).map(MdmLayout::getLayoutName).orElse(String.valueOf(messageId));
        String key = "전문 " + name + "(" + messageId + ") " + VersionNumbers.label(v.getVer());
        return new MdmCheckIssue(LAYOUT_UNCOMPOSABLE, key + " 은(는) " + LayoutTimes.text(brokenAt)
                + " 부터 쌓은 헤더에 확정 버전이 없어 합성되지 않습니다", "LAYOUT_ID", key);
    }
}
