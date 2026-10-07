export default function Page() {
  return <div>{rows.length > 0 && (<AgDataGrid rows={rows} />)}</div>;
}
