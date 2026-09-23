package com.dongkuk.dmes.mdm.contract.version;

/** DRAFT 소유권(선점·해제·넘기기) 계약 — ADR-0002 D3. 반환값은 갱신 뒤 row_version. 구현 TSK-01-03. */
public interface DraftOwnershipService {

    long acquire(VersionRef draft, long expectedRowVersion, String userId);

    long release(VersionRef draft, long expectedRowVersion, String ownerId);

    long handover(VersionRef draft, long expectedRowVersion, String ownerId, String newOwnerId);
}
