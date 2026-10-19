import { Workspace } from "./components/workspace";

export const dynamic = "force-dynamic";
export default function Page() {
  return <Workspace liveAvailable={process.env.EVE_MODE === "live"} />;
}
