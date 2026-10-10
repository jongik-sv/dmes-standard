package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.contract.version.VersionCoEditorSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** ERD_MODEL 공동 편집자 = TB_MDM_ERD_EDITOR 행(스펙 D15). */
@Component
public class ErdCoEditors implements VersionCoEditorSpi {

    private final JdbcTemplate jdbc;

    public ErdCoEditors(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public VersionTarget target() {
        return VersionTarget.ERD_MODEL;
    }

    @Override
    public boolean isCoEditor(VersionRef draft, String userId) {
        Integer n = jdbc.queryForObject(
                "SELECT COUNT(*) FROM TB_MDM_ERD_EDITOR WHERE ERD_MODEL_ID = ? AND VER = ? AND USER_ID = ?",
                Integer.class, draft.objectId(), draft.ver(), userId);
        return n != null && n > 0;
    }
}
