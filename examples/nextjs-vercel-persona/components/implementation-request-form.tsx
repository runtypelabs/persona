"use client";

import { CheckCircle2, Lock, Sparkles } from "lucide-react";

import { useAppState } from "@/lib/app-state";
import {
  channelOptions,
  formFieldDefinitions,
  getFormFieldDefinition,
  summarizeImplementationRequestForm,
  type Channel,
  type FormFieldDefinition,
  type FormFieldId
} from "@/lib/implementation-form";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const allowlistedFields = formFieldDefinitions.filter((field) => field.aiWritable);
const manualFields = formFieldDefinitions.filter((field) => !field.aiWritable);

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function renderFieldStatus(fieldId: FormFieldId, status?: "persona" | "human") {
  const definition = getFormFieldDefinition(fieldId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={definition.aiWritable ? "info" : "warning"}>
        {definition.aiWritable ? "AI-fillable" : "Manual-only"}
      </Badge>
      {status === "persona" ? (
        <Badge variant="success">Filled by Persona</Badge>
      ) : null}
      {status === "human" ? <Badge variant="default">Edited manually</Badge> : null}
    </div>
  );
}

function FieldCard({
  definition,
  status,
  children
}: {
  definition: FormFieldDefinition;
  status?: "persona" | "human";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-5 shadow-sm transition-colors",
        definition.aiWritable
          ? "border-sky-200 bg-sky-50/50"
          : "border-amber-200 bg-amber-50/50",
        status === "persona" && "border-emerald-200 bg-emerald-50/70",
        status === "human" && "border-slate-300 bg-slate-50"
      )}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-slate-950">
              {definition.label}
            </h3>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              {definition.description}
            </p>
          </div>
          {renderFieldStatus(definition.id, status)}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ImplementationRequestForm() {
  const { formState, fieldStatus, setFormField, submittedAt } = useAppState();
  const summary = summarizeImplementationRequestForm(formState, submittedAt);

  const toggleChannel = (channel: Channel) => {
    const nextChannels = formState.channels.includes(channel)
      ? formState.channels.filter((entry) => entry !== channel)
      : [...formState.channels, channel];

    setFormField("channels", nextChannels);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {submittedAt ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-emerald-900">
                  Form submitted through the approval-gated local tool
                </p>
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  Persona requested the submit action, approval was granted, and
                  the local app state changed at {formatTimestamp(submittedAt)}.
                </p>
              </div>
            </div>
            <Badge variant="success" className="w-fit">
              Submitted
            </Badge>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-3xl">Demo form</CardTitle>
            <CardDescription className="max-w-2xl">
              This route demonstrates allowlisted local tools in a normal
              shadcn-style form. Persona can write six fields, see two
              manual-only fields for context, and request submission with
              approval.
            </CardDescription>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                AI-filled
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {summary.aiFilledFields.length}/{allowlistedFields.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Manual fields
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {manualFields.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Submit state
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {summary.submittedAt
                  ? "Submitted"
                  : summary.readyToSubmit
                    ? "Ready for approval"
                    : "Waiting on manual fields"}
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowlisted fields</CardTitle>
          <CardDescription>
            Persona can patch only these six fields through the local
            `prefill_form` action.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {allowlistedFields.map((field) => (
            <FieldCard
              key={field.id}
              definition={field}
              status={fieldStatus[field.id]}
            >
              {field.id === "projectName" ? (
                <Input
                  value={formState.projectName}
                  onChange={(event) => setFormField("projectName", event.target.value)}
                  placeholder={field.placeholder}
                />
              ) : null}

              {field.id === "contactEmail" ? (
                <Input
                  type="email"
                  value={formState.contactEmail}
                  onChange={(event) => setFormField("contactEmail", event.target.value)}
                  placeholder={field.placeholder}
                />
              ) : null}

              {field.id === "launchDate" ? (
                <Input
                  type="date"
                  value={formState.launchDate}
                  onChange={(event) => setFormField("launchDate", event.target.value)}
                />
              ) : null}

              {field.id === "region" ? (
                <Select
                  value={formState.region}
                  onChange={(event) =>
                    setFormField("region", event.target.value as typeof formState.region)
                  }
                >
                  <option value="">Select a region</option>
                  {field.options?.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : null}

              {field.id === "channels" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {channelOptions.map((channel) => {
                      const selected = formState.channels.includes(channel);

                      return (
                        <button
                          key={channel}
                          type="button"
                          onClick={() => toggleChannel(channel)}
                          className={cn(
                            "rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                            selected
                              ? "border-sky-600 bg-sky-600 text-white"
                              : "border-slate-300 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50"
                          )}
                        >
                          {channel}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Selected:{" "}
                    {formState.channels.length > 0
                      ? formState.channels.join(", ")
                      : "None"}
                  </p>
                </div>
              ) : null}

              {field.id === "summary" ? (
                <Textarea
                  value={formState.summary}
                  onChange={(event) => setFormField("summary", event.target.value)}
                  placeholder={field.placeholder}
                />
              ) : null}
            </FieldCard>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual-only fields</CardTitle>
          <CardDescription>
            Persona can read these values for context, but `prefill_form` will
            reject attempts to change them.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {manualFields.map((field) => (
            <FieldCard
              key={field.id}
              definition={field}
              status={fieldStatus[field.id]}
            >
              {field.id === "securityApproved" ? (
                <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                  <Checkbox
                    checked={formState.securityApproved}
                    onChange={(event) =>
                      setFormField("securityApproved", event.target.checked)
                    }
                  />
                  Security approval is already recorded for this demo.
                </label>
              ) : null}

              {field.id === "finalApprover" ? (
                <Input
                  value={formState.finalApprover}
                  onChange={(event) => setFormField("finalApprover", event.target.value)}
                  placeholder={field.placeholder}
                />
              ) : null}
            </FieldCard>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardTitle>Submit via chat</CardTitle>
            <CardDescription>
              Ask Persona to submit the form. The `submit_form` local tool will
              appear in chat, then pause on the built-in approval UI before the
              local app state changes.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="info">Visible tool calls</Badge>
            <Badge variant="warning">Approval required</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Ready now
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {summary.readyToSubmit ? "Yes" : "No"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Pending AI fields
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {summary.pendingAiFields.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Manual blockers
            </p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">
              {summary.missingManualFieldIds.length}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Widget theme
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Sparkles className="h-4 w-4 text-sky-600" />
              Matches the host shell
            </p>
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p>
              The manual-only fields are pre-seeded for the demo, so the
              approval-gated submit path is available immediately. If you deny
              approval in chat, the submitted state stays unchanged.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
