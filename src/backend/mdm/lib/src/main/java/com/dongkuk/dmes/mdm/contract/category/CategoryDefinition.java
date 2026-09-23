package com.dongkuk.dmes.mdm.contract.category;

/** 카테고리 정의 공유 DTO — 04·05. defExpr·defTarget 은 TABLE 이면 null, description 은 null 허용. */
public record CategoryDefinition(String cateId, String cateName, CategoryKind defKind, String defExpr,
                                 CategoryDefTarget defTarget, String description) {
}
