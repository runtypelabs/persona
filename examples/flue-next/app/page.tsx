import { ReleaseWorkspace } from "./components/release-workspace";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <ReleaseWorkspace
      liveAvailable={Boolean(
        process.env.FLUE_AGENT_URL && process.env.FLUE_TOKEN
      )}
    />
  );
}
