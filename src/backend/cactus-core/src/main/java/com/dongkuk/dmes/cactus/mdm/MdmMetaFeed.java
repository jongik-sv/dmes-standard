package com.dongkuk.dmes.cactus.mdm;

import java.util.Collection;

/** MDM metaFeed 두 action(spec §3.4) — 운영은 {@link MdmMetaClient}(HTTP), 시험은 가짜 구현. 실패는 {@link MdmUnavailableException}. */
public interface MdmMetaFeed {

    /** search — 순번 {@code since} 뒤의 변경을 {@code limit} 개까지. */
    MdmChanges changes(long since, int limit);

    /** view — 대상 종류 하나의 키 묶음. 없는 키는 결과에 없다. */
    MdmFetchResult fetch(MdmTargetType type, Collection<String> keys);
}
