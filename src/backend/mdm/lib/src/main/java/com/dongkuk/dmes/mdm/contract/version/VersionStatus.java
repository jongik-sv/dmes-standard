package com.dongkuk.dmes.mdm.contract.version;

/** 버전 상태 5종 — 원천 04:259-265 순서 그대로. 결재 상태(REQUESTED·APPROVED·CANCELLED)는 상수로만 둔다(PRD §2 규칙 7). */
public enum VersionStatus {
    DRAFT,
    REQUESTED,
    APPROVED,
    RELEASED,
    CANCELLED
}
