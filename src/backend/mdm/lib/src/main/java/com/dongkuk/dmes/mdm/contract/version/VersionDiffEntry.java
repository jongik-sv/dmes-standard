package com.dongkuk.dmes.mdm.contract.version;

import java.util.Map;

/**
 * diff 한 행. key 는 04 가 code, 06 이 row_id. ADDED 면 oldValues 가 null, REMOVED 면 newValues 가 null.
 */
public record VersionDiffEntry(String key, DiffKind kind, Map<String, Object> oldValues, Map<String, Object> newValues) {
}
