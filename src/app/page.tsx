import { SearchApp } from "@/components/SearchApp";
import { PATCH } from "@/data/ddragon";

export default function Home() {
  return <SearchApp patch={PATCH} />;
}
