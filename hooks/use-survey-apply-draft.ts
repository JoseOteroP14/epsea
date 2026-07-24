import {
  buildSurveyDraftKey,
  useSurveyDraftStore,
  type SurveyDraftAnswers,
} from "@/store/useSurveyDraftStore";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

/**
 * In-memory draft for "aplicar encuesta" bottom sheets.
 * Survives accidental sheet close / tab remount for the same producer;
 * drafts from other producers are cleared when producerId changes.
 */
export function useSurveyApplyDraft(options: {
  producerId: string;
  projectId?: string;
  interventionMethodId: number;
  /** When true, drafts are neither written nor restored (survey already saved). */
  hasSurvey: boolean;
}) {
  const { producerId, projectId, interventionMethodId, hasSurvey } = options;

  const draftKey = useMemo(
    () => buildSurveyDraftKey(producerId, projectId, interventionMethodId),
    [producerId, projectId, interventionMethodId],
  );

  const setDraft = useSurveyDraftStore((s) => s.setDraft);
  const getDraft = useSurveyDraftStore((s) => s.getDraft);
  const clearDraft = useSurveyDraftStore((s) => s.clearDraft);
  const clearOtherProducers = useSurveyDraftStore((s) => s.clearOtherProducers);

  const skipDraftPersistRef = useRef(false);
  const answersRef = useRef<SurveyDraftAnswers>({});
  const draftWizardIndexRef = useRef(0);
  const [wizardSessionKey, setWizardSessionKey] = useState(0);
  const [draftWizardIndex, setDraftWizardIndex] = useState(0);

  useEffect(() => {
    clearOtherProducers(String(producerId));
  }, [producerId, clearOtherProducers]);

  const syncAnswersRef = useCallback((answers: SurveyDraftAnswers) => {
    answersRef.current = answers;
  }, []);

  const beginApplySession = useCallback(
    (currentAnswers: SurveyDraftAnswers) => {
      const draft = !hasSurvey ? getDraft(draftKey) : undefined;
      let restored: SurveyDraftAnswers | null = null;
      if (draft && Object.keys(draft.answers).length > 0) {
        restored = draft.answers;
        const idx = Math.max(0, draft.wizardIndex ?? 0);
        draftWizardIndexRef.current = idx;
        setDraftWizardIndex(idx);
      } else {
        draftWizardIndexRef.current = 0;
        setDraftWizardIndex(0);
      }
      setWizardSessionKey((k) => k + 1);
      return restored ?? currentAnswers;
    },
    [hasSurvey, getDraft, draftKey],
  );

  const persistOnClose = useCallback(
    (answers: SurveyDraftAnswers) => {
      if (!hasSurvey && !skipDraftPersistRef.current) {
        setDraft(draftKey, {
          answers,
          wizardIndex: draftWizardIndexRef.current,
        });
      }
      skipDraftPersistRef.current = false;
    },
    [hasSurvey, setDraft, draftKey],
  );

  const markSavedAndSkipPersist = useCallback(() => {
    clearDraft(draftKey);
    skipDraftPersistRef.current = true;
  }, [clearDraft, draftKey]);

  const handleWizardIndexChange = useCallback(
    (index: number) => {
      draftWizardIndexRef.current = index;
      setDraftWizardIndex(index);
      if (!hasSurvey) {
        setDraft(draftKey, {
          answers: answersRef.current,
          wizardIndex: index,
        });
      }
    },
    [hasSurvey, draftKey, setDraft],
  );

  const wrapAnswerChange = useCallback(
    (setAnswers: Dispatch<SetStateAction<Record<number, any>>>) => {
      return (questionId: number, value: any) => {
        setAnswers((prev) => {
          let next: Record<number, any>;
          if (value === undefined) {
            if (prev[questionId] === undefined) return prev;
            next = { ...prev };
            delete next[questionId];
          } else {
            next = { ...prev, [questionId]: value };
          }
          if (!hasSurvey) {
            setDraft(draftKey, {
              answers: next,
              wizardIndex: draftWizardIndexRef.current,
            });
          }
          return next;
        });
      };
    },
    [hasSurvey, draftKey, setDraft],
  );

  return {
    draftKey,
    wizardSessionKey,
    draftWizardIndex,
    syncAnswersRef,
    beginApplySession,
    persistOnClose,
    markSavedAndSkipPersist,
    handleWizardIndexChange,
    wrapAnswerChange,
  };
}
