package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutHeaderRef;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * 저장 즉시 스냅샷 버전(TSK-05-03 design.md §6.5 — 불변 I15·I16·I18, D4). 레이아웃·헤더 저장과 같은 action(트랜잭션) 안에서 부른다.
 * 스냅샷(버전 번호 제외)이 최신 이력과 같으면 만들지 않는다. 새 번호 = max(최신 이력, {@code TB_MDM_LAYOUT.VERSION}) + 1, 최초 1.
 * 버전을 올리려 전문 행을 다시 저장하므로 감사 VER 도 한 번 더 오른다 — {@link Outcome#ver()} 가 그 마지막 값이다(I16).
 */
@Component
public class LayoutVersioner {

    private final LayoutSnapshotAssembler assembler;
    private final LayoutVersionStore store;
    private final MdmLayoutRepository layoutRepository;
    private final LayoutDictionary dictionary;
    private final LayoutQueries queries;

    public LayoutVersioner(LayoutSnapshotAssembler assembler, LayoutVersionStore store, MdmLayoutRepository layoutRepository,
                           LayoutDictionary dictionary, LayoutQueries queries) {
        this.assembler = assembler;
        this.store = store;
        this.layoutRepository = layoutRepository;
        this.dictionary = dictionary;
        this.queries = queries;
    }

    /** @param ver {@code TB_MDM_LAYOUT} 의 마지막 감사 VER */
    public record Outcome(boolean created, long layoutVersion, String switchMode, String changeSummary, long ver) {
    }

    public Outcome record(Long messageId) {
        MdmLayout layout = layoutRepository.findById(messageId).orElseThrow(() -> LayoutRejections.notFound(messageId, "MESSAGE"));
        MdmLayoutSnapshot next = LayoutSnapshotJson.withVersion(assembler.read(messageId), 0L);
        return record(layout, next, store.latest(messageId), dictionary::byPhysNames);
    }

    /**
     * 전문 여럿을 {@link #record} 와 같은 규칙으로 차례로 기록한다(헤더 저장이 다시 계산한 사용 전문들 — I18). 전문 행·스냅샷 원장·최신 이력은
     * 전문 수와 무관하게 한 번씩 읽고, 컬럼 사전·도메인 파생은 요청 범위 사전 {@code cache} 로 읽는다. 읽기는 호출자의 쓰기(flush)가 끝난
     * 뒤에 하고, 기록 쓰기는 전문마다 넘긴 순서로 한다.
     *
     * @return 넘긴 순서의 결과
     */
    public List<Outcome> recordAll(List<Long> messageIds, LayoutDictionary.Cache cache) {
        if (messageIds.isEmpty()) {
            return List.of();
        }
        Map<Long, MdmLayout> layouts = new HashMap<>();
        for (List<Long> chunk : LayoutQueries.chunks(messageIds)) {
            layoutRepository.findAllById(chunk).forEach(l -> layouts.put(l.getLayoutId(), l));
        }
        Map<Long, MdmLayoutSnapshot> snapshots = assembler.readAll(
                messageIds.stream().distinct().map(layouts::get).filter(Objects::nonNull).toList(), cache);
        Map<Long, MdmLayoutVer> latest = queries.latestVersions(messageIds);
        // 변경 요약에 쓰는 표시명 — 최신 이력에만 있는 물리명까지 한 번에 읽어 둔다.
        List<MdmLayoutSnapshot> prevs = new ArrayList<>();
        latest.values().forEach(v -> prevs.add(LayoutSnapshotJson.read(v.getSnapshotJson())));
        cache.byPhysNames(physNames(prevs.toArray(MdmLayoutSnapshot[]::new)));
        List<Outcome> out = new ArrayList<>(messageIds.size());
        for (Long id : messageIds) {
            MdmLayout layout = layouts.get(id);
            if (layout == null) {
                throw LayoutRejections.notFound(id, "MESSAGE");
            }
            out.add(record(layout, LayoutSnapshotJson.withVersion(snapshots.get(id), 0L), Optional.ofNullable(latest.get(id)),
                    cache::byPhysNames));
        }
        return out;
    }

    private Outcome record(MdmLayout layout, MdmLayoutSnapshot next, Optional<MdmLayoutVer> latest,
                           Function<List<String>, Map<String, LayoutColumnInfo>> columns) {
        Long messageId = layout.getLayoutId();
        MdmLayoutSnapshot prev = latest.map(v -> LayoutSnapshotJson.read(v.getSnapshotJson())).orElse(null);
        if (prev != null && LayoutSnapshotJson.write(next).equals(LayoutSnapshotJson.write(LayoutSnapshotJson.withVersion(prev, 0L)))) {
            MdmLayoutVer v = latest.get();
            return new Outcome(false, v.getLayoutVersion(), v.getSwitchMode(), v.getChangeSummary(), layout.getVersion());
        }
        long n = Math.max(latest.map(MdmLayoutVer::getLayoutVersion).orElse(0L), layout.getLayoutVersion()) + 1;
        Map<String, LayoutColumnInfo> dict = columns.apply(physNames(prev, next));
        LayoutChangeClassifier.Change change = LayoutChangeClassifier.classify(prev, next,
                phys -> dict.containsKey(phys) ? dict.get(phys).displayName() : null);
        MdmLayoutSnapshot stamped = LayoutSnapshotJson.withVersion(next, n);
        MdmLayoutVer row = new MdmLayoutVer(messageId, n);
        row.setTotalLength(stamped.totalLength());
        row.setSwitchMode(change.switchMode());
        row.setChangeKinds(change.kinds().stream().map(Enum::name).collect(Collectors.joining(",")));
        row.setChangeSummary(change.summary());
        row.setSnapshotJson(LayoutSnapshotJson.write(stamped));
        store.save(row);
        layout.setLayoutVersion(n);
        MdmLayout saved = layoutRepository.saveAndFlush(layout);
        return new Outcome(true, n, change.switchMode(), change.summary(), saved.getVersion());
    }

    private static List<String> physNames(MdmLayoutSnapshot... snapshots) {
        List<String> out = new ArrayList<>();
        for (MdmLayoutSnapshot s : snapshots) {
            if (s == null) {
                continue;
            }
            for (MdmLayoutHeaderRef h : s.headers()) {
                h.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(out::add);
            }
            s.items().stream().map(MdmLayoutItemSnapshot::columnPhys).filter(Objects::nonNull).forEach(out::add);
        }
        return out;
    }
}
