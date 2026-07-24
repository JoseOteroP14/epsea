import {
  buildFormDraftKey,
  useSurveyDraftStore,
} from "@/store/useSurveyDraftStore";
import { useCallback, useEffect, useMemo } from "react";

/**
 * Generic in-memory form draft for producer-scoped bottom sheets.
 * Cleared automatically when switching to another producer.
 */
export function useProducerFormDraft<T>(options: {
  producerId: string;
  projectId?: string;
  scope: string;
}) {
  const { producerId, projectId, scope } = options;

  const draftKey = useMemo(
    () => buildFormDraftKey(producerId, projectId, scope),
    [producerId, projectId, scope],
  );

  const setFormDraft = useSurveyDraftStore((s) => s.setFormDraft);
  const getFormDraft = useSurveyDraftStore((s) => s.getFormDraft);
  const clearFormDraft = useSurveyDraftStore((s) => s.clearFormDraft);
  const clearOtherProducers = useSurveyDraftStore((s) => s.clearOtherProducers);

  useEffect(() => {
    clearOtherProducers(String(producerId));
  }, [producerId, clearOtherProducers]);

  const saveDraft = useCallback(
    (payload: T) => {
      setFormDraft(draftKey, payload);
    },
    [setFormDraft, draftKey],
  );

  const readDraft = useCallback((): T | undefined => {
    return getFormDraft<T>(draftKey)?.payload;
  }, [getFormDraft, draftKey]);

  const clearDraft = useCallback(() => {
    clearFormDraft(draftKey);
  }, [clearFormDraft, draftKey]);

  return { draftKey, saveDraft, readDraft, clearDraft };
}
