import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/app";
import { useT } from "@/i18n";
import { message } from "./feedback";

/**
 * Subscribes to selectedInstanceData. When available, calls `initFn` once.
 * Falls back to error toast + navigate to /game after 300ms timeout.
 * Returns current data (undefined until loaded).
 */
export function useWaitForSelectedInstance(
  initFn?: (data: InstanceData) => void | Promise<void>
) {
  const data = useAppStore(s => s.selectedInstanceData);
  const navigate = useNavigate();
  const t = useT();

  const initRef = useRef(initFn);
  initRef.current = initFn;
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    if (data) {
      initializedRef.current = true;
      void initRef.current?.(data);
      return;
    }
    const timeout = setTimeout(() => {
      message.error(t("gameConfig.selectInstance"));
      navigate("/game");
    }, 300);
    return () => clearTimeout(timeout);
  }, [data, navigate, t]);

  return data;
}
