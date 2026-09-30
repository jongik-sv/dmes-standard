/**
 * 항목 편집 화면 [카테고리] 탭의 상태 훅(D-104 — 옛 dataCateEdit 화면 본문의 상태·동작을 옮김, TSK-07-02 design.md §2).
 *
 * 탭 본문은 탭을 바꾸면 사라지므로 이 훅은 page 에서 부르고 CategoryTab·오른쪽 미리보기는 props 만 받는다. 저장 방식은
 * 옛 화면 그대로다 — 등록·닫기·다시 열기·REGEX 저장·TABLE 적용을 dataCateEdit 서비스로 각각 바로 부른다(상단 [저장] 없음).
 *
 * 목록은 탭이 보일 때(`active`) 처음 부르고, 같은 마루 데이터면 탭을 오가도 다시 부르지 않는다(TABLE 에서 옮기고 아직
 * 적용하지 않은 소속이 남는다). 마루 데이터가 바뀌면 바로 비우고 탭이 보일 때 새로 읽는다. 항목을 쓰면 page 가
 * `invalidate` 로 다음 진입 때 다시 읽게 한다(건수·TABLE 후보가 바뀐다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessage } from "@dk-oasis/shared/message-provider";

import {
  closeCategory,
  compareRegex,
  registerCategory,
  reopenCategory,
  saveMembers,
  saveRegex,
  searchCategories,
  viewCategory,
} from "./api";
import { diffMembers } from "./transfer";
import { errorMessage, type CateRow, type CateViewResult, type ComparePreview } from "./types";

export interface DataCategoriesArgs {
  maruDataId: string;
  /** [카테고리] 탭이 보이는 중인지 — 처음 조회 시점. */
  active: boolean;
  onError: (message: string) => void;
  /** 카테고리를 쓴 뒤 — page 가 머리(조회조건 카테고리 목록)를 다시 부른다. */
  onChanged?: () => void;
}

export interface DataCategoriesState {
  /** 지금 읽고 있는 마루 데이터 — 카테고리 이력 조회에 쓴다. */
  maruDataId: string;
  rows: CateRow[];
  lvlCnt: number;
  /** attr01~10 라벨, 번호 순서(라벨 없는 번호는 null) — REGEX 대상 후보의 ATTRnn 번호가 이 위치다. */
  attrLabels: (string | null)[];
  selectedCateId: string | null;
  selectedRow: CateRow | null;
  detail: CateViewResult | null;
  memberCodes: Set<string>;
  preview: ComparePreview | null;
  busy: boolean;
  /** 쓰기가 성공할 때마다 1 씩 는다 — 카테고리 이력 패널이 다시 조회하는 신호. */
  writeCount: number;
  reload: () => Promise<void>;
  invalidate: () => void;
  select: (cateId: string) => void;
  add: (cateId: string, cateName: string, defKind: "REGEX" | "TABLE") => Promise<void>;
  close: (cateId: string) => Promise<void>;
  reopen: (cateId: string) => Promise<void>;
  saveRegex: (cateName: string, defExpr: string, defTarget: string, description: string) => Promise<void>;
  /** REGEX 후보 정의로 미리보기(compare)를 다시 부른다 — 편집 칸이 바뀔 때마다. */
  previewCandidate: (defExpr: string, defTarget: string) => Promise<void>;
  setMemberCodes: (next: Set<string>) => void;
  applyMembers: () => Promise<void>;
}

export function useDataCategories({ maruDataId, active, onError, onChanged }: DataCategoriesArgs): DataCategoriesState {
  const { showMessage } = useMessage();
  const [rows, setRows] = useState<CateRow[]>([]);
  const [lvlCnt, setLvlCnt] = useState(0);
  const [attrLabels, setAttrLabels] = useState<(string | null)[]>([]);
  const [selectedCateId, setSelectedCateId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CateViewResult | null>(null);
  const [memberCodes, setMemberCodes] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ComparePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [writeCount, setWriteCount] = useState(0);

  /** 목록을 읽은 마루 데이터 — 다르면(또는 비우면) 탭이 보일 때 다시 읽는다. */
  const loadedFor = useRef("");
  /** 요청 순번 — 늦게 온 옛 마루 데이터·옛 카테고리 응답을 버린다. */
  const listSeq = useRef(0);
  const detailSeq = useRef(0);
  const previewSeq = useRef(0);
  const current = useRef(maruDataId);
  current.current = maruDataId;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  const fail = useCallback((e: unknown) => errorRef.current(errorMessage(e)), []);

  const runPreview = useCallback(async (md: string, defExpr: string, defTarget: string) => {
    const seq = ++previewSeq.current;
    if (!md || !defExpr || !defTarget) {
      setPreview(null);
      return;
    }
    try {
      const out = await compareRegex(md, defExpr, defTarget);
      if (seq === previewSeq.current) setPreview(out);
    } catch (e) {
      if (seq === previewSeq.current) fail(e);
    }
  }, [fail]);

  const loadDetail = useCallback(async (md: string, cateId: string) => {
    const seq = ++detailSeq.current;
    previewSeq.current++;
    setPreview(null);
    try {
      const out = await viewCategory(md, cateId);
      if (seq !== detailSeq.current) return;
      setDetail(out);
      setMemberCodes(new Set(out.memberCodes ?? []));
      // REGEX 는 저장된 정의로 미리보기를 먼저 채운다 — 편집하면 RegexEditPanel 이 후보값으로 다시 부른다.
      if (out.cate?.defKind === "REGEX" && out.cate.open) {
        void runPreview(md, out.cate.defExpr ?? "", out.cate.defTarget ?? "");
      }
    } catch (e) {
      if (seq === detailSeq.current) fail(e);
    }
  }, [fail, runPreview]);

  /** 목록을 읽고, 고른 카테고리가 아직 있으면 그 상세도 다시 읽는다(keepCateId). */
  const loadList = useCallback(async (md: string, keepCateId: string | null) => {
    const seq = ++listSeq.current;
    loadedFor.current = md;
    setBusy(true);
    try {
      const out = await searchCategories(md);
      if (seq !== listSeq.current) return;
      const list = out.list ?? [];
      setLvlCnt(out.lvlCnt ?? 0);
      setAttrLabels(out.attrLabels ?? []);
      setRows(list);
      const keep = keepCateId && list.some((r) => r.cateId === keepCateId) ? keepCateId : null;
      setSelectedCateId(keep);
      if (keep) await loadDetail(md, keep);
      else {
        detailSeq.current++;
        setDetail(null);
        setPreview(null);
      }
    } catch (e) {
      if (seq === listSeq.current) {
        loadedFor.current = "";
        fail(e);
      }
    } finally {
      if (seq === listSeq.current) setBusy(false);
    }
  }, [fail, loadDetail]);

  // 마루 데이터가 바뀌면 옛 목록을 바로 비운다(탭이 가려져 있어도 — 다시 보일 때 옛 데이터가 한 번 비치지 않게).
  useEffect(() => {
    listSeq.current++;
    detailSeq.current++;
    previewSeq.current++;
    loadedFor.current = "";
    setRows([]);
    setSelectedCateId(null);
    setDetail(null);
    setMemberCodes(new Set());
    setPreview(null);
    setBusy(false);
  }, [maruDataId]);

  useEffect(() => {
    if (active && maruDataId && loadedFor.current !== maruDataId) void loadList(maruDataId, null);
  }, [active, maruDataId, loadList]);

  const selectedRef = useRef(selectedCateId);
  selectedRef.current = selectedCateId;

  const reload = useCallback(async () => {
    if (current.current) await loadList(current.current, selectedRef.current);
  }, [loadList]);

  const invalidate = useCallback(() => {
    loadedFor.current = "";
  }, []);

  const select = useCallback((cateId: string) => {
    setSelectedCateId(cateId);
    void loadDetail(current.current, cateId);
  }, [loadDetail]);

  /** 쓰기 한 건 — 성공하면 알리고 목록·상세를 다시 읽는다. */
  const write = useCallback(async (task: () => Promise<unknown>, done: string, cateId: string) => {
    const md = current.current;
    setBusy(true);
    try {
      await task();
      showMessage({ message: done, toast: true });
      setWriteCount((n) => n + 1);
      changedRef.current?.();
      if (md === current.current) await loadList(md, cateId);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }, [fail, loadList, showMessage]);

  const add = useCallback((cateId: string, cateName: string, defKind: "REGEX" | "TABLE") => {
    const md = current.current;
    return write(() => registerCategory(md, cateId, cateName, defKind, defKind === "REGEX" ? "^.*$" : null,
      defKind === "REGEX" ? "KEY" : null, ""), "등록했습니다", cateId);
  }, [write]);

  const close = useCallback((cateId: string) => {
    const md = current.current;
    return write(() => closeCategory(md, cateId), "닫았습니다", cateId);
  }, [write]);

  const reopen = useCallback((cateId: string) => {
    const md = current.current;
    return write(() => reopenCategory(md, cateId), "다시 열었습니다", cateId);
  }, [write]);

  const saveRegexDef = useCallback(async (cateName: string, defExpr: string, defTarget: string, description: string) => {
    const cateId = selectedRef.current;
    if (!cateId) return;
    const md = current.current;
    await write(() => saveRegex(md, cateId, cateName, defExpr, defTarget, description), "저장했습니다", cateId);
  }, [write]);

  const previewCandidate = useCallback(
    (defExpr: string, defTarget: string) => runPreview(current.current, defExpr, defTarget),
    [runPreview],
  );

  const applyMembers = useCallback(async () => {
    const cateId = selectedRef.current;
    if (!cateId) return;
    const { addCodes, removeCodes } = diffMembers(new Set(detail?.memberCodes ?? []), memberCodes);
    if (addCodes.length === 0 && removeCodes.length === 0) return;
    const md = current.current;
    await write(() => saveMembers(md, cateId, addCodes, removeCodes), "적용했습니다", cateId);
  }, [detail, memberCodes, write]);

  const selectedRow = useMemo(() => rows.find((r) => r.cateId === selectedCateId) ?? null, [rows, selectedCateId]);

  return {
    maruDataId, rows, lvlCnt, attrLabels, selectedCateId, selectedRow, detail, memberCodes, preview, busy, writeCount,
    reload, invalidate, select, add, close, reopen, saveRegex: saveRegexDef, previewCandidate,
    setMemberCodes, applyMembers,
  };
}
