"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMaintenanceStatus, MaintenanceStatusState } from "@/lib/deployment/maintenance-status";

type MaintenanceCheckState = {
  data: MaintenanceStatusState | null;
  loading: boolean;
  lastChecked: Date | null;
  lastUpdated: Date | null;
  // False whenever `data` was carried over from a previous successful
  // fetch rather than confirmed by the most recent one (the most recent
  // fetch errored, e.g. offline or a timeout). The status page uses this
  // to label what it's showing as "last known" rather than presenting
  // stale maintenance state as a live result. This is never true while
  // `data` is null.
  isDataLive: boolean;
};

const TIMEOUT_MS = 10_000;

export function useMaintenanceStatus(pollIntervalMs = 30_000) {
  const [state, setState] = useState<MaintenanceCheckState>({
    data: null,
    loading: true,
    lastChecked: null,
    lastUpdated: null,
    isDataLive: false,
  });

  const controllerRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    // A stale request's own completion (success or failure) must never be
    // allowed to overwrite state a newer request already set. Every branch
    // below checks this before calling setState, rather than relying on
    // AbortController alone — abort() only guarantees the fetch signal
    // fires; it does not guarantee every environment rejects the fetch
    // promise before a competing response resolves.
    const isCurrent = () => controllerRef.current === controller;

    setState((prev) => ({ ...prev, loading: true }));

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const clearTimeoutIfActive = () => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error("Request timed out"));
      }, TIMEOUT_MS);
    });

    try {
      const fetchPromise = (async () => {
        return await fetchMaintenanceStatus(controller.signal);
      })();

      const statusData = await Promise.race([fetchPromise, timeout]);

      clearTimeoutIfActive();

      if (!isCurrent()) {
        return;
      }

      const now = new Date();

      setState({
        data: statusData,
        loading: false,
        lastChecked: now,
        lastUpdated: now,
        isDataLive: true,
      });
    } catch (err: unknown) {
      clearTimeoutIfActive();

      if (!isCurrent()) {
        return;
      }

      if (controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          loading: false,
          lastChecked: new Date(),
          isDataLive: false,
        }));
        return;
      }

      // On error, create a fallback unavailable state
      const unavailableState: MaintenanceStatusState = {
        status: "unavailable",
        reason:
          err instanceof Error ? err.message : "Could not reach maintenance status endpoint.",
      };

      setState((prev) => ({
        ...prev,
        loading: false,
        data: unavailableState,
        lastChecked: new Date(),
        isDataLive: false,
      }));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(fetchStatus, 0);

    const interval = setInterval(fetchStatus, pollIntervalMs);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      controllerRef.current?.abort();
    };
  }, [fetchStatus, pollIntervalMs]);

  return { ...state, refetch: fetchStatus };
}
