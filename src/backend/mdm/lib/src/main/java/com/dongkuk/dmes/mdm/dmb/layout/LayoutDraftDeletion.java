package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.stereotype.Component;

/**
 * {@code LAYOUT} DRAFT 삭제 훅(D-144 3단계). main 에 정확히 하나여야 공통 {@code VersionStateService.deleteDraft} 가 레이아웃·헤더
 * DRAFT 를 지울 수 있다(fail-closed, VersionSpiRegistry). 객체 ID 는 {@code String.valueOf(LAYOUT_ID)} 다.
 */
@Component
public class LayoutDraftDeletion implements VersionDraftDeletionSpi {

    private final LayoutWriter writer;

    public LayoutDraftDeletion(LayoutWriter writer) {
        this.writer = writer;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.LAYOUT;
    }

    /** 레이아웃 표는 CASCADE 가 없다(V4 불변 11) — 그 버전의 CONST → HEADER → ITEM 을 지운 뒤 공통 서비스가 VER 행을 지운다. */
    @Override
    public void beforeDraftDelete(VersionRef draft) {
        writer.deleteVersionRows(Long.valueOf(draft.objectId()), draft.ver());
    }
}
