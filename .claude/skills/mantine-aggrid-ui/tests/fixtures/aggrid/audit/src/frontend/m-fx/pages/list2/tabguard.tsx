export function P() {
	const load = async (kw: string) => {
		if (!kw) {
			return;
		}
		const r = await searchTabbed(kw);
	};
  return <AgDataGrid />;
}
import { searchTabbed } from "./api";
