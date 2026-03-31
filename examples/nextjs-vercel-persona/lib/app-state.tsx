"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { createCapabilityManifest } from "@/lib/chat/action-contract";
import { resolveDemoRoute, type DemoRouteId } from "@/lib/demo-routes";
import {
  applyImplementationRequestPatch,
  createInitialImplementationRequestForm,
  getSubmissionReadiness,
  type FormFieldId,
  type ImplementationRequestFormData,
  type PatchApplicationResult
} from "@/lib/implementation-form";
import type { PersonaBackend } from "@/lib/chat/provider";

type LocalActionResult = {
  kind: "navigate" | "prefill" | "submit" | "blocked";
  summary: string;
  details?: Record<string, unknown>;
  timestamp: string;
};

type NavigateResult =
  | {
      ok: true;
      routeId: DemoRouteId;
      pathname: string;
    }
  | {
      ok: false;
      routeId: string;
      reason: string;
    };

type FieldWriteSource = "persona" | "human";

type SubmitResult =
  | {
      ok: true;
      submittedAt: string;
    }
  | {
      ok: false;
      reason: string;
      missingFieldIds?: FormFieldId[];
    };

type AppStateContextValue = {
  activeBackend: PersonaBackend;
  pathname: string;
  formState: ImplementationRequestFormData;
  fieldStatus: Partial<Record<FormFieldId, FieldWriteSource>>;
  submittedAt: string | null;
  localActionResult: LocalActionResult | null;
  setFormField: (
    fieldId: FormFieldId,
    value: ImplementationRequestFormData[FormFieldId]
  ) => void;
  navigate: (routeId: string) => Promise<NavigateResult>;
  applyFormPatch: (patch: Record<string, unknown>) => PatchApplicationResult;
  submitForm: () => SubmitResult;
  setLocalActionResult: (result: LocalActionResult | null) => void;
  getCapabilities: (pathname: string) => ReturnType<typeof createCapabilityManifest>;
};

const AppStateContext = createContext<AppStateContextValue | null>(null);

export function AppStateProvider({
  activeBackend,
  children
}: {
  activeBackend: PersonaBackend;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [formState, setFormState] = useState(createInitialImplementationRequestForm);
  const [fieldStatus, setFieldStatus] = useState<
    Partial<Record<FormFieldId, FieldWriteSource>>
  >({});
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [localActionResult, setLocalActionResultState] =
    useState<LocalActionResult | null>(null);
  const formStateRef = useRef(formState);
  const submittedAtRef = useRef<string | null>(null);
  const localActionResultRef = useRef<LocalActionResult | null>(null);
  const pendingNavigations = useRef<
    Array<{ targetPath: string; routeId: DemoRouteId; resolve: (result: NavigateResult) => void }>
  >([]);

  useEffect(() => {
    formStateRef.current = formState;
  }, [formState]);

  useEffect(() => {
    localActionResultRef.current = localActionResult;
  }, [localActionResult]);

  useEffect(() => {
    submittedAtRef.current = submittedAt;
  }, [submittedAt]);

  useEffect(() => {
    if (pendingNavigations.current.length === 0) {
      return;
    }

    const matches = pendingNavigations.current.filter(
      (entry) => entry.targetPath === pathname
    );
    if (matches.length === 0) {
      return;
    }

    pendingNavigations.current = pendingNavigations.current.filter(
      (entry) => entry.targetPath !== pathname
    );

    for (const match of matches) {
      match.resolve({
        ok: true,
        routeId: match.routeId,
        pathname
      });
    }
  }, [pathname]);

  const setFormField = (
    fieldId: FormFieldId,
    value: ImplementationRequestFormData[FormFieldId]
  ) => {
    const nextState = {
      ...formStateRef.current,
      [fieldId]: value
    };
    formStateRef.current = nextState;
    setFormState(nextState);
    setFieldStatus((current) => ({
      ...current,
      [fieldId]: "human"
    }));
    setSubmittedAt(null);
  };

  const navigate = async (routeId: string): Promise<NavigateResult> => {
    const nextPath = resolveDemoRoute(routeId);
    if (!nextPath) {
      return {
        ok: false,
        routeId,
        reason: "Unknown route ID"
      };
    }

    if (nextPath === pathname) {
      return {
        ok: true,
        routeId: routeId as DemoRouteId,
        pathname
      };
    }

    return new Promise((resolve) => {
      pendingNavigations.current.push({
        targetPath: nextPath,
        routeId: routeId as DemoRouteId,
        resolve
      });
      router.push(nextPath);
    });
  };

  const applyFormPatch = (patch: Record<string, unknown>) => {
    const result = applyImplementationRequestPatch(formStateRef.current, patch);
    formStateRef.current = result.nextState;
    setFormState(result.nextState);
    if (result.applied.length > 0) {
      setFieldStatus((current) => {
        const next = { ...current };
        for (const entry of result.applied) {
          next[entry.fieldId] = "persona";
        }
        return next;
      });
      setSubmittedAt(null);
    }
    return result;
  };

  const submitForm = (): SubmitResult => {
    if (pathname !== resolveDemoRoute("demo_form")) {
      return {
        ok: false,
        reason: "submit_form is only available on /demo-form."
      };
    }

    const readiness = getSubmissionReadiness(formStateRef.current);
    if (!readiness.ready) {
      return {
        ok: false,
        reason: "Manual review fields must be completed before submission.",
        missingFieldIds: readiness.missingManualFieldIds
      };
    }

    const timestamp = submittedAtRef.current ?? new Date().toISOString();
    setSubmittedAt(timestamp);

    return {
      ok: true,
      submittedAt: timestamp
    };
  };

  const setLocalActionResult = (result: LocalActionResult | null) => {
    localActionResultRef.current = result;
    setLocalActionResultState(result);
  };

  return (
    <AppStateContext.Provider
      value={{
        activeBackend,
        pathname,
        formState,
        fieldStatus,
        submittedAt,
        localActionResult,
        setFormField,
        navigate,
        applyFormPatch,
        submitForm,
        setLocalActionResult,
        getCapabilities: createCapabilityManifest
      }}
    >
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }
  return context;
}
