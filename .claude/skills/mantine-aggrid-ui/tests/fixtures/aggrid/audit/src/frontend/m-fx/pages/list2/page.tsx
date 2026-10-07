import { searchUnits, searchCodes, searchPicks, searchLoad, searchMaster, searchCombo, searchMixed } from "./api";
// 조건 있는 조회 판별(_p_r1_exclusion)
async function searchXxxPicks(kw: string): Promise<IdPickRow[]> {
  return searchPicks(kw);
}
async function searchYyyPicks(kw: string): Promise<IdPickRows[]> {
  const r = await searchPicks(kw);
  return r.slice(0, 20);
}
const searchZzz = async (kw: string): Promise<LvPickRow[]> => {
  return searchPicks2(kw).then((r) => r.slice(0, FIRST_LIMIT));
};
const handlerWithGuard = async (kw: string) => {
  if (!kw) {
    return;
  }
  const list = await searchLoad(kw);
  setRows(list);
};
const handlerWithGuard2 = async (kw: string) => {
  if (kw === "") return;
  await searchLoad(kw);
};
const handlerWithGuardOtherFn = async (kw: string) => {
  if (!kw) return;
};
function unrelated() {
}
  async function inner(kw: string) {
    await searchLoad(kw);
  }
const handlerGuardOther = async (term: string) => {
  if (!kw) return;
  await searchLoad(term);
};
const comboLoad = async () => {
  const r = await searchCombo(x);
  setRoleOptions(r);
  setLoading(false);
};
const comboLoad2 = async () => {
  const r = await searchCombo(y);
  setRows(r);
};
const comboLoad3 = async () => {
  const r = await searchMixed(z);
  setStatusOptions(r);
  setLovBusy(true);
  setCodeOptions(r);
};
const comboLoad4 = async () => {
  const r = await searchMixed(z2);
  setRoleOptions(r);
};
const make = makeUnitSearch((kw) => searchMaster(kw));
export default function Page() {
  return <AgDataGrid data={roleOptions} columns={c} />;
}
