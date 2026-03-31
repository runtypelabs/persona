import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Paintbrush,
  Route,
  ShieldCheck,
  Wand2
} from "lucide-react";

import {
  demoFeatureProofs,
  demoSecurityNotes,
  demoSourceData
} from "@/lib/demo-data";
import { demoRoutes } from "@/lib/demo-routes";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

const featureIcons = [Route, Wand2, ShieldCheck, Paintbrush] as const;

export default function Home() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Card className="overflow-hidden border-none bg-slate-950 text-white shadow-[0_40px_120px_-60px_rgba(15,23,42,0.9)]">
        <CardContent className="grid gap-8 p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
          <div className="space-y-5">
            <Badge className="bg-white/10 text-sky-200" variant="info">
              Four product behaviors in one demo
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white">
                Persona can move through your app, call safe local tools, gate
                sensitive actions with approval, and still look native.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-300">
                Ask Persona to open the demo form, fill it from the visible
                source data on this page, and then request form submission.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href={demoRoutes.demo_form.path}
                className={buttonVariants({ variant: "default" })}
              >
                Open demo form
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Button variant="secondary" disabled>
                Chat state will persist across the route change
              </Button>
            </div>
          </div>

          <div className="grid gap-3 rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-medium text-white">Suggested prompts</p>
              <div className="mt-3 space-y-3 text-sm leading-6 text-slate-300">
                <p>Open the demo form.</p>
                <p>Fill the form from the visible source data.</p>
                <p>Submit the form.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Security model
              </p>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">
                {demoSecurityNotes.map((note) => (
                  <li key={note} className="flex gap-2">
                    <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-300" />
                    <span>{note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
            What this demo proves
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            The assistant is embedded into a real app shell, not a standalone
            chat page.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {demoFeatureProofs.map((proof, index) => {
            const Icon = featureIcons[index];

            return (
              <Card key={proof.title} className="h-full">
                <CardHeader className="space-y-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <CardTitle>{proof.title}</CardTitle>
                    <CardDescription>{proof.description}</CardDescription>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Visible source data</CardTitle>
            <CardDescription>
              Persona should read these exact values on this page, then use
              them to prefill the form on the next route.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Project name
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {demoSourceData.projectName}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Contact email
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {demoSourceData.contactEmail}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Launch date
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {demoSourceData.launchDate}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Region
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {demoSourceData.region}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Channels
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {demoSourceData.channels.map((channel) => (
                  <Badge key={channel} variant="info">
                    {channel}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Summary
              </p>
              <p className="mt-2 text-sm leading-7 text-slate-700">
                {demoSourceData.summary}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What stays constrained</CardTitle>
            <CardDescription>
              The overview route is intentionally simple so the security story
              is easy to inspect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <p>
              Navigation only works through the two route IDs in the capability
              manifest.
            </p>
            <p>
              The form page exposes six AI-writable fields and two manual-only
              fields that the local patcher will reject.
            </p>
            <p>
              Submission is a real local tool on the form page, but it always
              pauses on Persona&apos;s built-in approval UI before the local app
              state changes.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
