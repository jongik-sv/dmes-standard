package com.dongkuk.dmes.mdm.contract.common;

/**
 * 검사 결과 한 건(공통 응답 DTO, design.md D7). cactus {@code ErrorDetail} 로 옮길 수 있는 모양이다.
 * field·itemKey 는 null 허용.
 */
public record MdmCheckIssue(String code, String message, String field, String itemKey) {
}
