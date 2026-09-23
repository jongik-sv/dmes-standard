package com.dongkuk.dmes.mdm.contract.common;

import java.util.List;

/**
 * 연계 시스템 코드 — {@code TB_MDM_SYSTEM.SYSTEM_CODE} 초기 적재 값(원천 02:764-771, 01:195, spec).
 * V2 마이그레이션 시드와 같아야 한다(T11·T12 가 확인).
 */
public final class MdmSystemCodes {

    public static final String ERP = "ERP";
    public static final String MES = "MES";
    public static final String APS = "APS";
    public static final String DKMS = "DKMS";
    public static final String L2 = "L2";
    public static final String MDM = "MDM";

    /** {@code SELF_YN='Y'} 인 자기 행. */
    public static final String SELF = MDM;

    /** V2 가 적재하는 6행의 코드(순서는 시드 순서). */
    public static final List<String> SEEDED = List.of(ERP, MES, APS, DKMS, L2, MDM);

    private MdmSystemCodes() {
    }
}
