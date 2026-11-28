package com.dongkuk.dmes.mdm.internal.userOwnership.dto;

import java.util.List;

/** {@code POST /internal/mdm/userOwnership/summary} 본문 — {@code {"users":[{"userId":"u1","empNo":"1234"}]}}. */
public record OwnershipSummaryRequest(List<UserRef> users) {
}
