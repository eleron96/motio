import * as React from "react";

import { cn } from "@/shared/lib/classNames";
import { Textarea, TextareaProps } from "@/shared/ui/textarea";

/**
 * Textarea whose height follows its content, so a multi-line value stays fully
 * visible instead of hiding behind an inner scrollbar. Manual resizing is off:
 * the next keystroke would overwrite a hand-picked height anyway.
 */
const AutoGrowTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, value, onInput, ...props }, forwardedRef) => {
    const elementRef = React.useRef<HTMLTextAreaElement | null>(null);

    const setRef = React.useCallback((element: HTMLTextAreaElement | null) => {
      elementRef.current = element;
      if (typeof forwardedRef === "function") {
        forwardedRef(element);
      } else if (forwardedRef) {
        forwardedRef.current = element;
      }
    }, [forwardedRef]);

    const fitToContent = React.useCallback(() => {
      const element = elementRef.current;
      if (!element) return;
      element.style.height = "auto";
      // Detached nodes (and jsdom) report 0 — leave the CSS height alone there.
      if (!element.scrollHeight) return;
      // scrollHeight covers padding but not borders, hence the difference.
      const borders = element.offsetHeight - element.clientHeight;
      element.style.height = `${element.scrollHeight + borders}px`;
    }, []);

    // Runs on mount and after every value change, including ones that come
    // from outside typing (a draft prefill, a reset after submit).
    React.useLayoutEffect(fitToContent, [fitToContent, value]);

    return (
      <Textarea
        ref={setRef}
        value={value}
        onInput={(event) => {
          fitToContent();
          onInput?.(event);
        }}
        className={cn("resize-none overflow-hidden", className)}
        {...props}
      />
    );
  },
);
AutoGrowTextarea.displayName = "AutoGrowTextarea";

export { AutoGrowTextarea };
