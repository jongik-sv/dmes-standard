package com.dongkuk.dmes.cactus.mdm;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;

/** MDM metaFeed 두 action(spec §3.4) — 운영은 {@link MdmMetaClient}(HTTP), 시험은 가짜 구현. 실패는 {@link MdmUnavailableException}. */
public interface MdmMetaFeed {

    /** search — 순번 {@code since} 뒤의 변경을 {@code limit} 개까지. */
    MdmChanges changes(long since, int limit);

    /** view — 대상 종류 하나의 키 묶음. 없는 키는 결과에 없다. */
    MdmFetchResult fetch(MdmTargetType type, Collection<String> keys);

    /**
     * 목차(D-154) — {@code at} 이 있으면 그 시각의 본문도 함께 받는다. 기본 구현은 옛 MDM 과 같다: {@link #fetch} 의 전 이력을 {@code legacy} 로 준다
     * (fetch 만 구현한 시험 가짜·옛 구현이 그대로 돈다).
     */
    default MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        return MdmTocResult.legacy(fetch(type, keys));
    }

    /** 본문(D-154) — (정의 키, ver) 쌍 묶음. 기본 구현은 정의 키로 {@link #fetch} 한 전 이력을 {@code legacy} 로 준다. */
    default MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        Set<String> asked = new LinkedHashSet<>();
        keys.forEach(k -> asked.add(k.key()));
        return MdmBodyResult.legacy(fetch(type, asked), asked);
    }
}
