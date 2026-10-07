"use client";
// P-R12 / P-R12b
import { useMemo, useState } from "react";
export default function FormPage() {
  const [form, setForm] = useState<EditForm>(emptyForm);
  const [searchForm, setSearchForm] = useState({ q: "" });
  const [filters, setFilters] = useState<Filters>({});
  const [name, setName] = useState("");
  const [detailForm, setDetailForm] = useState<DetailForm>(initial);
  const columns = useMemo(() => [{ field: "a", cell: () => form.title }], [form]);
  const columnDefs = useMemo<GridColumn[]>(() => makeCols(searchForm), [searchForm, extra]);
  const rows = useMemo(() => data.map((r) => r), [data, form.id]);
  const gridData = useMemo(() => build(searchForm?.q), [searchForm?.q]);
  const cols2 = useMemo<ColDef<Row>[]>(() => build(detailForm), [detailForm]);
  const labels: GridColumn[] = useMemo(() => build(), [detailForm]);
  const other = useMemo(() => [form], [form]);
  const handleChange = (v: string) => { setForm({ ...form, title: v }); };
  const update = useCallback((v: string) => setSearchForm({ q: v }), []);
  return (
    <div>
      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <TextInput value={searchForm.q} onChange={(e) => update(e.target.value)} />
      <Textarea value={name} onChange={(e) => setName(e.target.value)} />
      <NumberInput value={detailForm.n} onChange={handleChange} />
      <Input onChange={() => {}} />
    </div>
  );
}
