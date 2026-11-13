import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { usePageSearch } from "./shell-context";

/** Preserve the real, unsearched frame without stretching rows or fabricating records. */
export function SearchResults({
  as: Element = "div",
  className,
  children,
  id,
  style,
  searchQuery,
}: {
  as?: "div" | "section";
  className?: string;
  children: ReactNode;
  id?: string;
  style?: CSSProperties;
  searchQuery?: string;
}) {
  const headerSearch = usePageSearch();
  const searching = Boolean((searchQuery ?? headerSearch).trim());
  const ref = useRef<HTMLDivElement & HTMLElement>(null);
  const height = useRef(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (searching) {
      node.style.minHeight = `${height.current || 320}px`;
      node.style.alignContent = "start";
      return;
    }
    node.style.removeProperty("min-height");
    node.style.removeProperty("align-content");
    const measure = () => {
      height.current = node.getBoundingClientRect().height;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [searching]);

  return (
    <Element ref={ref} id={id} className={className} style={style} data-search-results="">
      {children}
    </Element>
  );
}
