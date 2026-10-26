import { createContext, useContext } from "react";

export type SubmitFn = (actionId: string, result: unknown) => void;

export const SubmitState = createContext<{ pending: string | null; error: string | null }>({ pending: null, error: null });

export const useSubmitState = () => useContext(SubmitState);
