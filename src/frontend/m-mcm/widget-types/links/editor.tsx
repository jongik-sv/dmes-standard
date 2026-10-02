"use client";

/**
 * 링크 모음 편집기(스펙 §6) — 항목 추가·삭제·위아래 이동, 종류(포털 화면·웹 주소) 고르기.
 * - 포털 화면은 내 메뉴(secUser/myMenusTree — 사이드바와 같은 조회)에서 검색해 고른다. 메뉴를 못 받거나 비면 pageId 를 직접 쓴다.
 * - 웹 주소는 http(s) 절대 주소만(입력 즉시 표시). 저장 막기는 onValidate(validateLinkItems)가 맡는다.
 */
import { useMemo } from "react";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { Button, ComboBox, Input, Select } from "@dk-oasis/shared/form";
import { usePortalMenu } from "@dk-oasis/shared/portal-shell";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { menuItemPageId } from "@/lib/portal-menu-store";

import { readLinksConfig, type LinksConfig } from "../_content/config";
import { useReportErrors } from "../_content/hooks";
import {
  addLinkItem,
  changeLinkKind,
  flattenMenuPages,
  moveLinkItem,
  removeLinkItem,
  updateLinkItem,
  validateLinkItems,
  type LinkItem,
  type LinkKind,
} from "../_content/links";
import { ContentStyle } from "../_content/styles";
import { WEB_URL_FORMAT_MESSAGE, isHttpUrl } from "../_content/web";

const MENU_ENDPOINT = { endpoint: "/api/mcm/oasis/secUser/myMenusTree" };

const KIND_OPTIONS = [
  { value: "page", label: "포털 화면" },
  { value: "url", label: "웹 주소" },
];

export default function LinksTypeEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const { items } = readLinksConfig(value);
  useReportErrors(validateLinkItems(items), onValidate);

  const { menu, isLoading, errorMessage } = usePortalMenu(MENU_ENDPOINT);
  const pageOptions = useMemo(() => (menu ? flattenMenuPages(menu.items, menuItemPageId) : []), [menu]);
  const manualPage = errorMessage !== null || (!isLoading && pageOptions.length === 0);

  const set = (next: LinkItem[]) => onChange({ items: next } satisfies LinksConfig);
  const setKind = (index: number, kind: LinkKind) =>
    set(items.map((x, i) => (i === index ? changeLinkKind(x, kind) : x)));

  return (
    <div className="mcm-wt-editor" data-testid="widget-type-editor-links">
      <ContentStyle />
      {items.length > 0 && (
        <ol className="mcm-wt-litems">
          {items.map((item, i) => {
            const n = i + 1;
            const url = item.url ?? "";
            return (
              <li key={i} className="mcm-wt-litem">
                <span className="mcm-wt-litem__no">{n}</span>
                <div className="mcm-wt-litem__row">
                  <div className="mcm-wt-litem__kind">
                    <Select
                      value={item.kind}
                      options={KIND_OPTIONS}
                      onChange={(k) => setKind(i, k === "url" ? "url" : "page")}
                      aria-label={`${n}번째 링크 종류`}
                    />
                  </div>
                  <div className="mcm-wt-litem__grow">
                    <Input
                      value={item.label}
                      onChange={(label) => set(updateLinkItem(items, i, { label }))}
                      placeholder="이름"
                      aria-label={`${n}번째 링크 이름`}
                    />
                  </div>
                  <Button
                    size="mini"
                    ariaLabel={`${n}번째 링크 위로`}
                    disabled={i === 0}
                    onClick={() => set(moveLinkItem(items, i, -1))}
                  >
                    <IconArrowUp size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    size="mini"
                    ariaLabel={`${n}번째 링크 아래로`}
                    disabled={i === items.length - 1}
                    onClick={() => set(moveLinkItem(items, i, 1))}
                  >
                    <IconArrowDown size={14} aria-hidden="true" />
                  </Button>
                  <Button size="mini" ariaLabel={`${n}번째 링크 삭제`} onClick={() => set(removeLinkItem(items, i))}>
                    <IconTrash size={14} aria-hidden="true" />
                  </Button>
                </div>
                <div className="mcm-wt-litem__target">
                  {item.kind === "url" ? (
                    <Input
                      type="url"
                      value={url}
                      onChange={(next) => set(updateLinkItem(items, i, { url: next }))}
                      placeholder="https://"
                      spellCheck={false}
                      aria-label={`${n}번째 링크 주소`}
                      error={url.trim() && !isHttpUrl(url) ? WEB_URL_FORMAT_MESSAGE : undefined}
                    />
                  ) : manualPage ? (
                    <Input
                      value={item.pageId ?? ""}
                      onChange={(pageId) => set(updateLinkItem(items, i, { pageId }))}
                      placeholder="화면 ID(예: mls:lsh/noticeMgmt)"
                      spellCheck={false}
                      aria-label={`${n}번째 링크 화면 ID`}
                    />
                  ) : (
                    <ComboBox
                      data={pageOptions}
                      value={item.pageId ?? ""}
                      onChange={(pageId) => set(updateLinkItem(items, i, { pageId }))}
                      placeholder={isLoading ? "메뉴를 불러오는 중입니다" : "화면 검색"}
                      disabled={isLoading}
                      aria-label={`${n}번째 링크 화면`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {manualPage && errorMessage !== null && (
        <div className="mcm-wt-editor__note">메뉴를 불러오지 못해 화면 ID 를 직접 입력합니다.</div>
      )}
      <div>
        <Button size="sm" onClick={() => set(addLinkItem(items))}>
          <IconPlus size={14} aria-hidden="true" /> 링크 추가
        </Button>
      </div>
    </div>
  );
}
