import { Workspace } from "./components/workspace";

export const dynamic = "force-dynamic";

export default function Page() {
  return <Workspace liveAvailable={Boolean(process.env.OPENAI_API_KEY)} />;
}
